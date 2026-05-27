import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const soloActivos = searchParams.get('activos') !== 'false'

  let query = sb().from('clientes').select('*').order('razon_social')
  if (soloActivos) query = query.eq('activo', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []).map(r => ({
    'Razon Social':   r.razon_social,
    'CUIT':           r.cuit,
    'Email':          r.email,
    'Telefono':       r.telefono,
    'WhatsApp':       r.whatsapp,
    'Direccion':      r.direccion,
    'Ciudad':         r.ciudad,
    'Provincia':      r.provincia,
    'Zona':           r.zona,
    'Condicion IVA':  r.cond_iva,
    'Metodo Pago':    r.metodo_pago,
    'Limite Credito': r.limite_credito,
    'Saldo Deudor':   r.saldo_deudor,
    'Activo':         r.activo ? 'SI' : 'NO',
    'Notas':          r.notas,
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 35 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 16 },
    { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 },
    { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 8  }, { wch: 40 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="clientes_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
