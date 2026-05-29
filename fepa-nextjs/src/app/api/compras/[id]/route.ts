import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb()
    .from('compras')
    .select('*, items_compra(*)')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { items, ...compra } = body

  const { data, error } = await sb()
    .from('compras')
    .update(compra)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items !== undefined) {
    await sb().from('items_compra').delete().eq('compra_id', params.id)
    if (items.length) {
      const rows = items.map((it: Record<string, unknown>) => ({ ...it, compra_id: Number(params.id) }))
      await sb().from('items_compra').insert(rows)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await sb().from('compras').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
