'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Cliente, MovimientoCC } from '@/lib/types'

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-AR')

const TIPO_LABEL: Record<string, { label: string; color: string }> = {
  factura: { label: 'Factura',   color: '#c8440a' },
  cobro:   { label: 'Cobro',     color: '#1a6b3a' },
  nc:      { label: 'Nota Cto.', color: '#1a4a7a' },
  nd:      { label: 'Nota Dto.', color: '#9a7800' },
  ajuste:  { label: 'Ajuste',    color: '#8a8278' },
}

interface CCData {
  cliente: {
    razon_social:   string
    saldo_deudor:   number
    limite_credito: number
  }
  movimientos: MovimientoCC[]
}

export function CuentaCorriente() {
  const [clientes, setClientes]     = useState<Cliente[]>([])
  const [clienteId, setClienteId]   = useState<string>('')
  const [data, setData]             = useState<CCData | null>(null)
  const [loading, setLoading]       = useState(false)
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [search, setSearch]         = useState('')

  useEffect(() => {
    fetch('/api/clientes').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setClientes(d)
      setLoadingClientes(false)
    })
  }, [])

  useEffect(() => {
    if (!clienteId) { setData(null); return }
    setLoading(true)
    fetch(`/api/cuenta-corriente/${clienteId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [clienteId])

  const filtered = useMemo(() => {
    if (!data) return []
    if (!search) return data.movimientos
    const q = search.toLowerCase()
    return data.movimientos.filter(m => m.descripcion.toLowerCase().includes(q) || m.tipo.includes(q))
  }, [data, search])

  const clientesFiltrados = useMemo(() => {
    if (!search && clienteId) return clientes
    return clientes.filter(c => c.activo)
  }, [clientes, search, clienteId])

  const saldoActual = data?.movimientos.length
    ? data.movimientos[data.movimientos.length - 1].saldo
    : 0

  if (loadingClientes) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selector de cliente */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Seleccionar cliente</div>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, maxWidth: 500 }}>
          <option value="">— Elegir cliente —</option>
          {clientesFiltrados.map(c => (
            <option key={c.id} value={c.id}>
              {c.razon_social}{c.saldo_deudor > 0 ? ` — Deuda: ${fmt(c.saldo_deudor)}` : ''}
            </option>
          ))}
        </select>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Cargando movimientos...</div>}

      {data && !loading && (
        <>
          {/* Info cliente + saldo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', gridColumn: '1 / 3' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>CLIENTE</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{data.cliente?.razon_social}</div>
              {data.cliente?.limite_credito > 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Límite crédito: <strong>{fmt(data.cliente.limite_credito)}</strong>
                  {' '}— Uso: <strong style={{ color: saldoActual > data.cliente.limite_credito ? '#c8440a' : '#1a6b3a' }}>
                    {data.cliente.limite_credito > 0 ? Math.round((saldoActual / data.cliente.limite_credito) * 100) : 0}%
                  </strong>
                </div>
              )}
            </div>
            <div style={{
              background: saldoActual > 0 ? '#c8440a10' : '#1a6b3a10',
              border: `1px solid ${saldoActual > 0 ? '#c8440a40' : '#1a6b3a40'}`,
              borderRadius: 8, padding: '14px 18px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>SALDO DEUDOR</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'IBM Plex Mono, monospace', color: saldoActual > 0 ? '#c8440a' : '#1a6b3a' }}>
                {fmt(Math.abs(saldoActual))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {saldoActual > 0 ? 'Debe' : saldoActual < 0 ? 'A favor' : 'Sin deuda'}
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>MOVIMIENTOS</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>{data.movimientos.length}</div>
            </div>
          </div>

          {/* Totales por tipo */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Facturado', val: data.movimientos.filter(m => m.tipo === 'factura').reduce((s, m) => s + m.debe, 0), color: '#c8440a' },
              { label: 'Cobrado',   val: data.movimientos.filter(m => m.tipo === 'cobro').reduce((s, m) => s + m.haber, 0), color: '#1a6b3a' },
              { label: 'NC emitidas', val: data.movimientos.filter(m => m.tipo === 'nc').reduce((s, m) => s + m.haber, 0), color: '#1a4a7a' },
            ].map(t => (
              <div key={t.label} style={{ background: 'var(--surface)', border: `1px solid ${t.color}30`, borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 11, color: t.color, marginBottom: 4, fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 16 }}>{fmt(t.val)}</div>
              </div>
            ))}
          </div>

          {/* Filtro */}
          <input placeholder="Buscar en movimientos..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, maxWidth: 360 }} />

          {/* Tabla de movimientos */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Tipo', 'Descripción', 'Debe', 'Haber', 'Saldo'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Debe' || h === 'Haber' || h === 'Saldo' ? 'right' : 'left', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Sin movimientos</td></tr>
                )}
                {filtered.map((m, i) => {
                  const t = TIPO_LABEL[m.tipo] || { label: m.tipo, color: '#8a8278' }
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                      <td style={{ padding: '9px 14px' }}>{fmtDate(m.fecha)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ background: t.color + '15', color: t.color, border: `1px solid ${t.color}30`, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 600, fontFamily: 'IBM Plex Mono, monospace' }}>
                          {t.label}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: m.debe > 0 ? '#c8440a' : 'var(--muted)' }}>
                        {m.debe > 0 ? fmt(m.debe) : ''}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: m.haber > 0 ? '#1a6b3a' : 'var(--muted)' }}>
                        {m.haber > 0 ? fmt(m.haber) : ''}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: m.saldo > 0 ? '#c8440a' : m.saldo < 0 ? '#1a4a7a' : 'var(--muted)' }}>
                        {fmt(m.saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
                    <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>SALDO ACTUAL</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: '#c8440a' }}>
                      {fmt(filtered.reduce((s, m) => s + m.debe, 0))}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: '#1a6b3a' }}>
                      {fmt(filtered.reduce((s, m) => s + m.haber, 0))}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 800, fontSize: 15, color: saldoActual > 0 ? '#c8440a' : '#1a6b3a' }}>
                      {fmt(saldoActual)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {!clienteId && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>◎</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Seleccioná un cliente</div>
          <div style={{ fontSize: 13 }}>Verás todos sus movimientos: facturas, cobros y notas de crédito con saldo running</div>
        </div>
      )}
    </div>
  )
}
