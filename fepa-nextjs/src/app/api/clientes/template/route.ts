import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const headers = [
    'Razon Social', 'CUIT', 'Email', 'Telefono', 'WhatsApp',
    'Direccion', 'Ciudad', 'Provincia', 'Zona',
    'Condicion IVA', 'Metodo Pago', 'Limite Credito', 'Notas',
  ]

  const examples = [
    {
      'Razon Social': 'Distribuidora Ejemplo SRL',
      'CUIT': '30-71234567-8',
      'Email': 'compras@ejemplo.com',
      'Telefono': '11-4567-8900',
      'WhatsApp': '1145678900',
      'Direccion': 'Av. Corrientes 1234',
      'Ciudad': 'Buenos Aires',
      'Provincia': 'Buenos Aires',
      'Zona': 'GBA Norte',
      'Condicion IVA': 'Responsable Inscripto',
      'Metodo Pago': 'cheque_30',
      'Limite Credito': 150000,
      'Notas': 'Cliente VIP - descuento especial',
    },
    {
      'Razon Social': 'Bicicletería El Pedal',
      'CUIT': '20-30456789-0',
      'Email': 'info@elpedal.com.ar',
      'Telefono': '351-456-7890',
      'WhatsApp': '3514567890',
      'Direccion': 'Bv. San Juan 890',
      'Ciudad': 'Córdoba',
      'Provincia': 'Córdoba',
      'Zona': 'Interior',
      'Condicion IVA': 'Responsable Inscripto',
      'Metodo Pago': 'transferencia',
      'Limite Credito': 80000,
      'Notas': '',
    },
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(examples, { header: headers })

  // Column widths
  ws['!cols'] = [
    { wch: 35 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 16 },
    { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
    { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 40 },
  ]

  // Second sheet: reference values
  const wsRef = XLSX.utils.aoa_to_sheet([
    ['Campo', 'Valores Válidos'],
    ['Condicion IVA', 'Responsable Inscripto'],
    ['', 'Monotributista'],
    ['', 'Exento'],
    ['', 'Consumidor Final'],
    [],
    ['Metodo Pago', 'contado'],
    ['', 'transferencia'],
    ['', 'cheque_30'],
    ['', 'cheque_60'],
    ['', 'cheque_90'],
    ['', 'cheque_120'],
    ['', 'mixto'],
    [],
    ['NOTAS', 'El CUIT debe tener 11 dígitos válidos (con o sin guiones)'],
    ['', 'La Razón Social es el único campo obligatorio'],
    ['', 'El Límite Crédito debe ser un número (0 = sin límite)'],
  ])
  wsRef['!cols'] = [{ wch: 18 }, { wch: 35 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referencia')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_clientes.xlsx"',
    },
  })
}
