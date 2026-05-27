'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { OrdenVenta, EstadoOV, Cliente } from '@/lib/types'
import { fmt, fmtDate, diasHasta } from '@/lib/utils'

type Toast = { id: number; msg: string; ok: boolean }

const ESTADOS: { value: EstadoOV; label: string; color: string }[] = [
  { value: 'pendiente',          label: 'Pendiente',        color: '#f59e0b' },
  { value: 'facturada_parcial',  label: 'Fact. Parcial',    color: '#3b82f6' },
  { value: 'facturada_total',    label: 'Facturada Total',  color: '#00b37e' },
  { value: 'anulada',            label: 'Anulada',          color: '#6b7280' },
]

export function Ordenes() {
  const [ordenes, setOrdenes]     = useState<OrdenVenta[]>([])
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [loading, setLoading]     = useState(true)
  const [toasts, setToasts]       = useState<Toast[]>([])
  const [filtro, setFiltro]       = useState<EstadoOV | 'todas'>('pendiente')
  const [busqueda, setBusqueda]   = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<OrdenVenta | null>(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)

  const addToast = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [ro, rc] = await Promise.all([
        fetch('/api/ordenes').then(r => r.json()),
        fetch('/api/clientes?activo=true').then(r => r.json()),
      ])
      if (Array.isArray(ro)) setOrdenes(ro)
      if (Array.isArray(rc)) setClientes(rc)
    } catch {
      addToast('Error cargando datos', false)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { cargar() }, [cargar])

  const lista = useMemo(() => {
    let arr = [...ordenes]
    if (filtro !== 'todas') arr = arr.filter(o => o.estado === filtro)
    if (busqueda) arr = arr.filter(o =>
      o.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      o.nro.toLowerCase().includes(busqueda.toLowerCase())
    )
    return arr.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  }, [ordenes, filtro, busqueda])

  const pendientes = ordenes.filter(o => o.estado === 'pendiente')
  const totalPend  = pendientes.reduce((s, o) => s + o.total, 0)

  const abrirNueva = () => {
    setEditando(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const abrirEditar = (o: OrdenVenta) => {
    setEditando(o)
    setForm({
      cliente_id:     o.cliente_id,
      cliente_nombre: o.cliente_nombre,
      total:          o.total,
      subtotal:       o.subtotal,
      descuento:      o.descuento,
      fecha:          o.fecha,
      fecha_entrega:  o.fecha_entrega || '',
      estado:         o.estado,
      obs:            o.obs,
      vendedor:       o.vendedor,
    })
    setShowModal(true)
  }

  const guardar = async () => {
    if (!form.cliente_nombre) { addToast('Seleccioná o escribí el cliente', false); return }
    setSaving(true)
    try {
      const url    = editando ? `/api/ordenes/${editando.id}` : '/api/ordenes'
      const method = editando ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          total:    Number(form.total),
          subtotal: Number(form.subtotal || form.total),
        }),
      })
      if (!res.ok) throw new Error('Error guardando')
      addToast(editando ? '✅ OV actualizada' : '✅ OV creada')
      setShowModal(false)
      cargar()
    } catch {
      addToast('Error guardando', false)
    } finally {
      setSaving(false)
    }
  }

  const cambiarEstado = async (o: OrdenVenta, estado: EstadoOV) => {
    try {
      await fetch(`/api/ordenes/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      setOrdenes(prev => prev.map(x => x.id === o.id ? { ...x, estado } : x))
      addToast(`✅ Estado cambiado a ${ESTADOS.find(e => e.value === estado)?.label}`)
    } catch {
      addToast('Error cambiando estado', false)
    }
  }

  const eliminar = async (o: OrdenVenta) => {
    if (!confirm(`¿Eliminar OV ${o.nro}?`)) return
    try {
      await fetch(`/api/ordenes/${o.id}`, { method: 'DELETE' })
      setOrdenes(prev => prev.filter(x => x.id !== o.id))
      addToast('OV eliminada')
    } catch {
      addToast('Error eliminando', false)
    }
  }

  return (
    <div className="section-content">

      {/* ── TOASTS ── */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.ok ? '#00b37e' : '#ef4444', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Órdenes de Venta</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {fmt(totalPend)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNueva}>+ Nueva OV</button>
      </div>

      {/* ── STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {ESTADOS.map(e => {
          const count = ordenes.filter(o => o.estado === e.value).length
          const total = ordenes.filter(o => o.estado === e.value).reduce((s, o) => s + o.total, 0)
          return (
            <div key={e.value} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => setFiltro(e.value)}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{e.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: e.color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{fmt(total)}</div>
            </div>
          )
        })}
      </div>

      {/* ── FILTERS ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className="btn btn-secondary"
          style={{ fontWeight: filtro === 'todas' ? 700 : 400, fontSize: 13, borderColor: filtro === 'todas' ? 'var(--primary)' : undefined }}
          onClick={() => setFiltro('todas')}
        >
          Todas ({ordenes.length})
        </button>
        {ESTADOS.map(e => (
          <button
            key={e.value}
            className="btn btn-secondary"
            style={{ fontWeight: filtro === e.value ? 700 : 400, fontSize: 13, borderColor: filtro === e.value ? e.color : undefined, color: filtro === e.value ? e.color : undefined }}
            onClick={() => setFiltro(e.value)}
          >
            {e.label} ({ordenes.filter(o => o.estado === e.value).length})
          </button>
        ))}
        <input
          className="form-control"
          placeholder="🔍 Buscar cliente u OV…"
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
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div>Sin órdenes de venta. ¡Creá la primera!</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Nro OV','Cliente','Total','Fecha','Entrega','Estado','Obs','Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(o => {
                const est = ESTADOS.find(e => e.value === o.estado)
                const dias = o.fecha_entrega ? diasHasta(o.fecha_entrega) : null
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{o.nro}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, maxWidth: 200 }}>
                      {o.cliente_nombre}
                      {o.vendedor && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👤 {o.vendedor}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(o.total)}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(o.fecha)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(o.fecha_entrega)}</div>
                      {dias !== null && o.estado === 'pendiente' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: dias < 0 ? '#ef4444' : dias <= 3 ? '#f59e0b' : '#00b37e' }}>
                          {dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'Hoy' : `en ${dias}d`}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: `${est?.color}22`, color: est?.color, border: `1px solid ${est?.color}44` }}>
                        {est?.label ?? o.estado}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.obs?.slice(0, 40)}{(o.obs?.length ?? 0) > 40 ? '…' : ''}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {o.estado === 'pendiente' && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: 11, color: '#00b37e', border: '1px solid rgba(0,179,126,0.3)' }}
                            onClick={() => cambiarEstado(o, 'facturada_total')}
                          >
                            ✓ Facturar
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: 12 }}
                          onClick={() => abrirEditar(o)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: 12, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                          onClick={() => eliminar(o)}
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
            style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>
                {editando ? `Editar ${editando.nro}` : 'Nueva Orden de Venta'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <FF label="Cliente">
                <select
                  className="form-control"
                  value={form.cliente_id ?? ''}
                  onChange={e => {
                    const id = Number(e.target.value)
                    const c  = clientes.find(x => x.id === id)
                    setForm(f => ({ ...f, cliente_id: id || null, cliente_nombre: c?.razon_social || '' }))
                  }}
                >
                  <option value="">— Seleccionar cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                </select>
              </FF>

              <FF label="O escribir nombre (sin cuenta en sistema)">
                <input
                  className="form-control"
                  value={form.cliente_nombre}
                  onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value, cliente_id: null }))}
                  placeholder="Nombre del cliente"
                />
              </FF>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Total ($)">
                  <input
                    className="form-control"
                    type="number"
                    min={0}
                    step={100}
                    value={form.total}
                    onChange={e => setForm(f => ({ ...f, total: Number(e.target.value), subtotal: Number(e.target.value) }))}
                  />
                </FF>
                <FF label="Descuento ($)">
                  <input
                    className="form-control"
                    type="number"
                    min={0}
                    step={100}
                    value={form.descuento}
                    onChange={e => setForm(f => ({ ...f, descuento: Number(e.target.value) }))}
                  />
                </FF>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Fecha">
                  <input className="form-control" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </FF>
                <FF label="Fecha de Entrega">
                  <input className="form-control" type="date" value={form.fecha_entrega} onChange={e => setForm(f => ({ ...f, fecha_entrega: e.target.value }))} />
                </FF>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Estado">
                  <select className="form-control" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EstadoOV }))}>
                    {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </FF>
                <FF label="Vendedor">
                  <input className="form-control" value={form.vendedor} onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))} placeholder="Nombre del vendedor" />
                </FF>
              </div>

              <FF label="Observaciones / Detalle de productos">
                <textarea
                  className="form-control"
                  rows={3}
                  value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  placeholder="Productos, tallas, colores, condiciones especiales…"
                />
              </FF>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>
                {saving ? 'Guardando…' : editando ? '💾 Actualizar' : '✅ Crear OV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function emptyForm() {
  return {
    cliente_id:     null as number | null,
    cliente_nombre: '',
    total:          0,
    subtotal:       0,
    descuento:      0,
    fecha:          new Date().toISOString().split('T')[0],
    fecha_entrega:  '',
    estado:         'pendiente' as EstadoOV,
    obs:            '',
    vendedor:       '',
  }
}

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
