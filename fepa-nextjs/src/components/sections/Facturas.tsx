'use client'
import { useState, useRef, useCallback } from 'react'
import { useApp } from '../App'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s?: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const METODO_LABEL: Record<string, string> = {
  contado: 'Contado', transferencia: 'Transf.', cheque_30: 'Cheque 30',
  cheque_60: 'Cheque 60', cheque_90: 'Cheque 90', cheque_120: 'Cheque 120', mixto: 'Mixto',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#d97706', cobrada: '#1a6b3a', vencida: '#c8440a',
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const MODAL_BOX: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 12, padding: 32,
  width: '92%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 8px 48px rgba(0,0,0,0.22)',
}

type ImportResult = {
  total: number; validas: number; invalidas: number
  columnas_detectadas?: string[]
  filas: Array<{ fila: number; cliente_nombre: string; tipo: string; total: number; fecha: string; metodo_pago: string; errores: string[]; valido: boolean }>
}

export function Facturas() {
  const { facturas, updateFactura, reload } = useApp()

  const [filtro, setFiltro]               = useState<'todas'|'pendiente'|'cobrada'>('todas')
  const [busqueda, setBusqueda]           = useState('')
  const [showImport, setShowImport]       = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult]   = useState<ImportResult | null>(null)
  const [importando, setImportando]       = useState(false)
  const [pendingFile, setPendingFile]     = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const visibles = facturas
    .filter(f => filtro === 'todas' || f.estado === filtro)
    .filter(f => {
      if (!busqueda) return true
      const q = busqueda.toLowerCase()
      return (
        f.cliente_nombre?.toLowerCase().includes(q) ||
        f.nro?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

  const totalPendiente = facturas.filter(f => f.estado === 'pendiente').reduce((s, f) => s + f.total, 0)
  const totalCobrada   = facturas.filter(f => f.estado === 'cobrada').reduce((s, f) => s + f.total, 0)
  const ctPendiente    = facturas.filter(f => f.estado === 'pendiente').length
  const ctCobrada      = facturas.filter(f => f.estado === 'cobrada').length

  const marcarCobrada = useCallback(async (id: number) => {
    if (!confirm('¿Marcar esta factura como cobrada?')) return
    await updateFactura(id, { estado: 'cobrada' })
  }, [updateFactura])

  // ── Import ──
  const handleFile = useCallback(async (file: File) => {
    setPendingFile(file)
    setImportLoading(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('modo', 'preview')
    try {
      const res  = await fetch('/api/facturas/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Error al leer el archivo'); return }
      setImportResult(data)
    } finally {
      setImportLoading(false)
    }
  }, [])

  const confirmarImport = useCallback(async () => {
    if (!pendingFile) return
    setImportando(true)
    const fd = new FormData()
    fd.append('file', pendingFile)
    fd.append('modo', 'import')
    try {
      const res  = await fetch('/api/facturas/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Error al importar'); return }
      alert(`✅ ${data.importados} factura${data.importados !== 1 ? 's' : ''} importada${data.importados !== 1 ? 's' : ''}${data.invalidas ? ` · ${data.invalidas} con errores omitidas` : ''}`)
      setShowImport(false)
      setImportResult(null)
      setPendingFile(null)
      await reload()
    } finally {
      setImportando(false)
    }
  }, [pendingFile, reload])

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Facturas</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {ctPendiente} pendiente{ctPendiente !== 1 ? 's' : ''} · {fmt(totalPendiente)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => window.open('/api/facturas/template', '_blank')}>
            📋 Plantilla Excel
          </button>
          <button className="btn btn-secondary" onClick={() => { setImportResult(null); setPendingFile(null); setShowImport(true) }}>
            ⬆ Importar Excel
          </button>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total facturas', value: facturas.length, sub: '', color: 'var(--text)' },
          { label: 'Pendientes',     value: ctPendiente,    sub: fmt(totalPendiente), color: '#d97706' },
          { label: 'Cobradas',       value: ctCobrada,      sub: fmt(totalCobrada),   color: '#1a6b3a' },
          { label: 'Monto total',    value: fmt(totalPendiente + totalCobrada), sub: 'facturado', color: 'var(--accent3)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: typeof s.value === 'string' ? 18 : 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['todas','pendiente','cobrada'] as const).map(f => (
          <button key={f} className="btn btn-secondary"
            style={{ fontWeight: filtro === f ? 700 : 400, borderColor: filtro === f ? 'var(--primary)' : undefined }}
            onClick={() => setFiltro(f)}>
            {f === 'todas' ? 'Todas' : f === 'pendiente' ? 'Pendientes' : 'Cobradas'}
          </button>
        ))}
        <input
          placeholder="Buscar cliente o nro…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '7px 12px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 13, width: 220,
          }}
        />
      </div>

      {/* TABLA */}
      {visibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
          <div>No hay facturas{filtro !== 'todas' ? ` ${filtro}s` : ''}</div>
          {filtro === 'todas' && (
            <button className="btn btn-primary" style={{ marginTop: 16 }}
              onClick={() => { setImportResult(null); setPendingFile(null); setShowImport(true) }}>
              ⬆ Importar desde Excel
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                {['Nro','Cliente','Fecha','Vencimiento','Total','Método','Estado',''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, i) => (
                <tr key={f.id} style={{ borderBottom: i < visibles.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{f.nro}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500 }}>{f.cliente_nombre || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{fmtDate(f.fecha)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: f.fecha_vto ? 'var(--text)' : 'var(--text-muted)' }}>{fmtDate(f.fecha_vto)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 600 }}>{fmt(f.total)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{METODO_LABEL[f.metodo_pago || ''] || f.metodo_pago || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      background: `${ESTADO_COLOR[f.estado] || '#888'}22`,
                      color: ESTADO_COLOR[f.estado] || '#888',
                      borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    }}>{f.estado}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {f.estado === 'pendiente' && (
                      <button className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 11, color: '#1a6b3a', borderColor: '#1a6b3a33' }}
                        onClick={() => marcarCobrada(f.id)}>
                        ✓ Cobrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL IMPORT */}
      {showImport && (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setShowImport(false) }}>
          <div style={MODAL_BOX}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>Importar Facturas desde Excel</h3>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {!importResult ? (
              <div>
                <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: 14 }}>
                  El archivo debe tener columnas: <strong>Cliente, Tipo, Total, Fecha, Fecha Vto, Metodo Pago, Obs</strong>.<br/>
                  Descargá la plantilla para ver el formato exacto.
                </p>
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed var(--border)', borderRadius: 10, padding: '48px 24px',
                    textAlign: 'center', cursor: 'pointer', color: 'var(--text-muted)',
                    background: 'var(--bg)', transition: 'border-color .15s',
                  }}
                >
                  {importLoading
                    ? <div>Analizando archivo…</div>
                    : <>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Arrastrá tu Excel o hacé click</div>
                        <div style={{ fontSize: 12 }}>.xlsx · máximo 500 filas</div>
                      </>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => window.open('/api/facturas/template', '_blank')}>📋 Descargar Plantilla</button>
                  <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  {[
                    { label: 'Total filas', value: importResult.total, color: 'var(--text)' },
                    { label: 'Válidas', value: importResult.validas, color: '#1a6b3a' },
                    { label: 'Con errores', value: importResult.invalidas, color: importResult.invalidas > 0 ? '#c8440a' : 'var(--text-muted)' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {importResult.columnas_detectadas && importResult.columnas_detectadas.length > 0 && (
                  <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 6, padding: '8px 12px' }}>
                    Columnas detectadas: <strong>{importResult.columnas_detectadas.join(', ')}</strong>
                  </div>
                )}

                <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)' }}>
                      <tr>
                        {['Fila','Cliente','Tipo','Total','Fecha','Estado'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.filas.map(f => (
                        <tr key={f.fila} style={{ borderBottom: '1px solid var(--border)', background: f.valido ? 'transparent' : '#fff0ef' }}>
                          <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{f.fila}</td>
                          <td style={{ padding: '7px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.cliente_nombre || <em style={{ color: '#c8440a' }}>vacío</em>}</td>
                          <td style={{ padding: '7px 12px' }}>{f.tipo}</td>
                          <td style={{ padding: '7px 12px', fontFamily: 'IBM Plex Mono, monospace' }}>{f.total > 0 ? fmt(f.total) : <em style={{ color: '#c8440a' }}>0</em>}</td>
                          <td style={{ padding: '7px 12px' }}>{f.fecha}</td>
                          <td style={{ padding: '7px 12px' }}>
                            {f.valido
                              ? <span style={{ color: '#1a6b3a', fontWeight: 600 }}>✓ OK</span>
                              : <span style={{ color: '#c8440a' }} title={f.errores.join(' · ')}>✕ {f.errores.join(' · ')}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => { setImportResult(null); setPendingFile(null) }}>← Cargar otro</button>
                  <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={confirmarImport}
                    disabled={importResult.validas === 0 || importando}>
                    {importando ? 'Importando…' : `✅ Importar ${importResult.validas} factura${importResult.validas !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
