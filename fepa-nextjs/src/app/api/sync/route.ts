import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CTB_CLIENT_ID     = process.env.CTB_CLIENT_ID || process.env.CTB_API_KEY || ''
const CTB_CLIENT_SECRET = process.env.CTB_CLIENT_SECRET || process.env.CTB_API_KEY || ''
const CTB_BASE          = 'https://rest.contabilium.com'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token
  const res = await fetch(`${CTB_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CTB_CLIENT_ID,
      client_secret: CTB_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Auth: ${await res.text()}`)
  const data  = await res.json()
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cachedToken.token
}

async function ctbGet(path: string) {
  const token = await getToken()
  const res   = await fetch(`${CTB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`CTB ${res.status}: ${await res.text()}`)
  return res.json()
}

// Trae UNA sola página de resultados — el cliente decide cuántas páginas pedir
async function fetchPage(path: string, page: number) {
  const sep  = path.includes('?') ? '&' : '?'
  const data = await ctbGet(`${path}${sep}page=${page}&pageSize=100`)
  return {
    items:      data?.Items || data?.items || [],
    totalPages: data?.TotalPage || 1,
  }
}

function parseMoney(val: string | number): number {
  if (typeof val === 'number') return val
  return parseFloat(String(val || 0).replace(/\./g, '').replace(',', '.')) || 0
}

function parseDate(val: string): string | null {
  if (!val) return null
  const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (val.includes('T')) return val.split('T')[0]
  return val || null
}

function mapCondIva(raw: string): string {
  const r = (raw || '').toUpperCase()
  if (r === 'RI') return 'Responsable Inscripto'
  if (r === 'M' || r === 'MT') return 'Monotributista'
  if (r === 'EX') return 'Exento'
  if (r === 'CF') return 'Consumidor Final'
  return raw || 'Responsable Inscripto'
}

function mapEstadoOV(raw: string): string {
  const r = (raw || '').toLowerCase()
  if (r.includes('finaliz') || r.includes('factur')) return 'facturada_total'
  if (r.includes('parcial')) return 'facturada_parcial'
  if (r.includes('anul') || r.includes('cancel')) return 'anulada'
  return 'pendiente'
}

// ── POST /api/sync ────────────────────────────────────────────
// Body: { modulo: 'clientes'|'ordenes'|'proveedores', page: 1 }
// Sincroniza de a UNA página por request para evitar timeout de Vercel
export async function POST(req: NextRequest) {
  if (!CTB_CLIENT_ID || !CTB_CLIENT_SECRET) {
    return NextResponse.json({ error: 'CTB_CLIENT_ID y CTB_CLIENT_SECRET no configuradas' }, { status: 400 })
  }

  let modulo = 'clientes'
  let page   = 1
  try {
    const b  = await req.json()
    modulo   = b.modulo || b.modulos?.[0] || 'clientes'
    page     = b.page || 1
    // Si viene el formato viejo { modulos: [...] }, hacer sync completo en batch pequeños
    if (b.modulos && !b.modulo) {
      return syncAll(b.modulos)
    }
  } catch { /* sin body */ }

  return syncPage(modulo, page)
}

async function syncAll(modulos: string[]) {
  const results: Record<string, number> = {}
  const errors: string[] = []

  for (const mod of modulos) {
    try {
      let total = 0
      let pg    = 1
      while (true) {
        const { count, totalPages } = await syncPageData(mod, pg)
        total += count
        if (pg >= totalPages) break
        pg++
        if (pg > 10) break // máximo 1000 registros por módulo para no hacer timeout
      }
      results[mod] = total
    } catch (e: unknown) {
      errors.push(`${mod}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, results, errors, synced_at: new Date().toISOString() })
}

async function syncPage(modulo: string, page: number) {
  try {
    const { count, totalPages } = await syncPageData(modulo, page)
    return NextResponse.json({ ok: true, modulo, page, count, totalPages, synced_at: new Date().toISOString() })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

async function syncPageData(modulo: string, page: number): Promise<{ count: number; totalPages: number }> {

  // ── CLIENTES ────────────────────────────────────────────────
  if (modulo === 'clientes') {
    const { items, totalPages } = await fetchPage('/api/clientes/Search?razonSocial=', page)
    if (!items.length) return { count: 0, totalPages }

    // 1. Obtener ctb_ids ya existentes (1 query)
    const ctbIds = items.map((c: Record<string, unknown>) => c.Id).filter(Boolean)
    const { data: existing } = await sb().from('clientes').select('id,ctb_id').in('ctb_id', ctbIds)
    const existMap = new Map((existing || []).map((r: { id: number; ctb_id: number }) => [r.ctb_id, r.id]))

    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: number; row: Record<string, unknown> }[] = []

    for (const c of items) {
      const nombre = (c.RazonSocial || '').trim()
      if (!nombre) continue
      const row = {
        razon_social: nombre,
        cuit:         c.NroDoc || c.NroDocumento || '',
        cond_iva:     mapCondIva(c.CondicionIva || c.CondicionIVA || ''),
        email:        c.Email || '',
        telefono:     c.Telefono || '',
        direccion:    c.Domicilio || '',
        ciudad:       c.Ciudad || '',
        provincia:    c.Provincia || '',
        ctb_id:       c.Id,
        activo:       true,
      }
      const existId = existMap.get(c.Id)
      if (existId) toUpdate.push({ id: existId, row })
      else toInsert.push(row)
    }

    // Bulk insert
    if (toInsert.length) await sb().from('clientes').insert(toInsert)

    // Updates en batch de a 10
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10)
      await Promise.all(batch.map(({ id, row }) => sb().from('clientes').update(row).eq('id', id)))
    }

    return { count: items.length, totalPages }
  }

  // ── ÓRDENES DE VENTA ────────────────────────────────────────
  if (modulo === 'ordenes') {
    const hoy   = new Date().toISOString().split('T')[0]
    const hace1 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
    const { items, totalPages } = await fetchPage(
      `/api/OrdenesVenta/Search?razonSocial=&fechaDesde=${hace1}&fechaHasta=${hoy}`, page
    )
    if (!items.length) return { count: 0, totalPages }

    const nros = items.map((o: Record<string, unknown>) => o.NumeroOrden).filter(Boolean)
    const { data: existing } = await sb().from('ordenes_venta').select('id,nro,ctb_id').in('nro', nros)
    const existMap = new Map((existing || []).map((r: { id: number; nro: string; ctb_id: number }) => [r.nro, r.id]))

    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: number; row: Record<string, unknown> }[] = []

    for (const o of items) {
      const nro   = o.NumeroOrden || String(o.ID)
      const total = parseMoney(o.Total)
      const row   = {
        nro,
        cliente_nombre: (o.Comprador || '').trim(),
        fecha:          parseDate(o.FechaCreacion) || new Date().toISOString().split('T')[0],
        total,
        subtotal:       total,
        estado:         mapEstadoOV(o.Estado || ''),
        obs:            o.Observaciones || '',
        vendedor:       o.Vendedor || '',
        ctb_id:         o.ID,
      }
      const existId = existMap.get(nro)
      if (existId) toUpdate.push({ id: existId, row })
      else toInsert.push(row)
    }

    if (toInsert.length) await sb().from('ordenes_venta').insert(toInsert)
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10)
      await Promise.all(batch.map(({ id, row }) => sb().from('ordenes_venta').update(row).eq('id', id)))
    }

    return { count: items.length, totalPages }
  }

  // ── PROVEEDORES ─────────────────────────────────────────────
  if (modulo === 'proveedores') {
    const { items, totalPages } = await fetchPage('/api/proveedores/Search?razonSocial=', page)
    if (!items.length) return { count: 0, totalPages }

    const ctbIds = items.map((p: Record<string, unknown>) => p.Id).filter(Boolean)
    const { data: existing } = await sb().from('proveedores').select('id,ctb_id').in('ctb_id', ctbIds)
    const existMap = new Map((existing || []).map((r: { id: number; ctb_id: number }) => [r.ctb_id, r.id]))

    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: number; row: Record<string, unknown> }[] = []

    for (const p of items) {
      const nombre = (p.RazonSocial || p.Nombre || '').trim()
      if (!nombre) continue
      const row = {
        razon_social: nombre,
        cuit:         p.NroDoc || p.NroDocumento || '',
        email:        p.Email || '',
        telefono:     p.Telefono || '',
        direccion:    p.Domicilio || '',
        ciudad:       p.Ciudad || '',
        provincia:    p.Provincia || '',
        cond_iva:     mapCondIva(p.CondicionIva || ''),
        ctb_id:       p.Id,
        activo:       true,
      }
      const existId = existMap.get(p.Id)
      if (existId) toUpdate.push({ id: existId, row })
      else toInsert.push(row)
    }

    if (toInsert.length) await sb().from('proveedores').insert(toInsert)
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10)
      await Promise.all(batch.map(({ id, row }) => sb().from('proveedores').update(row).eq('id', id)))
    }

    return { count: items.length, totalPages }
  }

  return { count: 0, totalPages: 1 }
}

// ── GET /api/sync — probar conexión ──────────────────────────
export async function GET() {
  if (!CTB_CLIENT_ID) return NextResponse.json({ connected: false, error: 'Sin credenciales' })
  try {
    await getToken()
    return NextResponse.json({ connected: true })
  } catch (e: unknown) {
    return NextResponse.json({ connected: false, error: (e as Error).message })
  }
}
