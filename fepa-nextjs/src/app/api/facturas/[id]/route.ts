import { NextRequest, NextResponse } from 'next/server'
import { sb, dbToFactura, facturaToDb } from '@/lib/supabase'

// GET /api/facturas/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb()
    .from('facturas')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(dbToFactura(data))
}

// PATCH /api/facturas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body   = await req.json()
  const dbData = facturaToDb(body)

  const { data, error } = await sb()
    .from('facturas')
    .update(dbData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const factura = dbToFactura(data)

  // Si se marca como cobrada y tiene cliente, actualizar saldo_deudor del cliente
  if (body.estado === 'cobrada' && factura.cliente_id) {
    const { data: cliente } = await sb()
      .from('clientes')
      .select('saldo_deudor')
      .eq('id', factura.cliente_id)
      .single()

    if (cliente) {
      const nuevoSaldo = Math.max(0, Number(cliente.saldo_deudor) - factura.total)
      await sb()
        .from('clientes')
        .update({ saldo_deudor: nuevoSaldo })
        .eq('id', factura.cliente_id)
    }
  }

  return NextResponse.json(factura)
}

// DELETE /api/facturas/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await sb()
    .from('facturas')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
