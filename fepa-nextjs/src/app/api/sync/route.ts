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
      grant_type:    'client_credentials',
      client_id:     CTB_CLIENT_ID,
      client_secret: CTB_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Auth: ${await res.text()}`)
  const data      = await res.json()
  const expiresIn = data.expires_in || 3600
  cachedToken     = { token: data.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 }
  return cachedToken.token
}

async function ctbGet(path: string) {
  const token = await getToken()
  const res   = await fetch(`${CTB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`CTB ${res.status} ${path}: ${await res.text()}`)
  return res.json()
}

// Pagina automáticamente usando la estructura {Items, TotalPage} de Contabilium
async function paginateSearch(path: string, extraParams = '') {
  const all = []
  let page  = 1
  while (true) {
    const data  = await ctbGet(`${path}&page=${page}&pageSize=100${extraParams}`)
    const items = data?.Items || data?.items || []
    if (!items.length) break
    all.push(...items)
    page++
    if (page > (data.TotalPage || 1)) break
  }
  return all
}

// Parsea "540.000,00" → 540000
function parseMoney(val: string | number): number {
  if (typeof val === 'number') return val
  if (!val) return 0
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0
}

// Parsea "27/05/2026" → "2026-05-27"
function parseDate(val: string): string | null {
  if (!val) return null
  const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (val.includes('T')) return val.split('T')[0]
  return val || null
}

// ── POST /api/sync ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!CTB_CLIENT_ID || !CTB_CLIENT_SECRET) {
    return NextResponse.json({ error: 'CTB_CLIENT_ID y CTB_CLIENT_SECRET no configuradas' }, { status: 400 })
  }

  let modulos: string[] = ['clientes', 'ordenes', 'proveedores']
  try { const b = await req.json(); if (b.modulos) modulos = b.modulos } catch { /* sin body */ }

  const results: Record<string, number> = {}
  const errors: string[] = []

  // ── CLIENTES ──────────────────────────────────────────────
  if (modulos.includes('clientes')) {
    try {
      const items = await paginateSearch('/api/clientes/Search?razonSocial=')
      let count   = 0
      for (const c of items) {
        const nombre = (c.RazonSocial || '').trim()
        if (!nombre) continue
        const ctb_id = c.Id
        const row = {
          razon_social: nombre,
          cuit:         c.NroDoc || c.NroDocumento || '',
          cond_iva:     mapCondIva(c.CondicionIva || c.CondicionIVA || ''),
          email:        c.Email || '',
          telefono:     c.Telefono || '',
          direccion:    c.Domicilio || '',
          ciudad:       c.Ciudad || '',
          provincia:    c.Provincia || '',
          ctb_id,
          activo:       true,
        }
        const { data: ex } = await sb().from('clientes').select('id').eq('ctb_id', ctb_id).maybeSingle()
        if (ex) {
          await sb().from('clientes').update(row).eq('id', ex.id)
        } else {
          const { data: exN } = await sb().from('clientes').select('id').ilike('razon_social', nombre).maybeSingle()
          if (exN) await sb().from('clientes').update({ ctb_id }).eq('id', exN.id)
          else await sb().from('clientes').insert(row)
        }
        count++
      }
      results.clientes = count
    } catch (e: unknown) { errors.push(`Clientes: ${(e as Error).message}`) }
  }

  // ── ÓRDENES DE VENTA ──────────────────────────────────────
  if (modulos.includes('ordenes')) {
    try {
      const hoy  = new Date().toISOString().split('T')[0]
      const hace1 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
      const items = await paginateSearch(
        `/api/OrdenesVenta/Search?razonSocial=&fechaDesde=${hace1}&fechaHasta=${hoy}`
      )
      let count = 0
      for (const o of items) {
        const ctb_id = o.ID
        const nro    = o.NumeroOrden || String(ctb_id)
        const total  = parseMoney(o.Total)
        const estado = mapEstadoOV(o.Estado || '')
        const fecha  = parseDate(o.FechaCreacion)

        const row = {
          nro,
          cliente_nombre: (o.Comprador || '').trim(),
          fecha:          fecha || new Date().toISOString().split('T')[0],
          total,
          subtotal:       total,
          estado,
          obs:            o.Observaciones || '',
          vendedor:       o.Vendedor || '',
          ctb_id,
        }

        const { data: ex } = await sb().from('ordenes_venta').select('id').eq('ctb_id', ctb_id).maybeSingle()
        if (ex) {
          await sb().from('ordenes_venta').update(row).eq('id', ex.id)
        } else {
          const { data: exN } = await sb().from('ordenes_venta').select('id').eq('nro', nro).maybeSingle()
          if (exN) await sb().from('ordenes_venta').update({ ctb_id, estado, total }).eq('id', exN.id)
          else await sb().from('ordenes_venta').insert(row)
        }
        count++
      }
      results.ordenes = count
    } catch (e: unknown) { errors.push(`Órdenes: ${(e as Error).message}`) }
  }

  // ── PROVEEDORES ─────────────────────────────────────────────
  if (modulos.includes('proveedores')) {
    try {
      const items = await paginateSearch('/api/proveedores/Search?razonSocial=')
      let count   = 0
      for (const p of items) {
        const nombre = (p.RazonSocial || p.Nombre || '').trim()
        if (!nombre) continue
        const ctb_id = p.Id
        const row = {
          razon_social: nombre,
          cuit:         p.NroDoc || p.NroDocumento || '',
          email:        p.Email || '',
          telefono:     p.Telefono || '',
          direccion:    p.Domicilio || '',
          ciudad:       p.Ciudad || '',
          provincia:    p.Provincia || '',
          cond_iva:     mapCondIva(p.CondicionIva || ''),
          ctb_id,
          activo:       true,
        }
        const { data: ex } = await sb().from('proveedores').select('id').eq('ctb_id', ctb_id).maybeSingle()
        if (ex) await sb().from('proveedores').update(row).eq('id', ex.id)
        else await sb().from('proveedores').insert(row)
        count++
      }
      results.proveedores = count
    } catch (e: unknown) { errors.push(`Proveedores: ${(e as Error).message}`) }
  }

  return NextResponse.json({ ok: true, results, errors, synced_at: new Date().toISOString() })
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

function mapCondIva(raw: string): string {
  const r = raw.toUpperCase()
  if (r === 'RI') return 'Responsable Inscripto'
  if (r === 'M' || r === 'MT') return 'Monotributista'
  if (r === 'EX') return 'Exento'
  if (r === 'CF') return 'Consumidor Final'
  return raw || 'Responsable Inscripto'
}

function mapEstadoOV(raw: string): string {
  const r = raw.toLowerCase()
  if (r.includes('finaliz') || r.includes('factur')) return 'facturada_total'
  if (r.includes('parcial')) return 'facturada_parcial'
  if (r.includes('anul') || r.includes('cancel')) return 'anulada'
  return 'pendiente'
}
