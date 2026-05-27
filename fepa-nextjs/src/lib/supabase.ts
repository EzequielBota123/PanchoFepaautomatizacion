import { createClient } from '@supabase/supabase-js'
import type { Cliente, MetodoPago, CondIva } from './types'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Alias para uso en server (API routes)
export const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── CLIENTE: DB → App ──────────────────────────────────────────────────────
export function dbToCliente(row: Record<string, unknown>): Cliente {
  return {
    id:              Number(row.id),
    razon_social:    String(row.razon_social || ''),
    tipo_doc:        String(row.tipo_doc || 'CUIT'),
    cuit:            String(row.cuit || ''),
    email:           String(row.email || ''),
    telefono:        String(row.telefono || ''),
    whatsapp:        String(row.whatsapp || ''),
    direccion:       String(row.direccion || ''),
    ciudad:          String(row.ciudad || ''),
    provincia:       String(row.provincia || ''),
    codigo_postal:   String(row.codigo_postal || ''),
    zona:            String(row.zona || ''),
    cond_iva:        (row.cond_iva || 'Responsable Inscripto') as CondIva,
    metodo_pago:     (row.metodo_pago || 'contado') as MetodoPago,
    vendedor:        String(row.vendedor || ''),
    limite_credito:  Number(row.limite_credito || 0),
    saldo_deudor:    Number(row.saldo_deudor || 0),
    activo:          row.activo !== false,
    notas:           String(row.notas || ''),
    cuit_verificado: row.cuit_verificado === true,
    created_at:      String(row.created_at || ''),
    updated_at:      String(row.updated_at || ''),
  }
}

// ── CLIENTE: App → DB ──────────────────────────────────────────────────────
export function clienteToDb(c: Partial<Cliente>): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  const fields: (keyof Cliente)[] = [
    'razon_social','tipo_doc','cuit','email','telefono','whatsapp',
    'direccion','ciudad','provincia','codigo_postal','zona',
    'cond_iva','metodo_pago','vendedor','limite_credito','saldo_deudor',
    'activo','notas','cuit_verificado',
  ]
  for (const f of fields) {
    if (c[f] !== undefined) db[f as string] = c[f]
  }
  return db
}

// ── FACTURA: DB → App ──────────────────────────────────────────────────────
export function dbToFactura(row: Record<string, unknown>): import('./types').Factura {
  return {
    id:            Number(row.id),
    nro:           String(row.nro || ''),
    tipo:          (row.tipo || 'B') as import('./types').TipoFactura,
    punto_venta:   Number(row.punto_venta || 1),
    cliente_id:    row.cliente_id != null ? Number(row.cliente_id) : null,
    cliente_nombre: String(row.cliente_nombre || ''),
    fecha:         String(row.fecha || ''),
    fecha_vto:     row.fecha_vto ? String(row.fecha_vto) : null,
    subtotal:      Number(row.subtotal || 0),
    iva_105:       Number(row.iva_105 || 0),
    iva_21:        Number(row.iva_21 || 0),
    total:         Number(row.total || 0),
    cae:           String(row.cae || ''),
    cae_vto:       row.cae_vto ? String(row.cae_vto) : null,
    estado:        (row.estado || 'pendiente') as import('./types').EstadoFactura,
    obs:           String(row.obs || ''),
    pdf_url:       String(row.pdf_url || ''),
    metodo_pago:   String(row.metodo_pago || ''),
    cond_venta:    String(row.cond_venta || ''),
    created_at:    String(row.created_at || ''),
  }
}

// ── FACTURA: App → DB ──────────────────────────────────────────────────────
export function facturaToDb(f: Partial<import('./types').Factura>): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  const fields = [
    'nro','tipo','punto_venta','cliente_id','cliente_nombre',
    'fecha','fecha_vto','subtotal','iva_105','iva_21','total',
    'cae','cae_vto','estado','obs','pdf_url','metodo_pago','cond_venta',
  ] as const
  for (const field of fields) {
    if ((f as Record<string, unknown>)[field] !== undefined)
      db[field] = (f as Record<string, unknown>)[field]
  }
  return db
}
