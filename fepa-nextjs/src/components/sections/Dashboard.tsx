'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Cliente, Factura, OrdenVenta } from '@/lib/types'
import { fmt, fmtDate, diasHasta } from '@/lib/utils'

const fmtPeso = fmt

export function Dashboard() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [ordenes, setOrdenes]   = useState<OrdenVenta[]>([])
  const [loading, setLoading]   = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rc, rf, ro] = await Promise.all([
        fetch('/api/clientes?activo=true').then(r => r.json()),
        fetch('/api/facturas').then(r => r.json()),
        fetch('/api/ordenes').then(r => r.json()),
      ])
      if (Array.isArray(rc)) setClientes(rc)
      if (Array.isArray(rf)) setFacturas(rf)
      if (Array.isArray(ro)) setOrdenes(ro)
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
  }

  const pendientes = facturas.filter(f => f.estado === 'pendiente')
  const cobradas   = facturas.filter(f => f.estado === 'cobrada')
  const vencidas   = pendientes.filter(f => f.fecha_vto && diasHasta(f.fecha_vto) < 0)
  const vence7     = pendientes.filter(f => { const d = diasHasta(f.fecha_vto); return d >= 0 && d <= 7 })
  const vence30    = pendientes.filter(f => { const d = diasHasta(f.fecha_vto); return d >= 0 && d <= 30 })

  const totalPend  = pendientes.reduce((s, f) => s + f.total, 0)
  const totalVence7  = vence7.reduce((s, f) => s + f.total, 0)
  const totalVence30 = vence30.reduce((s, f) => s + f.total, 0)
  const totalCobrado = cobradas.reduce((s, f) => s + f.total, 0)

  const ovsPendientes   = ordenes.filter(o => o.estado === 'pendiente')
  const totalOVPend     = ovsPendientes.reduce((s, o) => s + o.total, 0)
  const topOVClientes   = Object.values(
    ovsPendientes.reduce((acc, o) => {
      const key = o.cliente_nombre
      if (!acc[key]) acc[key] = { nombre: key, total: 0, count: 0 }
      acc[key].total += o.total
      acc[key].count++
      return acc
    }, {} as Record<string, { nombre: string; total: number; count: number }>)
  ).sort((a, b) => b.total - a.total).slice(0, 5)

  const conSaldo    = clientes.filter(c => c.saldo_deudor > 0)
  const totalSaldo  = conSaldo.reduce((s, c) => s + c.saldo_deudor, 0)
  const conAlerta   = clientes.filter(c => c.limite_credito > 0 && c.saldo_deudor >= c.limite_credito)

  const topDeudores = [...conSaldo]
    .sort((a, b) => b.saldo_deudor - a.saldo_deudor)
    .slice(0, 5)

  const proximasAVencer = [...pendientes]
    .filter(f => f.fecha_vto && diasHasta(f.fecha_vto) >= 0)
    .sort((a, b) => new Date(a.fecha_vto!).getTime() - new Date(b.fecha_vto!).getTime())
    .slice(0, 5)

  return (
    <div>
      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <StatBox label="OVs Pendientes"        value={fmtPeso(totalOVPend)}  sub={`${ovsPendientes.length} órdenes`}  color="#c8440a" />
        <StatBox label="Facturas Pendientes"   value={fmtPeso(totalPend)}    sub={`${pendientes.length} facturas`}    color="#f59e0b" />
        <StatBox label="Vencen en 7 días"      value={fmtPeso(totalVence7)}  sub={`${vence7.length} facturas`}        color="#f97316" />
        <StatBox label="Cobrado (total)"       value={fmtPeso(totalCobrado)} sub={`${cobradas.length} cobradas`}      color="#00b37e" />
      </div>

      {/* ── Alerts banner ── */}
      {(vencidas.length > 0 || conAlerta.length > 0) && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {vencidas.length > 0 && (
            <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 14 }}>
              ⚠️ <strong>{vencidas.length} factura{vencidas.length > 1 ? 's' : ''} vencida{vencidas.length > 1 ? 's' : ''}</strong> — {fmtPeso(vencidas.reduce((s, f) => s + f.total, 0))} sin cobrar
            </div>
          )}
          {conAlerta.length > 0 && (
            <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 14 }}>
              🔴 <strong>{conAlerta.length} cliente{conAlerta.length > 1 ? 's' : ''}</strong> con límite de crédito alcanzado
            </div>
          )}
        </div>
      )}

      {/* ── Two columns ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Flujo de caja */}
        <div style={CARD}>
          <div style={CARD_HEADER}><span style={{ fontWeight: 700 }}>Flujo de Caja — Próximos vencimientos</span></div>
          <div style={{ padding: '12px 20px' }}>
            <FlujoBarra label="7 días"  valor={totalVence7}  total={totalPend} count={vence7.length}  color="#ef4444" />
            <FlujoBarra label="30 días" valor={totalVence30} total={totalPend} count={vence30.length} color="#f59e0b" />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
              <span>Total pendiente:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmtPeso(totalPend)}</span>
            </div>
          </div>
        </div>

        {/* Próximas a vencer */}
        <div style={CARD}>
          <div style={CARD_HEADER}><span style={{ fontWeight: 700 }}>Próximas a Vencer</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Cliente','Total','Vto','Días'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proximasAVencer.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin vencimientos próximos</td></tr>
                )}
                {proximasAVencer.map(f => {
                  const dias = diasHasta(f.fecha_vto)
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.cliente_nombre}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{fmtPeso(f.total)}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{fmtDate(f.fecha_vto)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: dias <= 3 ? '#ef4444' : dias <= 7 ? '#f59e0b' : '#00b37e' }}>
                          {dias === 0 ? 'Hoy' : `${dias}d`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Top clientes OV pendiente ── */}
      {topOVClientes.length > 0 && (
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={CARD_HEADER}><span style={{ fontWeight: 700 }}>Top Clientes — OVs Pendientes</span><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtPeso(totalOVPend)}</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Cliente','OVs','Total pendiente','% del total'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topOVClientes.map((c, i) => {
                  const pct = totalOVPend > 0 ? Math.round((c.total / totalOVPend) * 100) : 0
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }}>{c.nombre}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{c.count}</td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#c8440a' }}>{fmtPeso(c.total)}</td>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: '#c8440a' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top deudores ── */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={CARD_HEADER}><span style={{ fontWeight: 700 }}>Top Deudores</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Cliente','Zona','Método Pago','Saldo Deudor','Límite','% Utilizado'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topDeudores.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Sin deudores registrados</td></tr>
              )}
              {topDeudores.map(c => {
                const pct = c.limite_credito > 0 ? Math.min(100, Math.round((c.saldo_deudor / c.limite_credito) * 100)) : null
                const alerta = c.limite_credito > 0 && c.saldo_deudor >= c.limite_credito
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>
                      {alerta && <span style={{ marginRight: 5 }}>🔴</span>}
                      {c.razon_social}
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{c.zona || '—'}</td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{c.metodo_pago}</td>
                    <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>{fmtPeso(c.saldo_deudor)}</td>
                    <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {c.limite_credito > 0 ? fmtPeso(c.limite_credito) : '∞'}
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      {pct !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: alerta ? '#ef4444' : pct > 80 ? '#f59e0b' : '#00b37e' }} />
                          </div>
                          <span style={{ fontSize: 11, color: alerta ? '#ef4444' : 'var(--text-muted)', minWidth: 32 }}>{pct}%</span>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Vencidas ── */}
      {vencidas.length > 0 && (
        <div style={{ ...CARD, border: '1px solid rgba(239,68,68,0.3)' }}>
          <div style={{ ...CARD_HEADER, color: '#ef4444' }}>
            <span style={{ fontWeight: 700 }}>⚠ Facturas Vencidas ({vencidas.length})</span>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtPeso(vencidas.reduce((s, f) => s + f.total, 0))}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Cliente','Nro','Total','Venció hace'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vencidas.slice(0, 8).map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{f.cliente_nombre}</td>
                    <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 12 }}>{f.nro}</td>
                    <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{fmtPeso(f.total)}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>
                        {Math.abs(diasHasta(f.fecha_vto))}d atrás
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '18px 20px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function FlujoBarra({ label, valor, total, count, color }: { label: string; valor: number; total: number; count: number; color: string }) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: 'monospace' }}>
          {fmt(valor)} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {count} facturas</span>
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

const CARD: React.CSSProperties = { background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }
const CARD_HEADER: React.CSSProperties = { padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }
