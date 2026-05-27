import { NextRequest, NextResponse } from 'next/server'
import { sb, dbToCliente, clienteToDb } from '@/lib/supabase'

// GET /api/clientes
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q        = searchParams.get('q')
  const zona     = searchParams.get('zona')
  const vendedor = searchParams.get('vendedor')
  const activo   = searchParams.get('activo')

  let query = sb().from('clientes').select('*').order('razon_social')

  if (q)      query = query.or(`razon_social.ilike.%${q}%,cuit.ilike.%${q}%`)
  if (zona)   query = query.eq('zona', zona)
  if (vendedor) query = query.eq('vendedor', vendedor)
  if (activo !== null) query = query.eq('activo', activo !== 'false')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map(dbToCliente))
}

// POST /api/clientes
export async function POST(req: NextRequest) {
  const body    = await req.json()
  const dbData  = clienteToDb(body)

  const { data, error } = await sb()
    .from('clientes')
    .insert(dbData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(dbToCliente(data), { status: 201 })
}
