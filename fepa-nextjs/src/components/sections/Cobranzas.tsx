'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Factura, EstadoFactura } from '@/lib/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}

const diasHasta = (d: string | null | undefined) => {
  if (!d) return 0
  const hoy  = new Date(); hoy.setHours(0, 0, 0, 0)
  const dest = new Date(d + 'T00:00:00')
  return Math.round((dest.getTime() - hoy.getTime()) / 86400000)
}

type Toast = { id: number; msg: string; ok: boolean }

export function Cobranzas() {
  const [facturas, setFacturas]     = useState<Factura[]>([])
  const [loading, setLoading]       = useState(true)
  const [toasts, setToasts]         = useState<Toast[]>([])
  const [filtro, setFiltro]         = useState<EstadoFactura | 'todas'>('pendiente')
  const [busqueda, setBusqueda]     = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState<Factura | null>(null)
  const [form, setForm]             = useState(emptyForm())
  const [saving, setSaving]         = useState(false)

  const addToast = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const loadFacturas = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/facturas')
      const data = await res.json()
      if (Array.isArray(data)) setFacturas(data)
    } catch {
      addToast('Error cargando facturas', false)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { loadFacturas() }, [loadFacturas])

  // ── derived ──
  const lista = facturas.filter(f => {
    if (filtro !== 'todas' && f.estado !== filtro) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      return f.cliente_nombre.toLowerCase().includes(q) || f.nro.includes(q)
    }
    return true
  }).sort((a, b) => {
    const da = a.fecha_vto || a.fecha
    const db = b.fecha_vto || b.fecha
    return new Date(da).getTime() - new Date(db).getTime()
  })

  const pendientes  = facturas.filter(f => f.estado === 'pendiente')
  const cobradas    = facturas.filter(f => f.estado === 'cobrada')
  const vencidas    = pendientes.filter(f => diasHasta(f.fecha_vto) < 0)
  const totalPend   = pendientes.reduce((s, f) => s + f.total, 0)

  // ── mark as cobrada ──
  const cobrar = async (f: Factura) => {
    if (!confirm(`¿Marcar como cobrada?\n${f.cliente_nombre} — ${fmt(f.total)}`)) return
    try {
      const res = await fetch(`/api/facturas/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cobrada' }),
      })
      if (!res.ok) throw new Error('Error')
      addToast('✅ Marcada como cobrada')
      loadFacturas()
    } catch {
      addToast('Error al marcar', false)
    }
  }

  // ── delete ──
  const eliminar = async (f: Factura) => {
    if (!confirm(`¿Eliminar factura ${f.nro}?`)) return
    try {
      await fetch(`/api/facturas/${f.id}`, { method: 'DELETE' })
      addToast('Factura eliminada')
      loadFacturas()
    } catch {
      addToast('Error al eliminar', false)
    }
  }

  // ── open modal ──
  const abrirNueva = () => {
    setEditando(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const abrirEditar = (f: Factura) => {
    setEditando(f)
    setForm({
      cliente_id:     f.cliente_id,
      cliente_nombre: f.cliente_nombre,
      total:          f.total,
      fecha:          f.fecha,
      fecha_vto:      f.fecha_vto || '',
      estado:         f.estado,
      obs:            f.obs,
      nro:            f.nro,
      tipo:           f.tipo,
    })
    setShowModal(true)
  }

  // ── save ──
  const guardar = async () => {
    if (!form.cliente_nombre || !form.total) {
      addToast('Completá cliente e importe', false)
      return
    }
    setSaving(true)
    try {
      const url    = editando ? `/api/facturas/${editando.id}` : '/api/facturas'
      const method = editando ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          total:    Number(form.total),
          subtotal: Number(form.total),
        }),
      })
      if (!res.ok) throw new Error('Error guardando')
      addToast(editando ? '✅ Factura actualizada' : '✅ Factura creada')
      setShowModal(false)
      loadFacturas()
    } catch {
      addToast('Error guardando', false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="section-content">

      {/* ── TOASTS ── */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.ok ? '#00b37e' : '#ef4444',
            color: '#fff', padding: '10px 18px', borderRadius: 8,
            fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Semáforo de Cobranzas</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {pendientes.length} pendientes · {vencidas.length} vencidas
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNueva}>+ Nueva Factura</button>
      </div>

      {/* ── STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        <StatBox label="Total Pendiente" value={fmt(totalPend)} sub={`${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''}`} color="var(--yellow, #f59e0b)" />
        <StatBox label="Vencidas" value={String(vencidas.length)} sub={fmt(vencidas.reduce((s, f) => s + f.total, 0))} color="#ef4444" />
        <StatBox label="Cobradas" value={String(cobradas.length)} sub={fmt(cobradas.reduce((s, f) => s + f.total, 0))} color="#00b37e" />
      </div>

      {/* ── FILTERS ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {([
          { key: 'todas',     label: `Todas (${facturas.length})` },
          { key: 'pendiente', label: `Pendientes (${pendientes.length})` },
          { key: 'vencidas',  label: `Vencidas (${vencidas.length})` },
          { key: 'cobrada',   label: `Cobradas (${cobradas.length})` },
          { key: 'anulada',   label: `Anuladas (${facturas.filter(f => f.estado === 'anulada').length})` },
        ] as { key: EstadoFactura | 'todas' | 'vencidas'; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            className="btn btn-secondary"
            style={{
              fontWeight: filtro === key || (key === 'vencidas' && filtro === 'pendiente' && busqueda === '__vencidas__') ? 700 : 400,
              borderColor: filtro === key ? 'var(--primary)' : undefined,
              color: filtro === key ? 'var(--primary)' : undefined,
              fontSize: 13,
            }}
            onClick={() => { setFiltro(key === 'vencidas' ? 'pendiente' : key as EstadoFactura | 'todas'); setBusqueda('') }}
          >
            {label}
          </button>
        ))}
        <input
          className="form-control"
          placeholder="🔍 Buscar cliente o nro…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: 200 }}
        />
      </div>

      {/* ── TABLE ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>Sin facturas para mostrar</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Nro','Tipo','Cliente','Total','Fecha','Vencimiento','Estado','Acciones'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(f => {
                const dias      = diasHasta(f.fecha_vto)
                const esVencida = f.estado === 'pendiente' && f.fecha_vto && dias < 0
                const esProxima = f.estado === 'pendiente' && f.fecha_vto && dias >= 0 && dias <= 7
                return (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      opacity: f.estado === 'cobrada' ? 0.55 : 1,
                      background: esVencida ? 'rgba(239,68,68,0.04)' : esProxima ? 'rgba(245,158,11,0.04)' : undefined,
                    }}
                  >
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{f.nro}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{ ...BADGE, background: tipoColor(f.tipo) }}>{f.tipo}</span>
                    </td>
                    <td style={{ ...TD, fontWeight: 500, maxWidth: 200 }}>
                      {f.cliente_nombre}
                      {f.obs && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.obs.slice(0, 50)}</div>}
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>{fmt(f.total)}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(f.fecha)}</td>
                    <td style={TD}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(f.fecha_vto)}</div>
                      {esVencida && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                          Vencida {Math.abs(dias)}d
                        </span>
                      )}
                      {esProxima && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>
                          {dias === 0 ? 'Hoy' : `En ${dias}d`}
                        </span>
                      )}
                    </td>
                    <td style={TD}>
                      <span style={{ ...BADGE, ...estadoStyle(f.estado) }}>
                        {estadoLabel(f.estado)}
                      </span>
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {f.estado === 'pendiente' && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: 12, color: '#00b37e', border: '1px solid rgba(0,179,126,0.3)' }}
                            onClick={() => cobrar(f)}
                          >
                            ✓ Cobrar
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => abrirEditar(f)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                          onClick={() => eliminar(f)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════ MODAL ═══════════════════════════════════════════════ */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 560, boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>
                {editando ? `Editar Factura ${editando.nro}` : 'Nueva Factura'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <FF label="Cliente / Nombre">
                <input
                  className="form-control"
                  value={form.cliente_nombre}
                  onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                  placeholder="Nombre del cliente"
                  autoFocus
                />
              </FF>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Tipo">
                  <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'A' | 'B' | 'C' }))}>
                    <option value="B">B</option>
                    <option value="A">A</option>
                    <option value="C">C</option>
                  </select>
                </FF>
                <FF label="Total ($)">
                  <input
                    className="form-control"
                    type="number"
                    min={0}
                    step={100}
                    value={form.total}
                    onChange={e => setForm(f => ({ ...f, total: Number(e.target.value) }))}
                  />
                </FF>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Fecha">
                  <input
                    className="form-control"
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  />
                </FF>
                <FF label="Vencimiento">
                  <input
                    className="form-control"
                    type="date"
                    value={form.fecha_vto}
                    onChange={e => setForm(f => ({ ...f, fecha_vto: e.target.value }))}
                  />
                </FF>
              </div>
              <FF label="Estado">
                <select
                  className="form-control"
                  value={form.estado}
                  onChange={e => setForm(f => ({ ...f, estado: e.target.value as EstadoFactura }))}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="cobrada">Cobrada</option>
                  <option value="anulada">Anulada</option>
                </select>
              </FF>
              <FF label="Observaciones">
                <textarea
                  className="form-control"
                  rows={2}
                  value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                />
              </FF>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>
                {saving ? 'Guardando…' : editando ? '💾 Actualizar' : '✅ Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
function emptyForm() {
  const hoy = new Date().toISOString().slice(0, 10)
  return {
    cliente_id:     null as number | null,
    cliente_nombre: '',
    total:          0,
    fecha:          hoy,
    fecha_vto:      hoy,
    estado:         'pendiente' as EstadoFactura,
    obs:            '',
    nro:            '',
    tipo:           'B' as 'A' | 'B' | 'C',
  }
}

function estadoLabel(e: EstadoFactura) {
  switch (e) {
    case 'pendiente': return 'Pendiente'
    case 'cobrada':   return 'Cobrada'
    case 'anulada':   return 'Anulada'
  }
}
function estadoStyle(e: EstadoFactura): React.CSSProperties {
  switch (e) {
    case 'pendiente': return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }
    case 'cobrada':   return { background: 'rgba(0,179,126,0.15)',  color: '#00b37e', border: '1px solid rgba(0,179,126,0.3)' }
    case 'anulada':   return { background: 'rgba(107,114,128,0.15)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.3)' }
  }
}
function tipoColor(t: string): string {
  switch (t) {
    case 'A': return '#1d4ed8'
    case 'B': return '#374151'
    case 'C': return '#7c3aed'
    default:  return '#374151'
  }
}

const TH: React.CSSProperties = {
  padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)',
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.03em',
}
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
const BADGE: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#fff',
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: 10, padding: '18px 20px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
