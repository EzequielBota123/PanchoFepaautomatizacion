import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb } from '@/lib/supabase'
import type { FilaImportOV } from '@/lib/types'

// Strips all non-alphanumeric chars for fuzzy column matching
function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }

// Finds the value for a column by matching any of the given keywords (fuzzy)
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

    // Find the first sheet that has data (skip instruction sheets)
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

    const filas: FilaImportOV[] = rawRows.map((row, idx) => {
      const errores: string[] = []

      const cliente_nombre = col(row, 'cliente', 'razonsocial', 'nombre', 'clientenombre')
      const totalStr       = col(row, 'total', 'monto', 'importe', 'precio')
      const totalRaw       = Number(totalStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
      const descStr        = col(row, 'descuento', 'desc', 'rebaja')
      const descuentoRaw   = Number(descStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
      const fechaRaw       = col(row, 'fecha', 'fechaemision', 'dia') || today
      const fechaEntRaw    = col(row, 'fechaentrega', 'entrega', 'fechadev')
      const obs            = col(row, 'obs', 'observaciones', 'nota', 'detalle')
      const vendedor       = col(row, 'vendedor', 'vend', 'comercial')

      if (!cliente_nombre) errores.push('Cliente es obligatorio')
      if (isNaN(totalRaw) || totalRaw <= 0) errores.push('Total debe ser mayor a 0')

      const fecha      = parseExcelDate(fechaRaw, today)
      const fechaEnt   = fechaEntRaw ? parseExcelDate(fechaEntRaw, '') : ''
      const total      = isNaN(totalRaw) ? 0 : totalRaw
      const descuento  = isNaN(descuentoRaw) ? 0 : descuentoRaw

      return {
        fila: idx + 2,
        cliente_nombre,
        total,
        subtotal: total + descuento,
        descuento,
        fecha,
        fecha_entrega: fechaEnt,
        obs,
        vendedor,
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

    const { data: clientesDB } = await sb().from('clientes').select('id,razon_social')
    const mapaClientes = new Map<string, number>(
      (clientesDB || []).map((c: { id: number; razon_social: string }) => [
        c.razon_social.toLowerCase().trim(), c.id,
      ])
    )

    const { count: ovCount } = await sb()
      .from('ordenes_venta')
      .select('*', { count: 'exact', head: true })

    let contador = (ovCount || 0) + 1

    const registros = validas.map(f => {
      const cid = mapaClientes.get(f.cliente_nombre.toLowerCase().trim()) ?? null
      const nro = `OV-${String(contador++).padStart(5, '0')}`
      return {
        nro,
        cliente_id:     cid,
        cliente_nombre: f.cliente_nombre,
        fecha:          f.fecha,
        fecha_entrega:  f.fecha_entrega || null,
        estado:         'pendiente',
        subtotal:       f.subtotal,
        descuento:      f.descuento,
        total:          f.total,
        obs:            f.obs,
        vendedor:       f.vendedor,
      }
    })

    const { data, error } = await sb()
      .from('ordenes_venta')
      .insert(registros)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      importados: data?.length ?? validas.length,
      invalidas:  filas.filter(f => !f.valido).length,
    })

  } catch (err) {
    console.error('OV import error:', err)
    return NextResponse.json({ error: 'Error procesando archivo' }, { status: 500 })
  }
}
