import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb } from '@/lib/supabase'
import type { FilaImportOV } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const modo = (formData.get('modo') as string) || 'preview'

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const buf  = Buffer.from(await file.arrayBuffer())
    const wb   = XLSX.read(buf, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    if (rows.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
    if (rows.length > 500) return NextResponse.json({ error: 'Máximo 500 filas' }, { status: 400 })

    const today = new Date().toISOString().split('T')[0]

    const filas: FilaImportOV[] = rows.map((row, idx) => {
      const errores: string[] = []

      const cliente_nombre = String(row['Cliente'] || row['cliente'] || row['Cliente Nombre'] || '').trim()
      const totalRaw       = Number(row['Total'] || row['total'] || 0)
      const descuentoRaw   = Number(row['Descuento'] || row['descuento'] || 0)
      const fechaRaw       = String(row['Fecha'] || row['fecha'] || today).trim()
      const fecha_entrega  = String(row['Fecha Entrega'] || row['fecha_entrega'] || '').trim()
      const obs            = String(row['Obs'] || row['obs'] || row['Observaciones'] || '').trim()
      const vendedor       = String(row['Vendedor'] || row['vendedor'] || '').trim()

      if (!cliente_nombre) errores.push('Cliente es obligatorio')
      if (isNaN(totalRaw) || totalRaw <= 0) errores.push('Total debe ser mayor a 0')

      let fecha = fechaRaw
      if (fechaRaw && !/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
        // Try to parse Excel date number
        const n = Number(fechaRaw)
        if (!isNaN(n) && n > 0) {
          const d = XLSX.SSF.parse_date_code(n)
          if (d) fecha = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
          else errores.push(`Fecha inválida: ${fechaRaw}`)
        }
      }

      let fechaEnt = fecha_entrega
      if (fecha_entrega && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_entrega)) {
        const n = Number(fecha_entrega)
        if (!isNaN(n) && n > 0) {
          const d = XLSX.SSF.parse_date_code(n)
          if (d) fechaEnt = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
        } else {
          fechaEnt = ''
        }
      }

      const total    = isNaN(totalRaw) ? 0 : totalRaw
      const descuento = isNaN(descuentoRaw) ? 0 : descuentoRaw
      const subtotal  = total + descuento

      return {
        fila: idx + 2,
        cliente_nombre,
        total,
        subtotal,
        descuento,
        fecha: fecha || today,
        fecha_entrega: fechaEnt,
        obs,
        vendedor,
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

    // Buscar clientes para hacer match por razon_social
    const { data: clientesDB } = await sb().from('clientes').select('id,razon_social')
    const mapaClientes = new Map<string, number>(
      (clientesDB || []).map((c: { id: number; razon_social: string }) => [c.razon_social.toLowerCase().trim(), c.id])
    )

    // Get current count for nro generation
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
