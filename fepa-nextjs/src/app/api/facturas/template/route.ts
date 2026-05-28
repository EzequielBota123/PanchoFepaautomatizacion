import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const examples = [
    {
      'Cliente':      'Distribuidora Ejemplo SRL',
      'Tipo':         'B',
      'Total':        60500,
      'Fecha':        '2026-05-28',
      'Fecha Vto':    '2026-06-27',
      'Metodo Pago':  'cheque_30',
      'Obs':          'Factura por OV-00001',
    },
    {
      'Cliente':      'Comercial Norte SA',
      'Tipo':         'A',
      'Total':        145200,
      'Fecha':        '2026-05-28',
      'Fecha Vto':    '2026-07-27',
      'Metodo Pago':  'cheque_60',
      'Obs':          '',
    },
  ]

  const headers = ['Cliente','Tipo','Total','Fecha','Fecha Vto','Metodo Pago','Obs']
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(examples, { header: headers })
  ws['!cols'] = [{ wch: 35 },{ wch: 6 },{ wch: 14 },{ wch: 14 },{ wch: 14 },{ wch: 15 },{ wch: 40 }]

  const wsRef = XLSX.utils.aoa_to_sheet([
    ['Campo', 'Descripción / Valores válidos'],
    ['Cliente', 'Razón social del cliente (se busca en el sistema)'],
    ['Tipo', 'A, B o C (default: B)'],
    ['Total', 'Monto total de la factura (número)'],
    ['Fecha', 'Fecha de emisión YYYY-MM-DD (default: hoy)'],
    ['Fecha Vto', 'Fecha de vencimiento YYYY-MM-DD (opcional)'],
    ['Metodo Pago', 'contado / transferencia / cheque_30 / cheque_60 / cheque_90 / cheque_120 / mixto'],
    ['Obs', 'Observaciones (opcional)'],
    [],
    ['NOTA', 'El número de factura (Nro) se genera automáticamente.'],
    ['', 'Estado inicial: pendiente. El saldo del cliente se actualiza automáticamente.'],
  ])
  wsRef['!cols'] = [{ wch: 14 },{ wch: 65 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Facturas')
  XLSX.utils.book_append_sheet(wb, wsRef, 'Instrucciones')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_facturas.xlsx"',
    },
  })
}
