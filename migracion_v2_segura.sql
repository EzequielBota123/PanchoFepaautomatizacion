-- ============================================================
-- FEPA — Migración segura v2 (NO borra datos existentes)
-- Pegar en Supabase → SQL Editor
-- Si algún bloque falla, pasá al siguiente
-- ============================================================

-- ══════════════════════════════════════════════════
-- BLOQUE 1: Renombrar columna en clientes
-- (corrije el error "column razon_social does not exist")
-- Si ya se llama razon_social → va a fallar → ignorá el error y continuá
-- ══════════════════════════════════════════════════
ALTER TABLE clientes RENAME COLUMN nombre TO razon_social;


-- ══════════════════════════════════════════════════
-- BLOQUE 2: Agregar columnas faltantes en clientes
-- ══════════════════════════════════════════════════
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_doc       TEXT DEFAULT 'CUIT';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp       TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS codigo_postal  TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS zona           TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cond_iva       TEXT DEFAULT 'Responsable Inscripto';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS metodo_pago    TEXT DEFAULT 'contado';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vendedor       TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(14,2) DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_deudor   NUMERIC(14,2) DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas          TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuit_verificado BOOLEAN DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS activo         BOOLEAN DEFAULT true;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();


-- ══════════════════════════════════════════════════
-- BLOQUE 3: Agregar columnas faltantes en facturas
-- ══════════════════════════════════════════════════
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tipo          TEXT DEFAULT 'B';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS punto_venta   INT DEFAULT 1;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cliente_nombre TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS subtotal      NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_105       NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_21        NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cae           TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cae_vto       DATE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS obs           TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pdf_url       TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS metodo_pago   TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cond_venta    TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS fecha_vto     DATE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();


-- ══════════════════════════════════════════════════
-- BLOQUE 4: Crear ordenes_venta (si no existe)
-- ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ordenes_venta (
  id              BIGSERIAL PRIMARY KEY,
  nro             TEXT NOT NULL UNIQUE,
  cliente_id      BIGINT,
  cliente_nombre  TEXT DEFAULT '',
  fecha           DATE DEFAULT CURRENT_DATE,
  fecha_entrega   DATE,
  estado          TEXT DEFAULT 'pendiente',
  subtotal        NUMERIC(14,2) DEFAULT 0,
  descuento       NUMERIC(14,2) DEFAULT 0,
  total           NUMERIC(14,2) DEFAULT 0,
  obs             TEXT DEFAULT '',
  vendedor        TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ov_cliente ON ordenes_venta(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ov_estado  ON ordenes_venta(estado);


-- ══════════════════════════════════════════════════
-- BLOQUE 5: Crear comprobantes_nc_nd (si no existe)
-- ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comprobantes_nc_nd (
  id                 BIGSERIAL PRIMARY KEY,
  nro                TEXT NOT NULL,
  tipo               TEXT DEFAULT 'NC',
  punto_venta        INT DEFAULT 1,
  factura_origen_id  BIGINT,
  cliente_id         BIGINT,
  cliente_nombre     TEXT DEFAULT '',
  fecha              DATE DEFAULT CURRENT_DATE,
  total              NUMERIC(14,2) DEFAULT 0,
  motivo             TEXT DEFAULT '',
  cae                TEXT DEFAULT '',
  cae_vto            DATE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);


-- ══════════════════════════════════════════════════
-- BLOQUE 6: RLS — acceso total (sin autenticación)
-- ══════════════════════════════════════════════════
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON clientes;
CREATE POLICY "acceso_total" ON clientes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON facturas;
CREATE POLICY "acceso_total" ON facturas FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ordenes_venta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON ordenes_venta;
CREATE POLICY "acceso_total" ON ordenes_venta FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE comprobantes_nc_nd ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON comprobantes_nc_nd;
CREATE POLICY "acceso_total" ON comprobantes_nc_nd FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON prospectos;
CREATE POLICY "acceso_total" ON prospectos FOR ALL USING (true) WITH CHECK (true);
