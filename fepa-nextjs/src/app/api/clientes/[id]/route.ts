import { NextRequest, NextResponse } from 'next/server'
import { sb, dbToCliente, clienteToDb } from '@/lib/supabase'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await sb().from('clientes').select('*').eq('id', params.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(dbToCliente(data))
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body   = await req.json()
  const dbData = clienteToDb(body)

  const { data, error } = await sb()
    .from('clientes').update(dbData).eq('id', params.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(dbToCliente(data))
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  // Soft delete: marcar inactivo en vez de borrar
  const { error } = await sb()
    .from('clientes').update({ activo: false }).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
