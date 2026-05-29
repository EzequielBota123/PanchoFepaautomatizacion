import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const CTB_BASE = 'https://rest.contabilium.com'
let cachedToken: { token: string; expiresAt: number } | null = null

async function getToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token
  const res = await fetch(`${CTB_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.CTB_CLIENT_ID || '',
      client_secret: process.env.CTB_CLIENT_SECRET || '',
    }),
  })
  const data = await res.json()
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cachedToken.token
}

// GET /api/ordenes/[id]/detalle — trae ítems de Contabilium
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { data: ov } = await sb()
    .from('ordenes_venta')
    .select('*, clientes(razon_social,cuit,email,telefono,whatsapp,ciudad,provincia,cond_iva,metodo_pago,limite_credito,saldo_deudor)')
    .eq('id', params.id)
    .single()

  if (!ov) return NextResponse.json({ error: 'OV no encontrada' }, { status: 404 })

  let ctbDetalle = null
  if (ov.ctb_id && (process.env.CTB_CLIENT_ID || process.env.CTB_API_KEY)) {
    try {
      const token = await getToken()
      const res   = await fetch(`${CTB_BASE}/api/OrdenesVenta/GetById?id=${ov.ctb_id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) ctbDetalle = await res.json()
    } catch { /* sin detalle CTB */ }
  }

  return NextResponse.json({ ov, ctbDetalle })
}
