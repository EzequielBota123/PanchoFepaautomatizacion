import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CTB_API_KEY = process.env.CTB_API_KEY || ''
const CTB_PROXY   = process.env.CTB_PROXY_URL || ''
const CTB_BASE    = 'https://app.contabilium.com/api'

async function ctbFetch(path: string, opts: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = CTB_PROXY
    ? `${CTB_PROXY}${path}${sep}api_key=${CTB_API_KEY}`
    : `${CTB_BASE}${path}${sep}api_key=${CTB_API_KEY}`
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`CTB ${res.status}: ${await res.text()}`)
  return res.json()
}

async function paginateAll(path: string) {
  const results = []
  let page = 1
  while (true) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await ctbFetch(`${path}${sep}page=${page}&pageSize=100`)
    // Contabilium puede devolver el array directamente o dentro de Items/Data
    const items = Array.isArray(data)
      ? data
      : data?.Items || data?.items || data?.Data || data?.data || data?.results || []
    if (!items.length) break
    results.push(...items)
    page++
    if (items.length < 100) break
  }
  return results
}

// POST /api/sync
export async function POST(req: NextRequest) {
  if (!CTB_API_KEY) {
    return NextResponse.json({ error: 'CTB_API_KEY no configurada' }, { status: 400 })
  }

  let modulos: string[] = ['clientes', 'facturas', 'presupuestos', 'proveedores', 'remitos']
  try {
    const body = await req.json()
    if (body.modulos) modulos = body.modulos
  } catch { /* no body */ }

  const results: Record<string, number | string> = {}
  const errors: string[] = []

  // ── CLIENTES ──────────────────────────────────────────────
  if (modulos.includes('clientes')) {
    try {
      const items = await paginateAll('/clientes?condicion=')
      let count = 0
      for (const c of items) {
        const nombre = c.RazonSocial || c.razonSocial || c.Nombre || ''
        if (!nombre) continue
        const ctb_id = c.Id || c.id
        const clienteData = {
          razon_social:  nombre,
          cuit:          c.NroDocumento || c.nroDocumento || '',
          cond_iva:      c.CondicionIVA || c.condicionIva || 'Responsable Inscripto',
          email:         c.Email || c.email || '',
          telefono:      c.Telefono || c.telefono || '',
          direccion:     c.Domicilio || c.domicilio || '',
          ciudad:        c.Localidad || c.localidad || '',
          provincia:     c.Provincia || c.provincia || '',
          ctb_id,
        }
        const { data: ex } = await sb().from('clientes').select('id').eq('ctb_id', ctb_id).limit(1).maybeSingle()
        if (ex) {
          await sb().from('clientes').update(clienteData).eq('id', ex.id)
        } else {
          const { data: exNombre } = await sb().from('clientes').select('id').ilike('razon_social', nombre).limit(1).maybeSingle()
          if (exNombre) {
            await sb().from('clientes').update({ ...clienteData }).eq('id', exNombre.id)
          } else {
            await sb().from('clientes').insert({ ...clienteData, activo: true })
          }
        }
        count++
      }
      results.clientes = count
    } catch (e: unknown) {
      errors.push(`Clientes: ${(e as Error).message}`)
    }
  }

  // ── FACTURAS / COMPROBANTES ────────────────────────────────
  if (modulos.includes('facturas')) {
    try {
      const items = await paginateAll('/comprobantes?condicion=&periodo=365')
      let count = 0
      for (const f of items) {
        const nro    = f.Numero || f.numero || f.NroComprobante || ''
        const ctb_id = f.Id || f.id
        if (!nro) continue
        const factData = {
          nro,
          tipo:           f.Tipo === 1 ? 'A' : f.Tipo === 6 ? 'B' : 'C',
          cliente_nombre: f.RazonSocial || f.razonSocial || '',
          fecha:          f.Fecha?.split('T')[0] || f.fecha || null,
          fecha_vto:      f.FechaVencimiento?.split('T')[0] || null,
          total:          f.Total || f.total || 0,
          subtotal:       (f.Total || 0) / 1.21,
          iva_21:         (f.Total || 0) - (f.Total || 0) / 1.21,
          estado:         f.Estado === 2 ? 'cobrada' : 'pendiente',
          obs:            f.Observaciones || f.observaciones || '',
          cond_venta:     f.CondicionVenta || f.condicionVenta || '',
          ctb_id,
        }
        const { data: ex } = await sb().from('facturas').select('id').eq('ctb_id', ctb_id).limit(1).maybeSingle()
        if (ex) {
          await sb().from('facturas').update(factData).eq('id', ex.id)
        } else {
          const { data: exNro } = await sb().from('facturas').select('id').eq('nro', nro).limit(1).maybeSingle()
          if (exNro) {
            await sb().from('facturas').update({ ...factData }).eq('id', exNro.id)
          } else {
            await sb().from('facturas').insert({ ...factData, punto_venta: 1 })
          }
        }
        count++
      }
      results.facturas = count
    } catch (e: unknown) {
      errors.push(`Facturas: ${(e as Error).message}`)
    }
  }

  // ── PRESUPUESTOS ────────────────────────────────────────────
  if (modulos.includes('presupuestos')) {
    try {
      const items = await paginateAll('/presupuestos?condicion=')
      let count = 0
      for (const p of items) {
        const ctb_id = p.Id || p.id
        const nro    = String(p.Numero || p.numero || ctb_id)
        const pData = {
          nro,
          cliente_nombre: p.RazonSocial || p.razonSocial || '',
          fecha:          p.Fecha?.split('T')[0] || null,
          fecha_vto:      p.FechaVencimiento?.split('T')[0] || null,
          total:          p.Total || p.total || 0,
          subtotal:       p.Subtotal || p.subtotal || 0,
          estado:         mapEstadoPresup(p.Estado || p.estado),
          obs:            p.Observaciones || '',
          ctb_id,
        }
        const { data: ex } = await sb().from('presupuestos').select('id').eq('ctb_id', ctb_id).limit(1).maybeSingle()
        if (ex) {
          await sb().from('presupuestos').update(pData).eq('id', ex.id)
        } else {
          await sb().from('presupuestos').insert(pData).select().single()
        }
        count++
      }
      results.presupuestos = count
    } catch (e: unknown) {
      errors.push(`Presupuestos: ${(e as Error).message}`)
    }
  }

  // ── PROVEEDORES ─────────────────────────────────────────────
  if (modulos.includes('proveedores')) {
    try {
      const items = await paginateAll('/proveedores?condicion=')
      let count = 0
      for (const p of items) {
        const ctb_id = p.Id || p.id
        const nombre = p.RazonSocial || p.razonSocial || p.Nombre || ''
        if (!nombre) continue
        const pData = {
          razon_social: nombre,
          cuit:         p.NroDocumento || p.nroDocumento || '',
          email:        p.Email || p.email || '',
          telefono:     p.Telefono || p.telefono || '',
          direccion:    p.Domicilio || p.domicilio || '',
          ciudad:       p.Localidad || p.localidad || '',
          provincia:    p.Provincia || p.provincia || '',
          cond_iva:     p.CondicionIVA || 'Responsable Inscripto',
          ctb_id,
        }
        const { data: ex } = await sb().from('proveedores').select('id').eq('ctb_id', ctb_id).limit(1).maybeSingle()
        if (ex) {
          await sb().from('proveedores').update(pData).eq('id', ex.id)
        } else {
          await sb().from('proveedores').insert({ ...pData, activo: true })
        }
        count++
      }
      results.proveedores = count
    } catch (e: unknown) {
      errors.push(`Proveedores: ${(e as Error).message}`)
    }
  }

  // ── REMITOS ─────────────────────────────────────────────────
  if (modulos.includes('remitos')) {
    try {
      const items = await paginateAll('/remitos?condicion=')
      let count = 0
      for (const r of items) {
        const ctb_id = r.Id || r.id
        const nro    = String(r.Numero || r.numero || ctb_id)
        const rData = {
          nro,
          cliente_nombre: r.RazonSocial || r.razonSocial || '',
          fecha:          r.Fecha?.split('T')[0] || null,
          estado:         r.Estado === 2 ? 'entregado' : 'pendiente',
          obs:            r.Observaciones || '',
          ctb_id,
        }
        const { data: ex } = await sb().from('remitos').select('id').eq('ctb_id', ctb_id).limit(1).maybeSingle()
        if (ex) {
          await sb().from('remitos').update(rData).eq('id', ex.id)
        } else {
          await sb().from('remitos').insert(rData).select().single()
        }
        count++
      }
      results.remitos = count
    } catch (e: unknown) {
      errors.push(`Remitos: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, results, errors, synced_at: new Date().toISOString() })
}

// GET /api/sync — test connection
export async function GET() {
  if (!CTB_API_KEY) return NextResponse.json({ connected: false, error: 'Sin API key' })
  // URL base pendiente de confirmar con Contabilium
  return NextResponse.json({ connected: false, error: 'Endpoint pendiente de configuración — consultá la documentación de Contabilium' })
}

function mapEstadoPresup(raw: number | string) {
  if (typeof raw === 'number') {
    if (raw === 2) return 'aceptado'
    if (raw === 3) return 'rechazado'
    if (raw === 4) return 'convertido'
    if (raw === 5) return 'vencido'
    if (raw === 1) return 'enviado'
  }
  return 'borrador'
}
