import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

interface Message { role: 'user' | 'assistant'; content: string }

async function buildCtx() {
  const supabase = sb()
  const hoy = new Date().toISOString().split('T')[0]

  const [{ data: clientes }, { data: facturas }] = await Promise.all([
    supabase.from('clientes').select('razon_social,saldo_deudor,limite_credito,zona,vendedor').eq('activo', true),
    supabase.from('facturas').select('cliente_nombre,nro,total,fecha_vto,estado'),
  ])

  const c = clientes || []
  const f = facturas || []

  const deudaTotal = c.reduce((s: number, x: Record<string, number>) => s + Number(x.saldo_deudor || 0), 0)
  const pendientes = f.filter((x: Record<string, string>) => x.estado === 'pendiente')
  const vencidas   = pendientes.filter((x: Record<string, string>) => {
    if (!x.fecha_vto) return false
    return new Date(x.fecha_vto) < new Date(hoy)
  })

  const topDeudores = [...c]
    .sort((a: Record<string, number>, b: Record<string, number>) => Number(b.saldo_deudor) - Number(a.saldo_deudor))
    .slice(0, 10)
    .map((x: Record<string, unknown>) => `  ${x.razon_social} | Saldo: $${Number(x.saldo_deudor || 0).toLocaleString('es-AR')} | Zona: ${x.zona || '?'} | Vendedor: ${x.vendedor || '?'}`)
    .join('\n')

  const detVencidas = vencidas.slice(0, 8)
    .map((x: Record<string, string>) => `  ${x.cliente_nombre} | ${x.nro} | $${Number(x.total || 0).toLocaleString('es-AR')} | Vto: ${x.fecha_vto}`)
    .join('\n')

  return `Sos el asistente IA de FEPA, sistema de cobranzas y CRM de una distribuidora mayorista argentina.
Tenés acceso a los datos en tiempo real. Respondé en español, de forma concisa y accionable. Usá pesos argentinos ($).

═══ SNAPSHOT — ${hoy} ═══
Clientes activos: ${c.length} | Deuda total cartera: $${deudaTotal.toLocaleString('es-AR')}
Facturas pendientes: ${pendientes.length} | Facturas vencidas: ${vencidas.length}

TOP 10 DEUDORES:
${topDeudores || '  Sin deudores activos'}

FACTURAS VENCIDAS (muestra):
${detVencidas || '  Sin facturas vencidas'}`
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 503 })
  }

  const { messages, systemOverride } = await req.json() as { messages: Message[]; systemOverride?: string }

  let system = systemOverride
  if (!system) {
    try { system = await buildCtx() }
    catch { system = 'Sos el asistente IA de FEPA, sistema de cobranzas argentino.' }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  return NextResponse.json({ text })
}
