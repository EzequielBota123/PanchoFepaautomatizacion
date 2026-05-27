import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CTB_API_KEY  = process.env.CTB_API_KEY!
const CTB_PROXY    = process.env.CTB_PROXY_URL || ''
const CTB_BASE     = 'https://app.contabilium.com/api'

async function ctbFetch(path: string, opts: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = CTB_PROXY
    ? `${CTB_PROXY}${path}${sep}api_key=${CTB_API_KEY}`
    : `${CTB_BASE}${path}${sep}api_key=${CTB_API_KEY}`

  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`CTB ${res.status}`)
  return res.json()
}

// POST /api/sync — sincronizar con Contabilium
export async function POST(req: NextRequest) {
  try {
    const results = { clientes: 0, facturas: 0, errors: [] as string[] }

    // ── Sync clientes ──
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const data = await ctbFetch(`/web/clientes?condicion=&page=${page}&pageSize=100`)
        const items = data?.Items || data?.items || []
        if (!items.length) { hasMore = false; break }

        for (const c of items) {
          const nombre = c.RazonSocial || c.razonSocial || c.Nombre || ''
          if (!nombre) continue

          // Buscar si ya existe
          const { data: existing } = await sb()
            .from('clientes')
            .select('id, deuda')
            .ilike('nombre', nombre)
            .limit(1)
            .single()

          const clienteData = {
            nombre,
            cuit:         c.NroDocumento || c.nroDocumento || '',
            cond_iva:     c.CondicionIVA || c.condicionIva || '',
            mail:         c.Email || c.email || '',
            tel:          c.Telefono || c.telefono || '',
            zona:         c.Provincia || c.provincia || '',
            ctb_id:       c.Id || c.id || null,
            updated_at:   new Date().toISOString(),
          }

          if (existing) {
            await sb().from('clientes').update(clienteData).eq('id', existing.id)
          } else {
            const { data: last } = await sb().from('clientes').select('id').order('id', { ascending: false }).limit(1)
            const newId = last && last.length > 0 ? last[0].id + 1 : 1
            await sb().from('clientes').insert({ ...clienteData, id: newId })
          }
          results.clientes++
        }

        page++
        if (items.length < 100) hasMore = false
      }
    } catch (e: unknown) {
      results.errors.push(`Clientes: ${(e as Error).message}`)
    }

    // ── Sync facturas (últimos 365 días) ──
    try {
      let page = 1, hasMore = true
      while (hasMore) {
        const data = await ctbFetch(`/web/comprobantes?condicion=&periodo=365&fechaDesde=&fechaHasta=&page=${page}&pageSize=100`)
        const items = data?.Items || data?.items || []
        if (!items.length) { hasMore = false; break }

        for (const f of items) {
          const nro = f.Numero || f.numero || f.NroComprobante || ''

          const { data: existing } = await sb()
            .from('facturas')
            .select('id')
            .eq('nro', nro)
            .limit(1)
            .single()

          const factData = {
            nro,
            cliente_nombre: f.RazonSocial || f.razonSocial || f.NombreCliente || '',
            importe:        f.Total || f.total || 0,
            fecha:          f.Fecha?.split('T')[0] || f.fecha || null,
            vto:            f.FechaVencimiento?.split('T')[0] || f.vto || null,
            estado:         f.Estado === 2 ? 'pagada' : 'pendiente',
            obs:            f.Observaciones || '',
            ctb_id:         f.Id || f.id || null,
            cond_venta:     f.CondicionVenta || f.condicionVenta || '',
            updated_at:     new Date().toISOString(),
          }

          if (existing) {
            await sb().from('facturas').update(factData).eq('id', existing.id)
          } else {
            const { data: last } = await sb().from('facturas').select('id').order('id', { ascending: false }).limit(1)
            const newId = last && last.length > 0 ? last[0].id + 1 : 1
            await sb().from('facturas').insert({ ...factData, id: newId })
          }
          results.facturas++
        }

        page++
        if (items.length < 100) hasMore = false
      }
    } catch (e: unknown) {
      results.errors.push(`Facturas: ${(e as Error).message}`)
    }

    return NextResponse.json(results)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
