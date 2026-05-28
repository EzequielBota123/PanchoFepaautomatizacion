import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb } from '@/lib/supabase'
import type { FilaImportFactura } from '@/lib/types'

const TIPOS_VALIDOS   = ['A','B','C']
const METODOS_VALIDOS = ['contado','transferencia','cheque_30','cheque_60','cheque_90','cheque_120','mixto']

function parseExcelDate(val: unknown, fallback: string): string {
  const s = String(val || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const n = Number(s)
  if (!isNaN(n) && n > 0) {
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

    const buf  = Buffer.from(await file.arrayBuffer())
    const wb   = XLSX.read(buf, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    if (rawRows.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
    if (rawRows.length > 500) return NextResponse.json({ error: 'Máximo 500 filas' }, { status: 400 })

    // Normalize keys: lowercase + trim so column names are case-insensitive
    const rows = rawRows.map(r => {
      const n: Record<string, unknown> = {}
      for (const k of Object.keys(r)) n[k.toLowerCase().trim().replace(/\s+/g, '_')] = r[k]
      return n
    })

    const today = new Date().toISOString().split('T')[0]

    const filas: FilaImportFactura[] = rows.map((row, idx) => {
      const errores: string[] = []

      const cliente_nombre = String(row['cliente'] || row['cliente_nombre'] || row['razon_social'] || '').trim()
      const tipoRaw        = String(row['tipo'] || 'B').trim().toUpperCase()
      const totalRaw       = Number(row['total'] || 0)
      const fecha          = parseExcelDate(row['fecha'], today)
      const fecha_vto      = parseExcelDate(row['fecha_vto'] || row['fecha_de_vencimiento'] || row['vencimiento'] || '', '')
      const metodoRaw      = String(row['metodo_pago'] || row['metodo'] || 'contado').trim().toLowerCase()
      const obs            = String(row['obs'] || row['observaciones'] || row['observacion'] || '').trim()

      if (!cliente_nombre) errores.push('Cliente es obligatorio')
      if (isNaN(totalRaw) || totalRaw <= 0) errores.push('Total debe ser mayor a 0')

      const tipo       = TIPOS_VALIDOS.includes(tipoRaw) ? tipoRaw : 'B'
      const metodo_pago = METODOS_VALIDOS.includes(metodoRaw) ? metodoRaw : 'contado'

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
        total:    filas.length,
        validas:  filas.filter(f => f.valido).length,
        invalidas: filas.filter(f => !f.valido).length,
        filas,
      })
    }

    // modo === 'import'
    const validas = filas.filter(f => f.valido)
    if (validas.length === 0) {
      return NextResponse.json({ error: 'No hay filas válidas' }, { status: 400 })
    }

    // Match clientes por razon_social
    const { data: clientesDB } = await sb().from('clientes').select('id,razon_social,saldo_deudor')
    const mapaClientes = new Map<string, { id: number; saldo_deudor: number }>(
      (clientesDB || []).map((c: { id: number; razon_social: string; saldo_deudor: number }) => [
        c.razon_social.toLowerCase().trim(),
        { id: c.id, saldo_deudor: Number(c.saldo_deudor) },
      ])
    )

    // Auto-generate nro
    const { count: facCount } = await sb()
      .from('facturas')
      .select('*', { count: 'exact', head: true })
    let contador = (facCount || 0) + 1

    const registros = validas.map(f => {
      const cli = mapaClientes.get(f.cliente_nombre.toLowerCase().trim()) ?? null
      const nro = `0001-${String(contador++).padStart(8, '0')}`
      return {
        nro,
        tipo:          f.tipo,
        punto_venta:   1,
        cliente_id:    cli?.id ?? null,
        cliente_nombre: f.cliente_nombre,
        fecha:         f.fecha,
        fecha_vto:     f.fecha_vto || null,
        subtotal:      f.total,
        iva_105:       0,
        iva_21:        0,
        total:         f.total,
        estado:        'pendiente',
        metodo_pago:   f.metodo_pago,
        obs:           f.obs,
      }
    })

    const { data: insertadas, error } = await sb()
      .from('facturas')
      .insert(registros)
      .select('id,cliente_id,total')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Actualizar saldo_deudor de clientes encontrados
    const saldoIncrementos = new Map<number, number>()
    for (const f of (insertadas || [])) {
      if (f.cliente_id) {
        saldoIncrementos.set(f.cliente_id, (saldoIncrementos.get(f.cliente_id) ?? 0) + Number(f.total))
      }
    }

    for (const [cid, incremento] of saldoIncrementos.entries()) {
      const actual = mapaClientes.get([...(clientesDB || [])].find((c: { id: number }) => c.id === cid)?.razon_social?.toLowerCase().trim() ?? '')?.saldo_deudor ?? 0
      await sb().from('clientes').update({ saldo_deudor: actual + incremento }).eq('id', cid)
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
