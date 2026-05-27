import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

// GET /api/ordenes
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const estado    = searchParams.get('estado')
  const clienteId = searchParams.get('cliente_id')

  let query = sb()
    .from('ordenes_venta')
    .select('*')
    .order('created_at', { ascending: false })

  if (estado)    query = query.eq('estado', estado)
  if (clienteId) query = query.eq('cliente_id', clienteId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST /api/ordenes
export async function POST(req: NextRequest) {
  const body = await req.json()

  const { count } = await sb()
    .from('ordenes_venta')
    .select('*', { count: 'exact', head: true })
  const n   = (count || 0) + 1
  const nro = body.nro || `OV-${String(n).padStart(5, '0')}`

  const insert: Record<string, unknown> = {
    nro,
    cliente_id:     body.cliente_id     ?? null,
    cliente_nombre: body.cliente_nombre ?? '',
    fecha:          body.fecha          ?? new Date().toISOString().split('T')[0],
    fecha_entrega:  body.fecha_entrega  ?? null,
    deposito_id:    body.deposito_id    ?? null,
    estado:         body.estado         ?? 'pendiente',
    subtotal:       Number(body.subtotal ?? body.total ?? 0),
    descuento:      Number(body.descuento ?? 0),
    total:          Number(body.total ?? body.subtotal ?? 0),
    obs:            body.obs            ?? '',
    vendedor:       body.vendedor       ?? '',
  }

  const { data, error } = await sb()
    .from('ordenes_venta')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
