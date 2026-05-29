// ── ENUMS ──────────────────────────────────────────────────────────────────
export type CondIva    = 'Responsable Inscripto' | 'Monotributista' | 'Exento' | 'Consumidor Final'
export type MetodoPago = 'contado' | 'transferencia' | 'cheque_30' | 'cheque_60' | 'cheque_90' | 'cheque_120' | 'mixto'
export type TipoFactura = 'A' | 'B' | 'C'
export type EstadoOV   = 'pendiente' | 'facturada_parcial' | 'facturada_total' | 'anulada'
export type EstadoFactura = 'pendiente' | 'cobrada' | 'anulada'
export type EstadoCheque  = 'cartera' | 'depositado' | 'rechazado' | 'endosado'

// ── CLIENTE ────────────────────────────────────────────────────────────────
export interface Cliente {
  id:             number
  razon_social:   string
  tipo_doc:       string
  cuit:           string
  email:          string
  telefono:       string
  whatsapp:       string
  direccion:      string
  ciudad:         string
  provincia:      string
  codigo_postal:  string
  zona:           string
  cond_iva:       CondIva
  metodo_pago:    MetodoPago
  vendedor:       string
  limite_credito: number
  saldo_deudor:   number
  activo:         boolean
  notas:          string
  cuit_verificado: boolean
  created_at?:    string
  updated_at?:    string
}

// ── PRODUCTO / VARIANTE / STOCK ────────────────────────────────────────────
export interface Producto {
  id:                 number
  codigo:             string
  nombre:             string
  descripcion:        string
  marca:              string
  modelo:             string
  tiene_variantes:    boolean
  precio_mayorista:   number
  precio_sugerido:    number
  stock_minimo_total: number
  activo:             boolean
  variantes?:         Variante[]
  stock_total?:       number
}

export interface Variante {
  id:              number
  producto_id:     number
  talle:           string
  color:           string
  codigo_variante: string
  precio_extra:    number
  activo:          boolean
  stock?:          StockDeposito[]
}

export interface StockDeposito {
  deposito_id:   number
  deposito_nombre: string
  cantidad:      number
  stock_minimo:  number
}

export interface Deposito {
  id:       number
  nombre:   string
  direccion: string
  activo:   boolean
}

// ── ORDEN DE VENTA ─────────────────────────────────────────────────────────
export interface OrdenVenta {
  id:             number
  nro:            string
  cliente_id:     number | null
  cliente_nombre: string
  fecha:          string
  fecha_entrega:  string | null
  deposito_id:    number | null
  estado:         EstadoOV
  subtotal:       number
  descuento:      number
  total:          number
  obs:            string
  vendedor:       string
  items?:         ItemOV[]
  created_at?:    string
}

export interface ItemOV {
  id:              number
  ov_id:           number
  producto_id:     number | null
  variante_id:     number | null
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  descuento_pct:   number
  subtotal:        number
}

// ── FACTURA ────────────────────────────────────────────────────────────────
export interface Factura {
  id:             number
  nro:            string
  tipo:           TipoFactura
  punto_venta:    number
  cliente_id:     number | null
  cliente_nombre: string
  fecha:          string
  fecha_vto:      string | null
  subtotal:       number
  iva_105:        number
  iva_21:         number
  total:          number
  cae:            string
  cae_vto:        string | null
  estado:         EstadoFactura
  obs:            string
  pdf_url:        string
  metodo_pago:    string
  cond_venta:     string
  items?:         ItemFactura[]
  ordenes?:       number[]
  created_at?:    string
}

export interface ItemFactura {
  id:              number
  factura_id:      number
  producto_id:     number | null
  variante_id:     number | null
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  descuento_pct:   number
  subtotal:        number
  alicuota_iva:    number
}

// ── COBRANZA / CHEQUE ──────────────────────────────────────────────────────
export interface Cobranza {
  id:         number
  cliente_id: number | null
  fecha:      string
  monto:      number
  metodo:     string
  referencia: string
  obs:        string
  facturas?:  { factura_id: number; monto_aplicado: number }[]
  cheques?:   Cheque[]
  created_at?: string
}

export interface Cheque {
  id:            number
  cobranza_id:   number | null
  cliente_id:    number | null
  nro_cheque:    string
  banco:         string
  titular:       string
  fecha_emision: string | null
  fecha_cobro:   string | null
  monto:         number
  estado:        EstadoCheque
  obs:           string
}

// ── CONFIG ─────────────────────────────────────────────────────────────────
export interface ConfigEmpresa {
  razon_social:  string
  cuit:          string
  domicilio:     string
  ciudad:        string
  provincia:     string
  cond_iva:      string
  punto_venta:   number
  ambiente_afip: string
  logo_url:      string
  email:         string
  telefono:      string
}

// ── PRESUPUESTO ────────────────────────────────────────────────────────────────
export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'vencido' | 'convertido'

export interface Presupuesto {
  id:             number
  nro:            string
  cliente_id:     number | null
  cliente_nombre: string
  fecha:          string
  fecha_vto:      string | null
  estado:         EstadoPresupuesto
  subtotal:       number
  descuento:      number
  total:          number
  obs:            string
  vendedor:       string
  cond_venta:     string
  factura_id:     number | null
  ctb_id:         number | null
  items?:         ItemPresupuesto[]
  created_at?:    string
}

export interface ItemPresupuesto {
  id:              number
  presupuesto_id:  number
  producto_id:     number | null
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  descuento_pct:   number
  subtotal:        number
}

// ── PROVEEDOR ──────────────────────────────────────────────────────────────────
export interface Proveedor {
  id:           number
  razon_social: string
  cuit:         string
  email:        string
  telefono:     string
  direccion:    string
  ciudad:       string
  provincia:    string
  cond_iva:     string
  activo:       boolean
  notas:        string
  ctb_id:       number | null
  created_at?:  string
}

// ── COMPRA ─────────────────────────────────────────────────────────────────────
export type TipoCompra   = 'factura' | 'recibo' | 'ticket' | 'nc'
export type EstadoCompra = 'pendiente' | 'pagada'

export interface Compra {
  id:               number
  nro:              string
  proveedor_id:     number | null
  proveedor_nombre: string
  fecha:            string
  fecha_vto:        string | null
  tipo:             TipoCompra
  estado:           EstadoCompra
  subtotal:         number
  iva:              number
  total:            number
  metodo_pago:      string
  obs:              string
  ctb_id:           number | null
  items?:           ItemCompra[]
  created_at?:      string
}

export interface ItemCompra {
  id:              number
  compra_id:       number
  producto_id:     number | null
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  subtotal:        number
}

// ── REMITO ─────────────────────────────────────────────────────────────────────
export type EstadoRemito = 'pendiente' | 'entregado' | 'anulado'

export interface Remito {
  id:             number
  nro:            string
  ov_id:          number | null
  cliente_id:     number | null
  cliente_nombre: string
  fecha:          string
  deposito_id:    number | null
  estado:         EstadoRemito
  obs:            string
  ctb_id:         number | null
  items?:         ItemRemito[]
  created_at?:    string
}

export interface ItemRemito {
  id:          number
  remito_id:   number
  producto_id: number | null
  variante_id: number | null
  descripcion: string
  cantidad:    number
}

// ── MOVIMIENTO CUENTA CORRIENTE ────────────────────────────────────────────────
export type TipoMovCC = 'factura' | 'cobro' | 'nc' | 'nd' | 'ajuste'

export interface MovimientoCC {
  id:          number
  tipo:        TipoMovCC
  fecha:       string
  descripcion: string
  debe:        number
  haber:       number
  saldo:       number
  ref_id:      number | null
}

// ── EXCEL IMPORT ───────────────────────────────────────────────────────────
export interface FilaImportOV {
  fila:           number
  cliente_nombre: string
  total:          number
  subtotal:       number
  descuento:      number
  fecha:          string
  fecha_entrega:  string
  obs:            string
  vendedor:       string
  errores:        string[]
  valido:         boolean
}

export interface FilaImportFactura {
  fila:           number
  cliente_nombre: string
  nro:            string
  tipo:           string
  total:          number
  fecha:          string
  fecha_vto:      string
  metodo_pago:    string
  obs:            string
  errores:        string[]
  valido:         boolean
}

export interface FilaImportCliente {
  fila:         number
  razon_social: string
  cuit:         string
  email:        string
  telefono:     string
  whatsapp:     string
  direccion:    string
  ciudad:       string
  provincia:    string
  zona:         string
  cond_iva:     string
  metodo_pago:  string
  limite_credito: number
  notas:        string
  errores:      string[]
  valido:       boolean
}
