import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sb, clienteToDb } from '@/lib/supabase'
import type { FilaImportCliente } from '@/lib/types'

// Validate CUIT format: XX-XXXXXXXX-X (with or without dashes)
function validarCuit(cuit: string): boolean {
  const clean = cuit.replace(/[-\s]/g, '')
  if (!/^\d{11}$/.test(clean)) return false
  const tipos = [20, 23, 24, 27, 30, 33, 34]
  const tipo = parseInt(clean.substring(0, 2))
  if (!tipos.includes(tipo)) return false
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * mult[i]
  const resto = sum % 11
  const dig = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  return dig === parseInt(clean[10])
}

function normalizarCuit(cuit: string): string {
  const clean = cuit.replace(/[-\s]/g, '')
  if (clean.length === 11) return `${clean.substring(0, 2)}-${clean.substring(2, 10)}-${clean[10]}`
  return cuit
}

const COND_IVA_VALIDAS = ['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final']
const METODOS_PAGO_VALIDOS = ['contado', 'transferencia', 'cheque_30', 'cheque_60', 'cheque_90', 'cheque_120', 'mixto']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const modo  = (formData.get('modo') as string) || 'preview' // 'preview' | 'import'

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const buf  = Buffer.from(await file.arrayBuffer())
    const wb   = XLSX.read(buf, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    if (rows.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
    if (rows.length > 500) return NextResponse.json({ error: 'Máximo 500 filas por importación' }, { status: 400 })

    // Check existing CUITs in DB to flag duplicates
    const { data: existentes } = await sb().from('clientes').select('cuit')
    const cuitsExistentes = new Set((existentes || []).map((r: { cuit: string }) => r.cuit.replace(/[-\s]/g, '')))

    const filas: FilaImportCliente[] = rows.map((row, idx) => {
      const errores: string[] = []

      const razon_social   = String(row['Razon Social'] || row['razon_social'] || row['Razón Social'] || '').trim()
      const cuitRaw        = String(row['CUIT'] || row['cuit'] || '').trim()
      const email          = String(row['Email'] || row['email'] || '').trim()
      const telefono       = String(row['Telefono'] || row['telefono'] || row['Teléfono'] || '').trim()
      const whatsapp       = String(row['WhatsApp'] || row['whatsapp'] || row['Whatsapp'] || '').trim()
      const direccion      = String(row['Direccion'] || row['direccion'] || row['Dirección'] || '').trim()
      const ciudad         = String(row['Ciudad'] || row['ciudad'] || '').trim()
      const provincia      = String(row['Provincia'] || row['provincia'] || '').trim()
      const zona           = String(row['Zona'] || row['zona'] || '').trim()
      const condIvaRaw     = String(row['Condicion IVA'] || row['cond_iva'] || row['Condición IVA'] || 'Responsable Inscripto').trim()
      const metodoPagoRaw  = String(row['Metodo Pago'] || row['metodo_pago'] || row['Método Pago'] || 'contado').trim()
      const limiteCreditoRaw = Number(row['Limite Credito'] || row['limite_credito'] || row['Límite Crédito'] || 0)
      const notas          = String(row['Notas'] || row['notas'] || '').trim()

      if (!razon_social) errores.push('Razón Social es obligatoria')

      let cuit = cuitRaw
      if (cuitRaw) {
        if (!validarCuit(cuitRaw)) {
          errores.push(`CUIT inválido: ${cuitRaw}`)
        } else {
          cuit = normalizarCuit(cuitRaw)
          if (cuitsExistentes.has(cuitRaw.replace(/[-\s]/g, ''))) {
            errores.push(`CUIT ya existe en la base: ${cuit}`)
          }
        }
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errores.push(`Email inválido: ${email}`)
      }

      const cond_iva = COND_IVA_VALIDAS.includes(condIvaRaw) ? condIvaRaw : 'Responsable Inscripto'
      if (condIvaRaw && !COND_IVA_VALIDAS.includes(condIvaRaw)) {
        errores.push(`Condición IVA inválida: "${condIvaRaw}". Se usará "Responsable Inscripto"`)
      }

      const metodo_pago = METODOS_PAGO_VALIDOS.includes(metodoPagoRaw) ? metodoPagoRaw : 'contado'
      if (metodoPagoRaw && !METODOS_PAGO_VALIDOS.includes(metodoPagoRaw)) {
        errores.push(`Método de pago inválido: "${metodoPagoRaw}". Se usará "contado"`)
      }

      return {
        fila: idx + 2, // Excel rows start at 2 (row 1 is header)
        razon_social,
        cuit,
        email,
        telefono,
        whatsapp,
        direccion,
        ciudad,
        provincia,
        zona,
        cond_iva,
        metodo_pago,
        limite_credito: isNaN(limiteCreditoRaw) ? 0 : limiteCreditoRaw,
        notas,
        errores,
        valido: errores.length === 0,
      } as FilaImportCliente
    })

    if (modo === 'preview') {
      return NextResponse.json({
        total:   filas.length,
        validas: filas.filter(f => f.valido).length,
        invalidas: filas.filter(f => !f.valido).length,
        filas,
      })
    }

    // modo === 'import': only insert valid rows
    const validas = filas.filter(f => f.valido)
    if (validas.length === 0) {
      return NextResponse.json({ error: 'No hay filas válidas para importar' }, { status: 400 })
    }

    const registros = validas.map(f => clienteToDb({
      razon_social:   f.razon_social,
      tipo_doc:       'CUIT',
      cuit:           f.cuit,
      email:          f.email,
      telefono:       f.telefono,
      whatsapp:       f.whatsapp,
      direccion:      f.direccion,
      ciudad:         f.ciudad,
      provincia:      f.provincia,
      zona:           f.zona,
      cond_iva:       f.cond_iva as never,
      metodo_pago:    f.metodo_pago as never,
      limite_credito: f.limite_credito,
      notas:          f.notas,
      activo:         true,
    }))

    const { data, error } = await sb()
      .from('clientes')
      .insert(registros)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      importados: data?.length ?? validas.length,
      invalidas:  filas.filter(f => !f.valido).length,
    })

  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Error procesando archivo' }, { status: 500 })
  }
}
