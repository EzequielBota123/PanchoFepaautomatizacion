-- Tabla prospectos para el Pipeline de Ventas
-- Ejecutar en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS prospectos (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  zona        TEXT DEFAULT '',
  tel         TEXT DEFAULT '',
  potencial   NUMERIC(14,2) DEFAULT 0,
  vendedor    TEXT DEFAULT '',
  etapa       TEXT DEFAULT 'contacto',
  notas       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospectos_etapa ON prospectos(etapa);

ALTER TABLE prospectos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE 
