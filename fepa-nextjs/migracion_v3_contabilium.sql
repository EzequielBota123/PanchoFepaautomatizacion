-- ============================================================
-- FEPA — Migración v3: Módulos estilo Contabilium
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── PRESUPUESTOS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presupuestos (
  id              BIGSERIAL PRIMARY KEY,
  nro             TEXT NOT NULL UNIQUE,
  cliente_id      BIGINT REFERENCES clientes(id),
  cliente_nombre  TEXT DEFAULT '',
  fecha           DATE DEFAULT CURRENT_DATE,
  fecha_vto       DATE,
  estado          TEXT DEFAULT 'borrador',
  subtotal        NUMERIC(14,2) DEFAULT 0,
  descuento       NUMERIC(14,2) DEFAULT 0,
  total           NUMERIC(14,2) DEFAULT 0,
  obs             TEXT DEFAULT '',
  vendedor        TEXT DEFAULT '',
  cond_venta      TEXT DEFAULT '',
  factura_id      BIGINT REFERENCES facturas(id),
  ctb_id          BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presup_cliente ON presupuestos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_presup_estado  ON presupuestos(estado);

CREATE TABLE IF NOT EXISTS items_presupuesto (
  id                BIGSERIAL PRIMARY KEY,
  presupuesto_id    BIGINT NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  producto_id       BIGINT REFERENCES productos(id),
  descripcion       TEXT DEFAULT '',
  cantidad          NUMERIC(14,2) DEFAULT 1,
  precio_unitario   NUMERIC(14,2) DEFAULT 0,
  descuento_pct     NUMERIC(5,2) DEFAULT 0,
  subtotal          NUMERIC(14,2) DEFAULT 0
);

-- ── PROVEEDORES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
  id              BIGSERIAL PRIMARY KEY,
  razon_social    TEXT NOT NULL,
  cuit            TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  telefono        TEXT DEFAULT '',
  direccion       TEXT DEFAULT '',
  ciudad          TEXT DEFAULT '',
  provincia       TEXT DEFAULT '',
  cond_iva        TEXT DEFAULT 'Responsable Inscripto',
  activo          BOOLEAN DEFAULT true,
  notas           TEXT DEFAULT '',
  ctb_id          BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prov_razon ON proveedores(razon_social);
CREATE INDEX IF NOT EXISTS idx_prov_cuit  ON proveedores(cuit);

-- ── COMPRAS / GASTOS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras (
  id                BIGSERIAL PRIMARY KEY,
  nro               TEXT DEFAULT '',
  proveedor_id      BIGINT REFERENCES proveedores(id),
  proveedor_nombre  TEXT DEFAULT '',
  fecha             DATE DEFAULT CURRENT_DATE,
  fecha_vto         DATE,
  tipo              TEXT DEFAULT 'factura',
  estado            TEXT DEFAULT 'pendiente',
  subtotal          NUMERIC(14,2) DEFAULT 0,
  iva               NUMERIC(14,2) DEFAULT 0,
  total             NUMERIC(14,2) DEFAULT 0,
  metodo_pago       TEXT DEFAULT '',
  obs               TEXT DEFAULT '',
  ctb_id            BIGINT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compra_prov   ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compra_estado ON compras(estado);

CREATE TABLE IF NOT EXISTS items_compra (
  id              BIGSERIAL PRIMARY KEY,
  compra_id       BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id     BIGINT REFERENCES productos(id),
  descripcion     TEXT DEFAULT '',
  cantidad        NUMERIC(14,2) DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  subtotal        NUMERIC(14,2) DEFAULT 0
);

-- ── REMITOS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS remitos (
  id              BIGSERIAL PRIMARY KEY,
  nro             TEXT NOT NULL UNIQUE,
  ov_id           BIGINT REFERENCES ordenes_venta(id),
  cliente_id      BIGINT REFERENCES clientes(id),
  cliente_nombre  TEXT DEFAULT '',
  fecha           DATE DEFAULT CURRENT_DATE,
  deposito_id     BIGINT REFERENCES depositos(id),
  estado          TEXT DEFAULT 'pendiente',
  obs             TEXT DEFAULT '',
  ctb_id          BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_remito_cliente ON remitos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_remito_ov      ON remitos(ov_id);

CREATE TABLE IF NOT EXISTS items_remito (
  id              BIGSERIAL PRIMARY KEY,
  remito_id       BIGINT NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
  producto_id     BIGINT REFERENCES productos(id),
  variante_id     BIGINT REFERENCES variantes_producto(id),
  descripcion     TEXT DEFAULT '',
  cantidad        NUMERIC(14,2) DEFAULT 1
);

-- ── ctb_id en tablas existentes ───────────────────────────────
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS ctb_id BIGINT;
ALTER TABLE facturas      ADD COLUMN IF NOT EXISTS ctb_id BIGINT;

-- ── RLS ───────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'presupuestos','items_presupuesto','proveedores',
    'compras','items_compra','remitos','items_remito'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DO $inner$ BEGIN
         CREATE POLICY "acceso_total" ON %I FOR ALL USING (true) WITH CHECK (true);
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $inner$', t);
  END LOOP;
END$$;

-- ── TRIGGERS updated_at ───────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['presupuestos','proveedores','compras','remitos']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END$$;