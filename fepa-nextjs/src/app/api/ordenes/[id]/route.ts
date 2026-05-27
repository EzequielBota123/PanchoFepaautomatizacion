import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

// GET /api/ordenes/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb()
    .from('ordenes_venta')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/ordenes/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()

  const dbData: Record<string, unknown> = {}
  const fields = ['cliente_id','cliente_nombre','total','subtotal','descuento',
                  'fecha','fecha_entrega','deposito_id','estado','obs','vendedor']
  for (const f of fields) {
    if (body[f] !== undefined) dbData[f] = body[f]
  }

  const { data, error } = await sb()
    .from('ordenes_venta')
    .update(dbData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/ordenes/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await sb().from('ordenes_venta').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
