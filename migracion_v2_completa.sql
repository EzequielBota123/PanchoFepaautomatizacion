-- ============================================================
-- FEPA v2 — Migración completa
-- Pegar TODO en Supabase → SQL Editor y ejecutar
-- Sin bloques DO$$ (compatibles con el editor)
-- ============================================================

BEGIN;

-- ── 1. Eliminar tablas dependientes ──────────────────────────
DROP TABLE IF EXISTS cobranza_facturas CASCADE;
DROP TABLE IF EXISTS cobranzas CASCADE;
DROP TABLE IF EXISTS factura_ordenes CASCADE;
DROP TABLE IF EXISTS items_factura CASCADE;
DROP TABLE IF EXISTS comprobantes_nc_nd CASCADE;
DROP TABLE IF EXISTS items_ov CASCADE;
DROP TABLE IF EXISTS ordenes_venta CASCADE;

-- ── 2. Recrear clientes con schema correcto ───────────────────
DROP TABLE IF EXISTS clientes CASCADE;
CREATE TABLE clientes (
  id              BIGSERIAL PRIMARY KEY,
  razon_social    TEXT NOT NULL,
  tipo_doc        TEXT DEFAULT 'CUIT',
  cuit            TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  telefono        TEXT DEFAULT '',
  whatsapp        TEXT DEFAULT '',
  direccion       TEXT DEFAULT '',
  ciudad          TEXT DEFAULT '',
  provincia       TEXT DEFAULT '',
  codigo_postal   TEXT DEFAULT '',
  zona            TEXT DEFAULT '',
  cond_iva        TEXT DEFAULT 'Responsable Inscripto',
  metodo_pago     TEXT DEFAULT 'contado',
  vendedor        TEXT DEFAULT '',
  limite_credito  NUMERIC(14,2) DEFAULT 0,
  saldo_deudor    NUMERIC(14,2) DEFAULT 0,
  activo          BOOLEAN DEFAULT true,
  notas           TEXT DEFAULT '',
  cuit_verificado BOOLEAN DEFAULT false,
  ctb_id          BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_clientes_razon   ON clientes(razon_social);
CREATE INDEX idx_clientes_cuit    ON clientes(cuit);
CREATE INDEX idx_clientes_zona    ON clientes(zona);
CREATE INDEX idx_clientes_activo  ON clientes(activo);

-- ── 3. Corregir facturas: agregar columnas faltantes ──────────
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'B';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS punto_venta INT DEFAULT 1;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cliente_nombre TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_105 NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS iva_21 NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cae TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cae_vto DATE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS obs TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cond_venta TEXT DEFAULT '';
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Limpiar referencias rotas, luego restaurar FK
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_cliente_id_fkey;
UPDATE facturas SET cliente_id = NULL;
ALTER TABLE facturas ADD CONSTRAINT facturas_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes(id);

-- ── 4. Crear ordenes_venta ────────────────────────────────────
CREATE TABLE ordenes_venta (
  id              BIGSERIAL PRIMARY KEY,
  nro             TEXT NOT NULL UNIQUE,
  cliente_id      BIGINT REFERENCES clientes(id),
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
CREATE INDEX idx_ov_cliente ON ordenes_venta(cliente_id);
CREATE INDEX idx_ov_estado  ON ordenes_venta(estado);

-- ── 5. Crear comprobantes_nc_nd ────────────────────────────────
CREATE TABLE comprobantes_nc_nd (
  id                 BIGSERIAL PRIMARY KEY,
  nro                TEXT NOT NULL,
  tipo               TEXT DEFAULT 'NC',
  punto_venta        INT DEFAULT 1,
  factura_origen_id  BIGINT REFERENCES facturas(id),
  cliente_id         BIGINT REFERENCES clientes(id),
  cliente_nombre     TEXT DEFAULT '',
  fecha              DATE DEFAULT CURRENT_DATE,
  total              NUMERIC(14,2) DEFAULT 0,
  motivo             TEXT DEFAULT '',
  cae                TEXT DEFAULT '',
  cae_vto            DATE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Tablas auxiliares ──────────────────────────────────────
CREATE TABLE items_ov (
  id              BIGSERIAL PRIMARY KEY,
  ov_id           BIGINT NOT NULL REFERENCES ordenes_venta(id) ON DELETE CASCADE,
  descripcion     TEXT DEFAULT '',
  cantidad        INT DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  descuento_pct   NUMERIC(5,2) DEFAULT 0,
  subtotal        NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE items_factura (
  id              BIGSERIAL PRIMARY KEY,
  factura_id      BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  descripcion     TEXT DEFAULT '',
  cantidad        INT DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  descuento_pct   NUMERIC(5,2) DEFAULT 0,
  subtotal        NUMERIC(14,2) DEFAULT 0,
  alicuota_iva    NUMERIC(5,2) DEFAULT 21
);

CREATE TABLE factura_ordenes (
  factura_id  BIGINT REFERENCES facturas(id) ON DELETE CASCADE,
  ov_id       BIGINT REFERENCES ordenes_venta(id),
  PRIMARY KEY (factura_id, ov_id)
);

CREATE TABLE cobranzas (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT REFERENCES clientes(id),
  fecha       DATE DEFAULT CURRENT_DATE,
  monto       NUMERIC(14,2) DEFAULT 0,
  metodo      TEXT DEFAULT 'transferencia',
  referencia  TEXT DEFAULT '',
  obs         TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cobranza_facturas (
  cobranza_id     BIGINT REFERENCES cobranzas(id) ON DELETE CASCADE,
  factura_id      BIGINT REFERENCES facturas(id),
  monto_aplicado  NUMERIC(14,2) DEFAULT 0,
  PRIMARY KEY (cobranza_id, factura_id)
);

-- ── 7. Trigger updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_updated_at ON clientes;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at ON facturas;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at ON ordenes_venta;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON ordenes_venta
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 8. RLS ────────────────────────────────────────────────────
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

ALTER TABLE items_ov ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON items_ov;
CREATE POLICY "acceso_total" ON items_ov FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE items_factura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON items_factura;
CREATE POLICY "acceso_total" ON items_factura FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE factura_ordenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON factura_ordenes;
CREATE POLICY "acceso_total" ON factura_ordenes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE cobranzas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON cobranzas;
CREATE POLICY "acceso_total" ON cobranzas FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE cobranza_facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON cobranza_facturas;
CREATE POLICY "acceso_total" ON cobranza_facturas FOR ALL USING (true) WITH CHECK (true);

-- Prospectos (ya existe, solo asegurar RLS)
ALTER TABLE IF EXISTS prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso_total" ON prospectos;
CREATE POLICY "acceso_total" ON prospectos FOR ALL USING (true) WITH CHECK (true);

COMMIT;
