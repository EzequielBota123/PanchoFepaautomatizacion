import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = sb()
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')

  let query = supabase.from('comprobantes_nc_nd').select('*').eq('tipo', 'NC').order('fecha', { ascending: false })
  if (cliente_id) query = query.eq('cliente_id', cliente_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = sb()
  const body = await req.json()

  const { data: last } = await supabase
    .from('comprobantes_nc_nd')
    .select('nro')
    .eq('tipo', 'NC')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const nextNro = last?.nro
    ? String(Number(last.nro.replace(/\D/g, '')) + 1).padStart(8, '0')
    : '00000001'

  const { data, error } = await supabase
    .from('comprobantes_nc_nd')
    .insert([{
      nro:               nextNro,
      tipo:              'NC',
      punto_venta:       Number(body.punto_venta || 1),
      factura_origen_id: body.factura_origen_id || null,
      cliente_id:        body.cliente_id || null,
      cliente_nombre:    body.cliente_nombre || '',
      fecha:             body.fecha || new Date().toISOString().split('T')[0],
      total:             Number(body.total || 0),
      motivo:            body.motivo || '',
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
