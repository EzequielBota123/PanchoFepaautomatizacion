'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Factura } from '@/lib/types'
import { fmt, fmtDate, diasHasta } from '@/lib/utils'

export function FlujoEfectivo() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading]   = useState(true)
  const [periodo, setPeriodo]   = useState<7 | 15 | 30>(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/facturas')
      const data = await res.json()
      if (Array.isArray(data)) setFacturas(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const pendientes = useMemo(() =>
    facturas.filter(f => f.estado === 'pendiente'),
  [facturas])

  const bucket = (days: number) =>
    pendientes.filter(f => {
      if (!f.fecha_vto) return false
      const d = diasHasta(f.fecha_vto)
      return d >= 0 && d <= days
    })

  const f7  = bucket(7)
  const f15 = bucket(15)
  const f30 = bucket(30)
  const vencidas = pendientes.filter(f => f.fecha_vto && diasHasta(f.fecha_vto) < 0)

  const lista = useMemo(() => {
    const arr = [...pendientes]
      .filter(f => f.fecha_vto)
      .filter(f => {
        const d = diasHasta(f.fecha_vto)
        return d >= -365 && d <= periodo
      })
      .sort((a, b) => new Date(a.fecha_vto!).getTime() - new Date(b.fecha_vto!).getTime())
    return arr
  }, [pendientes, periodo])

  const totalPeriodo = lista.reduce((s, f) => s + f.total, 0)

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>

  return (
    <div className="section-content">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Flujo de Caja</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>Proyección de cobros por vencimiento</p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <FCard label="Próximos 7 días"  valor={f7.reduce((s,f)=>s+f.total,0)}  count={f7.length}  color="#ef4444" />
        <FCard label="Próximos 15 días" valor={f15.reduce((s,f)=>s+f.total,0)} count={f15.length} color="#f59e0b" />
        <FCard label="Próximos 30 días" valor={f30.reduce((s,f)=>s+f.total,0)} count={f30.length} color="#00b37e" />
        <FCard label="Vencidas"         valor={vencidas.reduce((s,f)=>s+f.total,0)} count={vencidas.length} color="#6b7280" />
      </div>

      {/* Barra visual */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '20px 24px', border: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Distribución de cobros pendientes</div>
        {[
          { label: 'Vencidas',   value: vencidas.reduce((s,f)=>s+f.total,0), color: '#6b7280', count: vencidas.length },
          { label: '7 días',     value: f7.reduce((s,f)=>s+f.total,0),       color: '#ef4444',  count: f7.length },
          { label: '15 días',    value: f15.reduce((s,f)=>s+f.total,0),      color: '#f59e0b',  count: f15.length },
          { label: '30 días',    value: f30.reduce((s,f)=>s+f.total,0),      color: '#00b37e',  count: f30.length },
        ].map(({ label, value, color, count }) => {
          const total = pendientes.reduce((s,f)=>s+f.total,0)
          const pct   = total > 0 ? Math.round((value / total) * 100) : 0
          return (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{label} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({count})</span></span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(value)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            Facturas por Vencer — {fmt(totalPeriodo)}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {([7, 15, 30] as const).map(p => (
              <button
                key={p}
                className="btn btn-secondary"
                style={{ padding: '3px 10px', fontSize: 12, fontWeight: periodo === p ? 700 : 400, borderColor: periodo === p ? 'var(--primary)' : undefined }}
                onClick={() => setPeriodo(p)}
              >{p}d</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Cliente','Nro Factura','Importe','Vencimiento','Días'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin facturas para el período</td></tr>
              ) : lista.map(f => {
                const dias = diasHasta(f.fecha_vto)
                const esVencida = dias < 0
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', background: esVencida ? 'rgba(107,114,128,0.04)' : undefined }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500 }}>{f.cliente_nombre}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{f.nro}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(f.total)}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(f.fecha_vto)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: esVencida ? '#6b7280' : dias <= 3 ? '#ef4444' : dias <= 7 ? '#f59e0b' : '#00b37e'
                      }}>
                        {esVencida ? `Venció ${Math.abs(dias)}d atrás` : dias === 0 ? 'Hoy' : `en ${dias}d`}
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
  )
}

function FCard({ label, valor, count, color }: { label: string; valor: number; count: number; color: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '18px 20px', border: '1px solid var(--border)', borderBottom: `3px solid ${color}` }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{fmt(valor)}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{count} factura{count !== 1 ? 's' : ''}</div>
    </div>
  )
}
