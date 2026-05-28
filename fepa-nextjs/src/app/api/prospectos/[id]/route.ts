import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = sb()
  const body = await req.json()
  const { data, error } = await supabase
    .from('prospectos')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const supabase = sb()
  const { error } = await supabase.from('prospectos').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
