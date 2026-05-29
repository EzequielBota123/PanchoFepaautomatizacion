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
    .from('presupuestos')
    .select('*, items_presupuesto(*)')
    .order('created_at', { ascending: false })

  if (estado)     q = q.eq('estado', estado)
  if (cliente_id) q = q.eq('cliente_id', cliente_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { items, ...presup } = body

  const { data: np, error } = await sb()
    .from('presupuestos')
    .insert(presup)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items?.length) {
    const rows = items.map((it: Record<string, unknown>) => ({ ...it, presupuesto_id: np.id }))
    await sb().from('items_presupuesto').insert(rows)
  }

  const { data: full } = await sb()
    .from('presupuestos')
    .select('*, items_presupuesto(*)')
    .eq('id', np.id)
    .single()

  return NextResponse.json(full, { status: 201 })
}
