import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const estado     = searchParams.get('estado')
  const cliente_id = searchParams.get('cliente_id')

  let q = sb()
    .from('remitos')
    .select('*, items_remito(*)')
    .order('fecha', { ascending: false })

  if (estado)     q = q.eq('estado', estado)
  if (cliente_id) q = q.eq('cliente_id', cliente_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { items, ...remito } = body

  const { data: nr, error } = await sb()
    .from('remitos')
    .insert(remito)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items?.length) {
    const rows = items.map((it: Record<string, unknown>) => ({ ...it, remito_id: nr.id }))
    await sb().from('items_remito').insert(rows)
  }

  const { data: full } = await sb()
    .from('remitos')
    .select('*, items_remito(*)')
    .eq('id', nr.id)
    .single()

  return NextResponse.json(full, { status: 201 })
}
