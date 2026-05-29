import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const estado       = searchParams.get('estado')
  const proveedor_id = searchParams.get('proveedor_id')

  let q = sb()
    .from('compras')
    .select('*, items_compra(*)')
    .order('fecha', { ascending: false })

  if (estado)       q = q.eq('estado', estado)
  if (proveedor_id) q = q.eq('proveedor_id', proveedor_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { items, ...compra } = body

  const { data: nc, error } = await sb()
    .from('compras')
    .insert(compra)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items?.length) {
    const rows = items.map((it: Record<string, unknown>) => ({ ...it, compra_id: nc.id }))
    await sb().from('items_compra').insert(rows)
  }

  const { data: full } = await sb()
    .from('compras')
    .select('*, items_compra(*)')
    .eq('id', nc.id)
    .single()

  return NextResponse.json(full, { status: 201 })
}
