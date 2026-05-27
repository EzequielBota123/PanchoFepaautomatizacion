'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Cliente, Factura } from '@/lib/types'
import { fmt, fmtDate, semaforo } from '@/lib/utils'

const fmtPeso = fmt

export function Deudores() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading]   = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [detalle, setDetalle]   = useState<Cliente | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rc, rf] = await Promise.all([
        fetch('/api/clientes').then(r => r.json()),
        fetch('/api/facturas?estado=pendiente').then(r => r.json()),
      ])
      if (Array.isArray(rc)) setClientes(rc)
      if (Array.isArray(rf)) setFacturas(rf)
    } catch (e) {
      console.error('Deudores load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const deudores = useMemo(() =>
    clientes
      .filter(c => c.saldo_deudor > 0)
      .filter(c => !busqueda || c.razon_social.toLowerCase().includes(busqueda.toLowerCase()))
      .sort((a, b) => b.saldo_deudor - a.saldo_deudor),
    [clientes, busqueda]
  )

  const totalSaldo  = deudores.reduce((s, c) => s + c.saldo_deudor, 0)
  const enRiesgo    = deudores.filter(c => semaforo(c) === 'rojo').length
  const enAtencion  = deudores.filter(c => semaforo(c) === 'amarillo').length

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
  }

  return (
    <div className="section-content">
      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        <div style={STAT_CARD}>
          <div style={STAT_LABEL}>Saldo Total Cartera</div>
          <div style={{ ...STAT_VAL, color: '#ef4444' }}>{fmtPeso(totalSaldo)}</div>
          <div style={STAT_SUB}>{deudores.length} clientes con saldo</div>
        </div>
        <div style={STAT_CARD}>
          <div style={STAT_LABEL}>En Riesgo 🔴</div>
          <div style={{ ...STAT_VAL, color: '#ef4444' }}>{enRiesgo}</div>
          <div style={STAT_SUB}>Límite de crédito alcanzado</div>
        </div>
        <div style={STAT_CARD}>
          <div style={STAT_LABEL}>Requieren Atención 🟡</div>
          <div style={{ ...STAT_VAL, color: '#f59e0b' }}>{enAtencion}</div>
          <div style={STAT_SUB}>&gt;80% del límite utilizado</div>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Clientes con saldo deudor</span>
          <input
            className="form-control"
            placeholder="🔍 Buscar…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ width: 200 }}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Cliente','Zona','Método Pago','Saldo Deudor','Límite Crédito','% Utilizado','WhatsApp','Estado'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deudores.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Sin clientes con saldo deudor
                  </td>
                </tr>
              )}
              {deudores.map(c => {
                const facturasc = facturas.filter(f => f.cliente_id === c.id)
                const estado    = semaforo(c)
                const pct       = c.limite_credito > 0 ? Math.min(100, Math.round((c.saldo_deudor / c.limite_credito) * 100)) : null
                const alerta    = estado === 'rojo'
                const waMsg     = encodeURIComponent(
                  `Hola ${c.razon_social}, te contactamos de FEPA Mayorista. Tenés un saldo pendiente de ${fmtPeso(c.saldo_deudor)}. ¿Podemos coordinar el pago?`
                )
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: alerta ? 'rgba(239,68,68,0.04)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => setDetalle(c)}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {alerta && <span style={{ marginRight: 5 }}>🔴</span>}
                      {c.razon_social}
                      {facturasc.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {facturasc.length} factura{facturasc.length > 1 ? 's' : ''} pendiente{facturasc.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{c.zona || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12 }}>{c.metodo_pago}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>
                      {fmtPeso(c.saldo_deudor)}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>
                      {c.limite_credito > 0 ? fmtPeso(c.limite_credito) : '∞'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {pct !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#00b37e', transition: 'width .3s' }} />
                          </div>
                          <span style={{ fontSize: 11, minWidth: 30, color: pct >= 100 ? '#ef4444' : 'var(--text-muted)' }}>{pct}%</span>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                      {c.whatsapp && (
                        <a
                          href={`https://wa.me/54${c.whatsapp.replace(/\D/g, '')}?text=${waMsg}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, textDecoration: 'none' }}
                          title="Enviar mensaje de cobranza por WhatsApp"
                        >
                          📱 WA
                        </a>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                        background: estado === 'rojo' ? 'rgba(239,68,68,0.15)' : estado === 'amarillo' ? 'rgba(245,158,11,0.15)' : 'rgba(0,179,126,0.15)',
                        color: estado === 'rojo' ? '#ef4444' : estado === 'amarillo' ? '#f59e0b' : '#00b37e',
                        border: `1px solid ${estado === 'rojo' ? 'rgba(239,68,68,0.3)' : estado === 'amarillo' ? 'rgba(245,158,11,0.3)' : 'rgba(0,179,126,0.3)'}`,
                      }}>
                        {estado === 'rojo' ? 'En riesgo' : estado === 'amarillo' ? 'Atención' : 'Al día'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detalle side panel ── */}
      {detalle && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setDetalle(null)}
        >
          <div
            style={{ width: 400, background: 'var(--bg-secondary)', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detalle.razon_social}</h3>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>{detalle.cuit || 'Sin CUIT'}</div>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ padding: '14px 16px', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saldo Deudor</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>{fmtPeso(detalle.saldo_deudor)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Límite Crédito</span>
                <span style={{ fontFamily: 'monospace' }}>{detalle.limite_credito > 0 ? fmtPeso(detalle.limite_credito) : '∞'}</span>
              </div>
              {detalle.limite_credito > 0 && (
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, Math.round((detalle.saldo_deudor / detalle.limite_credito) * 100))}%`,
                    background: detalle.saldo_deudor >= detalle.limite_credito ? '#ef4444' : '#f59e0b',
                  }} />
                </div>
              )}
            </div>

            <DRow label="Email" value={detalle.email || '—'} />
            <DRow label="Teléfono" value={detalle.telefono || '—'} />
            <DRow label="Zona" value={detalle.zona || '—'} />
            <DRow label="Vendedor" value={detalle.vendedor || '—'} />
            <DRow label="Método de Pago" value={detalle.metodo_pago} />
            <DRow label="Cond. IVA" value={detalle.cond_iva} />

            {/* Facturas pendientes */}
            {(() => {
              const facs = facturas.filter(f => f.cliente_id === detalle.id)
              if (facs.length === 0) return null
              return (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                    Facturas Pendientes ({facs.length})
                  </div>
                  {facs.map(f => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.nro}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.fecha_vto ? `Vto: ${fmtDate(f.fecha_vto)}` : ''}</div>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtPeso(f.total)}</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {detalle.whatsapp && (
              <a
                href={`https://wa.me/54${detalle.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${detalle.razon_social}, te contactamos de FEPA Mayorista. Tenés un saldo pendiente de ${fmtPeso(detalle.saldo_deudor)}. ¿Podemos coordinar el pago?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ display: 'block', textAlign: 'center', marginTop: 20, textDecoration: 'none' }}
              >
                📱 Enviar WA de cobranza
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const STAT_CARD: React.CSSProperties = { background: 'var(--bg-secondary)', borderRadius: 10, padding: '18px 20px', border: '1px solid var(--border)' }
const STAT_LABEL: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }
const STAT_VAL: React.CSSProperties  = { fontSize: 26, fontWeight: 800, lineHeight: 1 }
const STAT_SUB: React.CSSProperties  = { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }

function DRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}
