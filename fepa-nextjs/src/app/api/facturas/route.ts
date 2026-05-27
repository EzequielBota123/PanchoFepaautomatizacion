import { NextRequest, NextResponse } from 'next/server'
import { sb, dbToFactura, facturaToDb } from '@/lib/supabase'

// GET /api/facturas
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const estado     = searchParams.get('estado')
  const clienteId  = searchParams.get('cliente_id')
  const tipo       = searchParams.get('tipo')

  let query = sb().from('facturas').select('*').order('fecha', { ascending: false })

  if (estado)    query = query.eq('estado', estado)
  if (clienteId) query = query.eq('cliente_id', clienteId)
  if (tipo)      query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map(dbToFactura))
}

// POST /api/facturas
export async function POST(req: NextRequest) {
  const body   = await req.json()
  const dbData = facturaToDb(body)

  // Auto-generar nro si no viene
  if (!dbData.nro) {
    const { count } = await sb()
      .from('facturas')
      .select('*', { count: 'exact', head: true })
    const n = (count || 0) + 1
    const pv = String(dbData.punto_venta || 1).padStart(4, '0')
    dbData.nro = `${pv}-${String(n).padStart(8, '0')}`
  }

  const { data, error } = await sb()
    .from('facturas')
    .insert(dbData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(dbToFactura(data), { status: 201 })
}
