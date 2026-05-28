import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb } from '@/lib/supabase'
import type { FilaImportOV } from '@/lib/types'

// Remove accents then strip non-alphanumeric
function norm(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Fuzzy column lookup
function col(row: Record<string, unknown>, ...keywords: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    const kn = norm(k)
    if (keywords.some(kw => kn === norm(kw) || kn.includes(norm(kw)))) {
      return String(v ?? '').trim()
    }
  }
  return ''
}

// Parse Argentine or international amounts: 1.500,00 → 1500  |  1500.50 → 1500.50
function parseAmount(raw: string): number {
  const s = raw.replace(/\s/g, '')
  if (!s) return 0
  if (s.includes('.') && s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0
  return parseFloat(s) || 0
}

function parseExcelDate(val: string, fallback: string): string {
  if (!val) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  const dmy = val.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  const n = Number(val)
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  return fallback
}

function mapEstado(raw: string): 'pendiente' | 'facturada_parcial' | 'facturada_total' | 'anulada' {
  const s = norm(raw)
  if (s.includes('anula')) return 'anulada'
  if (s.includes('facturadatotal') || s.includes('totalfacturada')) return 'facturada_total'
  if (s.includes('facturadaparcial')) return 'facturada_parcial'
  return 'pendiente'
}

// Detect a column that groups detail rows into orders (e.g. "Numero Orden")
function detectGroupCol(row: Record<string, unknown>): string {
  for (const k of Object.keys(row)) {
    const kn = norm(k)
    if (['numerorden', 'nroorden', 'norden', 'ordenid', 'idorden', 'pedido', 'ordencompra', 'ordenventa', 'idpedido'].some(kw => kn === kw || kn.includes(kw))) {
      return k
    }
  }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const modo = (formData.get('modo') as string) || 'preview'

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const wb  = XLSX.read(buf, { type: 'buffer' })

    // Pick first sheet with data
    let ws = wb.Sheets[wb.SheetNames[0]]
    for (const name of wb.SheetNames) {
      const tmp = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })
      if (tmp.length > 0) { ws = wb.Sheets[name]; break }
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (rawRows.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
    if (rawRows.length > 2000) return NextResponse.json({ error: 'Máximo 2000 filas' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]
    const columnas_detectadas = Object.keys(rawRows[0] ?? {})

    // ── Detect if this is a detail file (one row per item) or one row per order ──
    const groupColName = detectGroupCol(rawRows[0] ?? {})

    // Group rows by order key. If no group column found, each row = one order.
    const groups: Map<string, Record<string, unknown>[]> = new Map()
    for (const row of rawRows) {
      const key = groupColName ? String(row[groupColName] ?? '').trim() : `__row_${groups.size}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    const filas: FilaImportOV[] = []
    let filaIdx = 1

    for (const [groupKey, rows] of groups) {
      const first = rows[0]
      const errores: string[] = []

      const cliente_nombre = col(first,
        'comprador', 'cliente', 'razonsocial', 'razon', 'nombre', 'clientenombre',
        'nombrecliente', 'empresa', 'razoncomercial', 'denominacion',
        'cte', 'fantasia', 'nombrefantasia', 'firma', 'sociedad'
      )
      const totalStr  = col(first, 'total', 'monto', 'importe', 'valor', 'subtotal')
      const totalRaw  = parseAmount(totalStr)
      const descStr   = col(first, 'descuento', 'bonificacion', 'desc', 'rebaja')
      const descuento = parseAmount(descStr)
      const fechaRaw  = col(first, 'fechacreacion', 'fecha', 'fechaemision', 'dia') || today
      const fechaEnt  = col(first, 'fechavencimiento', 'fechaentrega', 'vencimiento', 'entrega', 'plazo')
      const vendedor  = col(first, 'vendedor', 'vend', 'comercial', 'asesor')
      const estadoRaw = col(first, 'estado', 'status')

      // Build obs from all items: "Cant x Concepto"
      const itemLines = rows.map(r => {
        const cant    = col(r, 'cantidad', 'cant', 'qty', 'unidades')
        const concepto = col(r, 'concepto', 'descripcion', 'detalle', 'obs', 'articulo', 'producto', 'item')
        if (cant && concepto) return `${cant}x ${concepto}`
        return concepto || cant
      }).filter(Boolean)
      const obs = itemLines.join(' / ')

      if (isNaN(totalRaw) || totalRaw <= 0) errores.push('Total debe ser mayor a 0')

      filas.push({
        fila:          filaIdx++,
        cliente_nombre,
        total:         totalRaw,
        subtotal:      totalRaw + descuento,
        descuento,
        fecha:         parseExcelDate(fechaRaw, today),
        fecha_entrega: fechaEnt ? parseExcelDate(fechaEnt, '') : '',
        obs,
        vendedor,
        errores,
        valido:        errores.length === 0,
        // carry extra fields for import step
        _nroOrigen:    groupColName ? groupKey : '',
        _estado:       estadoRaw,
      } as FilaImportOV & { _nroOrigen: string; _estado: string })
    }

    if (filas.length > 500) return NextResponse.json({ error: 'Máximo 500 órdenes por importación' }, { status: 400 })

    if (modo === 'preview') {
      return NextResponse.json({
        total:    filas.length,
        validas:  filas.filter(f => f.valido).length,
        invalidas: filas.filter(f => !f.valido).length,
        columnas_detectadas,
        agrupado_por: groupColName || null,
        filas,
      })
    }

    // ── IMPORT ──────────────────────────────────────────────────────────────
    const validas = filas.filter(f => f.valido)
    if (validas.length === 0) return NextResponse.json({ error: 'No hay filas válidas' }, { status: 400 })

    // Load existing clients
    const { data: clientesDB } = await sb().from('clientes').select('id,razon_social')
    const mapaClientes = new Map<string, number>(
      (clientesDB || []).map((c: { id: number; razon_social: string }) => [
        c.razon_social.toLowerCase().trim(), c.id,
      ])
    )

    // Auto-create clients that don't exist yet
    const nuevosNombres = [...new Set(
      validas
        .map(f => f.cliente_nombre.toLowerCase().trim())
        .filter(n => n && !mapaClientes.has(n))
    )]
    if (nuevosNombres.length > 0) {
      const nuevosClientes = nuevosNombres.map(n => ({
        razon_social: validas.find(f => f.cliente_nombre.toLowerCase().trim() === n)!.cliente_nombre,
        activo: true,
      }))
      const { data: creados } = await sb()
        .from('clientes').insert(nuevosClientes).select('id,razon_social')
      for (const c of (creados || [])) {
        mapaClientes.set(c.razon_social.toLowerCase().trim(), c.id)
      }
    }

    // Generate OV numbers — start after highest existing
    const { count: ovCount } = await sb()
      .from('ordenes_venta').select('*', { count: 'exact', head: true })
    let contador = (ovCount || 0) + 1

    const registros = validas.map(f => {
      const ff = f as FilaImportOV & { _nroOrigen: string; _estado: string }
      const cid = mapaClientes.get(f.cliente_nombre.toLowerCase().trim()) ?? null
      const nro = `OV-${String(contador++).padStart(5, '0')}`
      return {
        nro,
        cliente_id:     cid,
        cliente_nombre: f.cliente_nombre,
        fecha:          f.fecha,
        fecha_entrega:  f.fecha_entrega || null,
        estado:         mapEstado(ff._estado),
        subtotal:       f.subtotal,
        descuento:      f.descuento,
        total:          f.total,
        obs:            f.obs,
        vendedor:       f.vendedor,
      }
    })

    const { data, error } = await sb()
      .from('ordenes_venta').insert(registros).select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      importados:       data?.length ?? validas.length,
      invalidas:        filas.filter(f => !f.valido).length,
      clientes_creados: nuevosNombres.length,
    })

  } catch (err) {
    console.error('OV import error:', err)
    return NextResponse.json({ error: 'Error procesando archivo' }, { status: 500 })
  }
}
