import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/cuenta-corriente/[clienteId]
// Returns all movements (facturas + cobros + NC) for a client with running balance
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const clienteId = Number(params.id)

  const [facturasRes, cobranzasRes, ncRes] = await Promise.all([
    sb()
      .from('facturas')
      .select('id, nro, fecha, total, estado, obs')
      .eq('cliente_id', clienteId)
      .order('fecha'),
    sb()
      .from('cobranzas')
      .select('id, fecha, monto, metodo, referencia, obs')
      .eq('cliente_id', clienteId)
      .order('fecha'),
    sb()
      .from('comprobantes_nc_nd')
      .select('id, nro, tipo, fecha, total, motivo')
      .eq('cliente_id', clienteId)
      .order('fecha'),
  ])

  type Mov = {
    id: number
    tipo: string
    fecha: string
    descripcion: string
    debe: number
    haber: number
    saldo: number
    ref_id: number
  }

  const movimientos: Mov[] = []

  for (const f of (facturasRes.data || [])) {
    movimientos.push({
      id:          f.id,
      tipo:        'factura',
      fecha:       f.fecha,
      descripcion: `Factura ${f.nro}${f.obs ? ' — ' + f.obs : ''}`,
      debe:        f.total,
      haber:       0,
      saldo:       0,
      ref_id:      f.id,
    })
  }

  for (const c of (cobranzasRes.data || [])) {
    movimientos.push({
      id:          c.id,
      tipo:        'cobro',
      fecha:       c.fecha,
      descripcion: `Cobro ${c.metodo}${c.referencia ? ' — ' + c.referencia : ''}`,
      debe:        0,
      haber:       c.monto,
      saldo:       0,
      ref_id:      c.id,
    })
  }

  for (const nc of (ncRes.data || [])) {
    movimientos.push({
      id:          nc.id,
      tipo:        nc.tipo === 'NC' ? 'nc' : 'nd',
      fecha:       nc.fecha,
      descripcion: `${nc.tipo} ${nc.nro}${nc.motivo ? ' — ' + nc.motivo : ''}`,
      debe:        nc.tipo === 'ND' ? nc.total : 0,
      haber:       nc.tipo === 'NC' ? nc.total : 0,
      saldo:       0,
      ref_id:      nc.id,
    })
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha))

  let saldo = 0
  for (const m of movimientos) {
    saldo += m.debe - m.haber
    m.saldo = saldo
  }

  const { data: cliente } = await sb()
    .from('clientes')
    .select('razon_social, saldo_deudor, limite_credito')
    .eq('id', clienteId)
    .single()

  return NextResponse.json({ cliente, movimientos })
}
