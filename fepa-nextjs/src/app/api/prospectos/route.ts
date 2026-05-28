import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

export async function GET() {
  const supabase = sb()
  const { data, error } = await supabase
    .from('prospectos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = sb()
  const body = await req.json()
  const { data, error } = await supabase
    .from('prospectos')
    .insert([{
      nombre:    body.nombre   || '',
      zona:      body.zona     || '',
      tel:       body.tel      || '',
      potencial: Number(body.potencial || 0),
      vendedor:  body.vendedor || '',
      etapa:     body.etapa    || 'contacto',
      notas:     body.notas    || '',
    }])
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
