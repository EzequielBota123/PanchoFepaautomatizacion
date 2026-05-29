import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb()
    .from('presupuestos')
    .select('*, items_presupuesto(*)')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { items, ...presup } = body

  const { data, error } = await sb()
    .from('presupuestos')
    .update(presup)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items !== undefined) {
    await sb().from('items_presupuesto').delete().eq('presupuesto_id', params.id)
    if (items.length) {
      const rows = items.map((it: Record<string, unknown>) => ({ ...it, presupuesto_id: Number(params.id) }))
      await sb().from('items_presupuesto').insert(rows)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await sb().from('presupuestos').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// POST /api/presupuestos/[id] with action=convertir → create factura
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { action } = await req.json()
  if (action !== 'convertir') return NextResponse.json({ error: 'acción inválida' }, { status: 400 })

  const { data: p, error: pe } = await sb()
    .from('presupuestos')
    .select('*, items_presupuesto(*)')
    .eq('id', params.id)
    .single()
  if (pe) return NextResponse.json({ error: pe.message }, { status: 404 })

  const facturaData = {
    nro:            p.nro,
    tipo:           'B',
    punto_venta:    1,
    cliente_id:     p.cliente_id,
    cliente_nombre: p.cliente_nombre,
    fecha:          new Date().toISOString().split('T')[0],
    subtotal:       p.subtotal,
    iva_21:         p.subtotal * 0.21,
    total:          p.total,
    cond_venta:     p.cond_venta,
    obs:            p.obs,
    vendedor:       p.vendedor,
    estado:         'pendiente',
  }

  const { data: f, error: fe } = await sb()
    .from('facturas')
    .insert(facturaData)
    .select()
    .single()

  if (fe) return NextResponse.json({ error: fe.message }, { status: 400 })

  if (p.items_presupuesto?.length) {
    const itemsF = p.items_presupuesto.map((it: Record<string, unknown>) => ({
      factura_id:      f.id,
      producto_id:     it.producto_id,
      descripcion:     it.descripcion,
      cantidad:        it.cantidad,
      precio_unitario: it.precio_unitario,
      descuento_pct:   it.descuento_pct,
      subtotal:        it.subtotal,
      alicuota_iva:    21,
    }))
    await sb().from('items_factura').insert(itemsF)
  }

  await sb()
    .from('presupuestos')
    .update({ estado: 'convertido', factura_id: f.id })
    .eq('id', params.id)

  return NextResponse.json({ factura: f }, { status: 201 })
}
