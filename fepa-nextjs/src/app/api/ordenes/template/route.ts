import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const examples = [
    {
      'Cliente': 'Distribuidora Ejemplo SRL',
      'Total': 50000,
      'Descuento': 0,
      'Fecha': '2026-05-28',
      'Fecha Entrega': '2026-06-05',
      'Obs': 'Bicicletas montaña x10',
      'Vendedor': 'Carlos',
    },
    {
      'Cliente': 'Comercial Norte SA',
      'Total': 120000,
      'Descuento': 5000,
      'Fecha': '2026-05-28',
      'Fecha Entrega': '',
      'Obs': 'Ropa deportiva surtida',
      'Vendedor': '',
    },
  ]

  const headers = ['Cliente','Total','Descuento','Fecha','Fecha Entrega','Obs','Vendedor']
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(examples, { header: headers })
  ws['!cols'] = [{ wch: 35 },{ wch: 12 },{ wch: 12 },{ wch: 14 },{ wch: 14 },{ wch: 40 },{ wch: 18 }]

  const wsRef = XLSX.utils.aoa_to_sheet([
    ['Campo', 'Descripción'],
    ['Cliente', 'Razón social exacta del cliente (debe existir en el sistema)'],
    ['Total', 'Monto total de la orden (número, sin símbolos)'],
    ['Descuento', 'Descuento en pesos (opcional, default 0)'],
    ['Fecha', 'Fecha en formato YYYY-MM-DD (opcional, default hoy)'],
    ['Fecha Entrega', 'Fecha de entrega en YYYY-MM-DD (opcional)'],
    ['Obs', 'Observaciones / detalle de productos (opcional)'],
    ['Vendedor', 'Nombre del vendedor (opcional)'],
    [],
    ['NOTA', 'El campo "Cliente" es obligatorio. Se buscará por razón social exacta.'],
    ['', 'Si el cliente no existe, la fila se importará igual con el nombre como texto libre.'],
  ])
  wsRef['!cols'] = [{ wch: 16 },{ wch: 60 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Ordenes')
  XLSX.utils.book_append_sheet(wb, wsRef, 'Instrucciones')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_ordenes.xlsx"',
    },
  })
}
