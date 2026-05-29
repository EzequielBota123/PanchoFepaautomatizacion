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
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CTB_CLIENT_ID, client_secret: CTB_CLIENT_SECRET }),
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

async function fetchPage(path: string, page: number) {
  const sep  = path.includes('?') ? '&' : '?'
  const data = await ctbGet(`${path}${sep}page=${page}&pageSize=100`)
  return { items: data?.Items || data?.items || [], totalPages: data?.TotalPage || 1 }
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
export async function POST(req: NextRequest) {
  if (!CTB_CLIENT_ID || !CTB_CLIENT_SECRET) {
    return NextResponse.json({ error: 'CTB_CLIENT_ID y CTB_CLIENT_SECRET no configuradas' }, { status: 400 })
  }

  let modulo = 'clientes', page = 1
  try {
    const b = await req.json()
    modulo  = b.modulo || b.modulos?.[0] || 'clientes'
    page    = b.page || 1
    if (b.modulos && !b.modulo) return syncAll(b.modulos)
  } catch { /* sin body */ }

  return syncPage(modulo, page)
}

async function syncAll(modulos: string[]) {
  const results: Record<string, number> = {}
  const errors: string[] = []
  for (const mod of modulos) {
    try {
      let total = 0, pg = 1
      while (true) {
        const { count, totalPages } = await syncPageData(mod, pg)
        total += count
        if (pg >= totalPages || pg >= 10) break
        pg++
      }
      results[mod] = total
    } catch (e: unknown) { errors.push(`${mod}: ${(e as Error).message}`) }
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
    if (toInsert.length) await sb().from('clientes').insert(toInsert)
    for (let i = 0; i < toUpdate.length; i += 10) {
      await Promise.all(toUpdate.slice(i, i + 10).map(({ id, row }) => sb().from('clientes').update(row).eq('id', id)))
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
    const { data: existing } = await sb().from('ordenes_venta').select('id,nro').in('nro', nros)
    const existMap = new Map((existing || []).map((r: { id: number; nro: string }) => [r.nro, r.id]))

    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: number; row: Record<string, unknown> }[] = []

    for (const o of items) {
      const nro   = o.NumeroOrden || String(o.ID)
      const total = parseMoney(o.Total)
      const row   = {
        nro,
        cliente_nombre:      (o.Comprador || '').trim(),
        fecha:               parseDate(o.FechaCreacion) || new Date().toISOString().split('T')[0],
        total,
        subtotal:            total,
        estado:              mapEstadoOV(o.Estado || ''),
        obs:                 o.Observaciones || '',
        vendedor:            o.Vendedor || '',
        ctb_id:              o.ID,
        ctb_persona_id:      o.IDPersona || null,
        ctb_comprobante_id:  o.IDComprobante || null,
      }
      const existId = existMap.get(nro)
      if (existId) toUpdate.push({ id: existId, row })
      else toInsert.push(row)
    }

    if (toInsert.length) await sb().from('ordenes_venta').insert(toInsert)
    for (let i = 0; i < toUpdate.length; i += 10) {
      await Promise.all(toUpdate.slice(i, i + 10).map(({ id, row }) => sb().from('ordenes_venta').update(row).eq('id', id)))
    }

    // Link cliente_id por ctb_persona_id ↔ clientes.ctb_id (solo en última página)
    if (page === totalPages) {
      const { data: ovs } = await sb()
        .from('ordenes_venta')
        .select('id, ctb_persona_id')
        .is('cliente_id', null)
        .not('ctb_persona_id', 'is', null)
        .limit(500)

      if (ovs?.length) {
        const personaIds = [...new Set(ovs.map(o => o.ctb_persona_id))]
        const { data: clts } = await sb().from('clientes').select('id, ctb_id').in('ctb_id', personaIds)
        const cltMap = new Map((clts || []).map(c => [c.ctb_id, c.id]))
        const links = ovs.filter(o => cltMap.has(o.ctb_persona_id))
        for (let i = 0; i < links.length; i += 20) {
          await Promise.all(
            links.slice(i, i + 20).map(o =>
              sb().from('ordenes_venta').update({ cliente_id: cltMap.get(o.ctb_persona_id) }).eq('id', o.id)
            )
          )
        }
      }
    }

    return { count: items.length, totalPages }
  }

  // ── FACTURAS (desde IDComprobante de OVs) ───────────────────
  if (modulo === 'facturas') {
    // Tomar OVs con ctb_comprobante_id que no están aún en facturas
    const offset = (page - 1) * 20
    const { data: ovs, count: total } = await sb()
      .from('ordenes_venta')
      .select('id, ctb_comprobante_id, cliente_id, cliente_nombre', { count: 'exact' })
      .not('ctb_comprobante_id', 'is', null)
      .gt('ctb_comprobante_id', 0)
      .range(offset, offset + 19)

    if (!ovs?.length) return { count: 0, totalPages: 1 }

    const totalPages = Math.ceil((total || 0) / 20) || 1
    let count = 0

    for (const ov of ovs) {
      try {
        const { data: existing } = await sb()
          .from('facturas')
          .select('id')
          .eq('ctb_id', ov.ctb_comprobante_id)
          .maybeSingle()
        if (existing) { count++; continue }

        const ctbF = await ctbGet(`/api/comprobantes/GetById?id=${ov.ctb_comprobante_id}`)
        if (!ctbF?.Numero) { count++; continue }

        const totalNeto = parseMoney(ctbF.ImporteTotalNeto)
        const neto      = parseMoney(ctbF.ImporteTotalBruto)
        const iva21     = totalNeto - neto

        await sb().from('facturas').upsert({
          nro:            ctbF.Numero,
          tipo:           ctbF.TipoFc?.includes('A') ? 'A' : ctbF.TipoFc?.includes('C') ? 'C' : 'B',
          punto_venta:    ctbF.PuntoVenta || 1,
          cliente_id:     ov.cliente_id,
          cliente_nombre: ctbF.RazonSocial || ov.cliente_nombre || '',
          fecha:          ctbF.FechaEmision?.split('T')[0] || new Date().toISOString().split('T')[0],
          fecha_vto:      ctbF.FechaVencimiento?.split('T')[0] || null,
          subtotal:       neto,
          iva_21:         iva21 > 0 ? iva21 : 0,
          total:          totalNeto,
          cae:            ctbF.Cae || '',
          estado:         parseMoney(ctbF.Saldo) > 0 ? 'pendiente' : 'cobrada',
          obs:            ctbF.Observaciones || '',
          cond_venta:     ctbF.CondicionVenta || '',
          ctb_id:         ov.ctb_comprobante_id,
        }, { onConflict: 'ctb_id' })
        count++
      } catch { count++ }
    }

    return { count, totalPages }
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
        razon_social: nombre, cuit: p.NroDoc || p.NroDocumento || '',
        email: p.Email || '', telefono: p.Telefono || '',
        direccion: p.Domicilio || '', ciudad: p.Ciudad || '',
        provincia: p.Provincia || '', cond_iva: mapCondIva(p.CondicionIva || ''),
        ctb_id: p.Id, activo: true,
      }
      const existId = existMap.get(p.Id)
      if (existId) toUpdate.push({ id: existId, row })
      else toInsert.push(row)
    }
    if (toInsert.length) await sb().from('proveedores').insert(toInsert)
    for (let i = 0; i < toUpdate.length; i += 10) {
      await Promise.all(toUpdate.slice(i, i + 10).map(({ id, row }) => sb().from('proveedores').update(row).eq('id', id)))
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
