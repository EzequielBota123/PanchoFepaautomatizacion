-- ============================================================
-- FEPA Sistema Mayorista — Schema Completo v2
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ── CONFIG EMPRESA ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_empresa (
  id              INT DEFAULT 1 PRIMARY KEY,
  razon_social    TEXT DEFAULT 'FEPA',
  cuit            TEXT DEFAULT '',
  domicilio       TEXT DEFAULT '',
  ciudad          TEXT DEFAULT '',
  provincia       TEXT DEFAULT 'Buenos Aires',
  cond_iva        TEXT DEFAULT 'Responsable Inscripto',
  iibb            TEXT DEFAULT '',
  inicio_act      DATE,
  email           TEXT DEFAULT '',
  telefono        TEXT DEFAULT '',
  logo_url        TEXT DEFAULT '/logo-samurai.png',
  punto_venta     INT  DEFAULT 1,
  ambiente_afip   TEXT DEFAULT 'homologacion',
  afip_cert       TEXT DEFAULT '',
  afip_key        TEXT DEFAULT '',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO config_empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── DEPÓSITOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS depositos (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  direccion   TEXT DEFAULT '',
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO depositos (nombre) VALUES ('Depósito 1'), ('Depósito 2')
  ON CONFLICT DO NOTHING;

-- ── CLIENTES ────────────────────────────────────────────────
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

-- ── PRODUCTOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id                BIGSERIAL PRIMARY KEY,
  codigo            TEXT DEFAULT '',
  nombre            TEXT NOT NULL,
  descripcion       TEXT DEFAULT '',
  marca             TEXT DEFAULT '',
  modelo            TEXT DEFAULT '',
  tiene_variantes   BOOLEAN DEFAULT false,
  precio_mayorista  NUMERIC(14,2) DEFAULT 0,
  precio_sugerido   NUMERIC(14,2) DEFAULT 0,
  stock_minimo_total INT DEFAULT 0,
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_productos_marca  ON productos(marca);
CREATE INDEX IF NOT EXISTS idx_productos_modelo ON productos(modelo);

-- ── VARIANTES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS variantes_producto (
  id              BIGSERIAL PRIMARY KEY,
  producto_id     BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  talle           TEXT DEFAULT '',
  color           TEXT DEFAULT '',
  codigo_variante TEXT DEFAULT '',
  precio_extra    NUMERIC(14,2) DEFAULT 0,
  activo          BOOLEAN DEFAULT true,
  UNIQUE(producto_id, talle, color)
);

-- ── STOCK ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock (
  id          BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  variante_id BIGINT REFERENCES variantes_producto(id) ON DELETE CASCADE,
  deposito_id BIGINT REFERENCES depositos(id),
  cantidad    INT DEFAULT 0,
  stock_minimo INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, variante_id, deposito_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_producto  ON stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_deposito  ON stock(deposito_id);

-- ── ÓRDENES DE VENTA ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_venta (
  id              BIGSERIAL PRIMARY KEY,
  nro             TEXT NOT NULL UNIQUE,
  cliente_id      BIGINT REFERENCES clientes(id),
  cliente_nombre  TEXT DEFAULT '',
  fecha           DATE DEFAULT CURRENT_DATE,
  fecha_entrega   DATE,
  deposito_id     BIGINT REFERENCES depositos(id),
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

-- ── ITEMS OV ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items_ov (
  id              BIGSERIAL PRIMARY KEY,
  ov_id           BIGINT NOT NULL REFERENCES ordenes_venta(id) ON DELETE CASCADE,
  producto_id     BIGINT REFERENCES productos(id),
  variante_id     BIGINT REFERENCES variantes_producto(id),
  descripcion     TEXT DEFAULT '',
  cantidad        INT DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  descuento_pct   NUMERIC(5,2) DEFAULT 0,
  subtotal        NUMERIC(14,2) DEFAULT 0
);

-- ── FACTURAS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id              BIGSERIAL PRIMARY KEY,
  nro             TEXT NOT NULL,
  tipo            TEXT DEFAULT 'B',
  punto_venta     INT DEFAULT 1,
  cliente_id      BIGINT REFERENCES clientes(id),
  cliente_nombre  TEXT DEFAULT '',
  fecha           DATE DEFAULT CURRENT_DATE,
  fecha_vto       DATE,
  subtotal        NUMERIC(14,2) DEFAULT 0,
  iva_105         NUMERIC(14,2) DEFAULT 0,
  iva_21          NUMERIC(14,2) DEFAULT 0,
  total           NUMERIC(14,2) DEFAULT 0,
  cae             TEXT DEFAULT '',
  cae_vto         DATE,
  estado          TEXT DEFAULT 'pendiente',
  obs             TEXT DEFAULT '',
  pdf_url         TEXT DEFAULT '',
  metodo_pago     TEXT DEFAULT '',
  cond_venta      TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado  ON facturas(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_tipo    ON facturas(tipo);

-- ── ITEMS FACTURA ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items_factura (
  id              BIGSERIAL PRIMARY KEY,
  factura_id      BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  producto_id     BIGINT REFERENCES productos(id),
  variante_id     BIGINT REFERENCES variantes_producto(id),
  descripcion     TEXT DEFAULT '',
  cantidad        INT DEFAULT 1,
  precio_unitario NUMERIC(14,2) DEFAULT 0,
  descuento_pct   NUMERIC(5,2) DEFAULT 0,
  subtotal        NUMERIC(14,2) DEFAULT 0,
  alicuota_iva    NUMERIC(5,2) DEFAULT 21
);

-- ── FACTURA ↔ OV ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factura_ordenes (
  factura_id  BIGINT REFERENCES facturas(id) ON DELETE CASCADE,
  ov_id       BIGINT REFERENCES ordenes_venta(id),
  PRIMARY KEY (factura_id, ov_id)
);

-- ── NOTAS DE CRÉDITO / DÉBITO ────────────────────────────────
CREATE TABLE IF NOT EXISTS comprobantes_nc_nd (
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

-- ── COBRANZAS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobranzas (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT REFERENCES clientes(id),
  fecha       DATE DEFAULT CURRENT_DATE,
  monto       NUMERIC(14,2) DEFAULT 0,
  metodo      TEXT DEFAULT 'transferencia',
  referencia  TEXT DEFAULT '',
  obs         TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── COBRANZA ↔ FACTURAS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobranza_facturas (
  cobranza_id     BIGINT REFERENCES cobranzas(id) ON DELETE CASCADE,
  factura_id      BIGINT REFERENCES facturas(id),
  monto_aplicado  NUMERIC(14,2) DEFAULT 0,
  PRIMARY KEY (cobranza_id, factura_id)
);

-- ── CHEQUES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cheques (
  id            BIGSERIAL PRIMARY KEY,
  cobranza_id   BIGINT REFERENCES cobranzas(id),
  cliente_id    BIGINT REFERENCES clientes(id),
  nro_cheque    TEXT DEFAULT '',
  banco         TEXT DEFAULT '',
  titular       TEXT DEFAULT '',
  fecha_emision DATE,
  fecha_cobro   DATE,
  monto         NUMERIC(14,2) DEFAULT 0,
  estado        TEXT DEFAULT 'cartera',
  obs           TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cheques_estado      ON cheques(estado);
CREATE INDEX IF NOT EXISTS idx_cheques_fecha_cobro ON cheques(fecha_cobro);

-- ── TRIGGER updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','productos','ordenes_venta','facturas']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END$$;

-- ── RLS + POLÍTICAS ──────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_empresa','depositos','clientes','productos','variantes_producto',
    'stock','ordenes_venta','items_ov','facturas','items_factura',
    'factura_ordenes','comprobantes_nc_nd','cobranzas','cobranza_facturas','cheques'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DO $inner$ BEGIN
         CREATE POLICY "acceso_total" ON %I FOR ALL USING (true) WITH CHECK (true);
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $inner$', t);
  END LOOP;
END$$;
