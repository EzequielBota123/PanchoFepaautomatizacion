'use client'
import { useState, useEffect } from 'react'

const MODULOS = [
  { key: 'clientes',      label: 'Clientes',      desc: 'Sincroniza razón social, CUIT, condición IVA' },
  { key: 'facturas',      label: 'Comprobantes',  desc: 'Facturas A/B/C de los últimos 365 días' },
  { key: 'presupuestos',  label: 'Presupuestos',  desc: 'Presupuestos con estado y montos' },
  { key: 'proveedores',   label: 'Proveedores',   desc: 'ABM de proveedores' },
  { key: 'remitos',       label: 'Remitos',       desc: 'Remitos de entrega' },
]

type SyncResult = {
  ok: boolean
  results: Record<string, number>
  errors: string[]
  synced_at: string
}

export function ContabiliumConfig() {
  const [connected, setConnected]       = useState<boolean | null>(null)
  const [testing, setTesting]           = useState(false)
  const [syncing, setSyncing]           = useState(false)
  const [modulos, setModulos]           = useState<string[]>(MODULOS.map(m => m.key))
  const [lastSync, setLastSync]         = useState<SyncResult | null>(null)
  const [connError, setConnError]       = useState('')

  const testConnection = async () => {
    setTesting(true)
    setConnError('')
    try {
      const res = await fetch('/api/sync')
      const data = await res.json()
      setConnected(data.connected)
      if (!data.connected) setConnError(data.error || 'Sin respuesta')
    } catch {
      setConnected(false)
      setConnError('Error de red')
    }
    setTesting(false)
  }

  const sync = async () => {
    if (!confirm(`¿Sincronizar desde Contabilium?\nMódulos: ${modulos.join(', ')}`)) return
    setSyncing(true)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulos }),
      })
      const data = await res.json()
      setLastSync(data)
    } catch {
      alert('Error al sincronizar')
    }
    setSyncing(false)
  }

  useEffect(() => { testConnection() }, [])

  const toggleModulo = (key: string) => {
    setModulos(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 700 }}>
      {/* Estado conexión */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Integración Contabilium</h2>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Sincronizá clientes, comprobantes y más desde tu cuenta de Contabilium
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {connected === null && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Verificando...</span>}
            {connected === true && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1a6b3a', fontWeight: 600, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a6b3a', display: 'inline-block' }} />
                Conectado
              </span>
            )}
            {connected === false && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c8440a', fontWeight: 600, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c8440a', display: 'inline-block' }} />
                Sin conexión
              </span>
            )}
            <button onClick={testConnection} disabled={testing}
              style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {testing ? 'Verificando...' : '↻ Probar'}
            </button>
          </div>
        </div>

        {connected === false && (
          <div style={{ background: '#c8440a10', border: '1px solid #c8440a30', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c8440a' }}>
            <strong>Error:</strong> {connError || 'No se pudo conectar con Contabilium'}.{' '}
            Verificá que la variable de entorno <code style={{ fontFamily: 'IBM Plex Mono, monospace', background: '#c8440a15', padding: '1px 4px', borderRadius: 3 }}>CTB_API_KEY</code> esté configurada en Vercel.
          </div>
        )}

        <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Configuración de variables</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '6px 16px', alignItems: 'center' }}>
            <code style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#1a4a7a' }}>CTB_API_KEY</code>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Tu API Key de Contabilium (Settings → Integraciones → API)</span>
            <code style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#1a4a7a' }}>CTB_PROXY_URL</code>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Opcional — si usás un proxy CORS</span>
          </div>
        </div>
      </div>

      {/* Módulos */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Módulos a sincronizar</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {MODULOS.map(m => (
            <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', border: `1px solid ${modulos.includes(m.key) ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 7, background: modulos.includes(m.key) ? '#c8440a06' : 'transparent' }}>
              <input type="checkbox" checked={modulos.includes(m.key)} onChange={() => toggleModulo(m.key)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{m.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <button onClick={sync} disabled={syncing || !connected || modulos.length === 0}
          style={{
            width: '100%', padding: '12px', background: connected ? 'var(--accent)' : 'var(--muted)',
            color: '#fff', border: 'none', borderRadius: 8, cursor: connected ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 14, opacity: syncing ? 0.7 : 1,
          }}>
          {syncing ? '↻ Sincronizando...' : `↻ Sincronizar ahora (${modulos.length} módulos)`}
        </button>
      </div>

      {/* Resultado */}
      {lastSync && (
        <div style={{ background: 'var(--surface)', border: `1px solid ${lastSync.errors.length ? '#e8b80060' : '#1a6b3a40'}`, borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            {lastSync.errors.length ? '⚠ Sync con advertencias' : '✓ Sincronización exitosa'}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            {new Date(lastSync.synced_at).toLocaleString('es-AR')}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: lastSync.errors.length ? 12 : 0 }}>
            {Object.entries(lastSync.results).map(([key, val]) => (
              <div key={key} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{key}: </span>
                <strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{val}</strong>
              </div>
            ))}
          </div>
          {lastSync.errors.length > 0 && (
            <div style={{ background: '#e8b80010', border: '1px solid #e8b80040', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9a7800', marginBottom: 4 }}>Errores parciales:</div>
              {lastSync.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#9a7800' }}>• {e}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Cómo obtener API key */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--muted)' }}>¿Cómo obtener la API Key de Contabilium?</h3>
        <ol style={{ paddingLeft: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
          <li>Ingresá a tu cuenta en <strong>app.contabilium.com</strong></li>
          <li>Ir a <strong>Configuración → Integraciones → API</strong></li>
          <li>Copiá el API Key generado</li>
          <li>En Vercel: <strong>Settings → Environment Variables</strong> → agregar <code style={{ fontFamily: 'IBM Plex Mono, monospace' }}>CTB_API_KEY</code></li>
          <li>Redesplegá la app y hacé click en <strong>Probar</strong> arriba</li>
        </ol>
      </div>
    </div>
  )
}
