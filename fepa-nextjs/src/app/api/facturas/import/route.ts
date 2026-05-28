import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb } from '@/lib/supabase'
import type { FilaImportFactura } from '@/lib/types'

const TIPOS_VALIDOS   = ['A','B','C']
const METODOS_VALIDOS = ['contado','transferencia','cheque_30','cheque_60','cheque_90','cheque_120','mixto']

// Strips all non-alphanumeric chars for fuzzy column matching
function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }

function col(row: Record<string, unknown>, ...keywords: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    const kn = norm(k)
    if (keywords.some(kw => kn === norm(kw) || kn.includes(norm(kw)))) {
      return String(v ?? '').trim()
    }
  }
  return ''
}

function parseExcelDate(val: string, fallback: string): string {
  if (!val) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  const n = Number(val)
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  return fallback
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const modo = (formData.get('modo') as string) || 'preview'

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const wb  = XLSX.read(buf, { type: 'buffer' })

    // Find the first sheet that has data
    let ws = wb.Sheets[wb.SheetNames[0]]
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]
      const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (rows.length > 0) { ws = sheet; break }
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    if (rawRows.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
    if (rawRows.length > 500) return NextResponse.json({ error: 'Máximo 500 filas' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]
    const columnas_detectadas = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

    const filas: FilaImportFactura[] = rawRows.map((row, idx) => {
      const errores: string[] = []

      const cliente_nombre = col(row, 'cliente', 'razonsocial', 'nombre', 'clientenombre')
      const tipoRaw        = col(row, 'tipo', 'comprobante') || 'B'
      const totalStr       = col(row, 'total', 'monto', 'importe', 'precio')
      const totalRaw       = Number(totalStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
      const fechaStr       = col(row, 'fecha', 'fechaemision') || today
      const fechaVtoStr    = col(row, 'fechavto', 'vencimiento', 'fechavencimiento', 'vto')
      const metodoStr      = col(row, 'metodopago', 'metodo', 'formapago', 'pago') || 'contado'
      const obs            = col(row, 'obs', 'observaciones', 'nota', 'detalle')

      if (!cliente_nombre) errores.push('Cliente es obligatorio')
      if (isNaN(totalRaw) || totalRaw <= 0) errores.push('Total debe ser mayor a 0')

      const tipo       = TIPOS_VALIDOS.includes(tipoRaw.toUpperCase()) ? tipoRaw.toUpperCase() : 'B'
      const metodo_pago = METODOS_VALIDOS.includes(metodoStr.toLowerCase()) ? metodoStr.toLowerCase() : 'contado'
      const fecha      = parseExcelDate(fechaStr, today)
      const fecha_vto  = fechaVtoStr ? parseExcelDate(fechaVtoStr, '') : ''

      return {
        fila: idx + 2,
        cliente_nombre,
        nro: '',
        tipo,
        total: isNaN(totalRaw) ? 0 : totalRaw,
        fecha,
        fecha_vto,
        metodo_pago,
        obs,
        errores,
        valido: errores.length === 0,
      }
    })

    if (modo === 'preview') {
      return NextResponse.json({
        total:               filas.length,
        validas:             filas.filter(f => f.valido).length,
        invalidas:           filas.filter(f => !f.valido).length,
        columnas_detectadas,
        filas,
      })
    }

    const validas = filas.filter(f => f.valido)
    if (validas.length === 0) {
      return NextResponse.json({ error: 'No hay filas válidas' }, { status: 400 })
    }

    const { data: clientesDB } = await sb().from('clientes').select('id,razon_social,saldo_deudor')
    const mapaClientes = new Map<string, { id: number; saldo_deudor: number }>(
      (clientesDB || []).map((c: { id: number; razon_social: string; saldo_deudor: number }) => [
        c.razon_social.toLowerCase().trim(),
        { id: c.id, saldo_deudor: Number(c.saldo_deudor) },
      ])
    )

    const { count: facCount } = await sb()
      .from('facturas')
      .select('*', { count: 'exact', head: true })
    let contador = (facCount || 0) + 1

    const registros = validas.map(f => {
      const cli = mapaClientes.get(f.cliente_nombre.toLowerCase().trim()) ?? null
      const nro = `0001-${String(contador++).padStart(8, '0')}`
      return {
        nro,
        tipo:           f.tipo,
        punto_venta:    1,
        cliente_id:     cli?.id ?? null,
        cliente_nombre: f.cliente_nombre,
        fecha:          f.fecha,
        fecha_vto:      f.fecha_vto || null,
        subtotal:       f.total,
        iva_105:        0,
        iva_21:         0,
        total:          f.total,
        estado:         'pendiente',
        metodo_pago:    f.metodo_pago,
        obs:            f.obs,
      }
    })

    const { data: insertadas, error } = await sb()
      .from('facturas')
      .insert(registros)
      .select('id,cliente_id,total')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update saldo_deudor for matched clients
    const saldoInc = new Map<number, number>()
    for (const f of (insertadas || [])) {
      if (f.cliente_id) {
        saldoInc.set(f.cliente_id, (saldoInc.get(f.cliente_id) ?? 0) + Number(f.total))
      }
    }
    for (const [cid, inc] of saldoInc.entries()) {
      const cli = (clientesDB || []).find((c: { id: number }) => c.id === cid)
      const actual = Number(cli?.saldo_deudor ?? 0)
      await sb().from('clientes').update({ saldo_deudor: actual + inc }).eq('id', cid)
    }

    return NextResponse.json({
      importados: insertadas?.length ?? validas.length,
      invalidas:  filas.filter(f => !f.valido).length,
    })

  } catch (err) {
    console.error('Factura import error:', err)
    return NextResponse.json({ error: 'Error procesando archivo' }, { status: 500 })
  }
}
