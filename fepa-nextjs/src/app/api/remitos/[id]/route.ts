import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb()
    .from('remitos')
    .select('*, items_remito(*)')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { items, ...remito } = body

  const { data, error } = await sb()
    .from('remitos')
    .update(remito)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items !== undefined) {
    await sb().from('items_remito').delete().eq('remito_id', params.id)
    if (items.length) {
      const rows = items.map((it: Record<string, unknown>) => ({ ...it, remito_id: Number(params.id) }))
      await sb().from('items_remito').insert(rows)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await sb().from('remitos').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
