'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Cliente } from '@/lib/types'
import { fmt, fmtDate } from '@/lib/utils'

interface NC {
  id: number
  nro: string
  fecha: string
  cliente_id: number | null
  cliente_nombre: string
  total: number
  motivo: string
  factura_origen_id: number | null
  created_at?: string
}

type Toast = { id: number; msg: string; ok: boolean }

function emptyForm() {
  return {
    cliente_id:     null as number | null,
    cliente_nombre: '',
    total:          0,
    fecha:          new Date().toISOString().split('T')[0],
    motivo:         '',
    factura_origen_id: null as number | null,
  }
}

export function NotasCredito() {
  const [notas, setNotas]         = useState<NC[]>([])
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [loading, setLoading]     = useState(true)
  const [toasts, setToasts]       = useState<Toast[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)
  const [busqueda, setBusqueda]   = useState('')

  const addToast = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rn, rc] = await Promise.all([
        fetch('/api/nc').then(r => r.json()),
        fetch('/api/clientes?activo=true').then(r => r.json()),
      ])
      if (Array.isArray(rn)) setNotas(rn)
      if (Array.isArray(rc)) setClientes(rc)
    } catch { addToast('Error cargando', false) }
    finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const guardar = async () => {
    if (!form.cliente_nombre || form.total <= 0) {
      addToast('Completá cliente e importe', false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/nc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      addToast('✅ Nota de crédito creada')
      setShowModal(false)
      load()
    } catch { addToast('Error guardando', false) }
    finally { setSaving(false) }
  }

  const eliminar = async (n: NC) => {
    if (!confirm(`¿Eliminar NC ${n.nro}?`)) return
    try {
      await fetch(`/api/nc/${n.id}`, { method: 'DELETE' })
      setNotas(prev => prev.filter(x => x.id !== n.id))
      addToast('NC eliminada')
    } catch { addToast('Error eliminando', false) }
  }

  const lista = notas.filter(n =>
    !busqueda || n.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) || n.nro.includes(busqueda)
  )

  const totalNC = notas.reduce((s, n) => s + n.total, 0)

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>

  return (
    <div className="section-content">
      {/* Toasts */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.ok ? '#00b37e' : '#ef4444', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Notas de Crédito</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {notas.length} NC emitida{notas.length !== 1 ? 's' : ''} · {fmt(totalNC)} en créditos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="form-control"
            placeholder="🔍 Buscar…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <button className="btn btn-primary" style={{ background: '#00b37e', borderColor: '#00b37e' }} onClick={() => { setForm(emptyForm()); setShowModal(true) }}>
            + Nueva NC
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(0,179,126,0.08)', border: '1px solid rgba(0,179,126,0.25)', color: '#00b37e', fontSize: 13, marginBottom: 20 }}>
        ↑ Los montos representan crédito a favor del cliente. Se muestran siempre en positivo.
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['NC Nro','Fecha','Cliente','Motivo','Total','Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>↑</div>
                  Sin notas de crédito emitidas
                </td></tr>
              ) : lista.map(n => (
                <tr key={n.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>NC-{n.nro}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(n.fecha)}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 500 }}>{n.cliente_nombre}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 13 }}>{n.motivo || '—'}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#00b37e' }}>{fmt(n.total)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                      onClick={() => eliminar(n)}
                    >🗑 Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700 }}>Nueva Nota de Crédito</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <FF label="Cliente">
                <select
                  className="form-control"
                  value={form.cliente_id ?? ''}
                  onChange={e => {
                    const id = Number(e.target.value)
                    const c = clientes.find(x => x.id === id)
                    setForm(f => ({ ...f, cliente_id: id || null, cliente_nombre: c?.razon_social || '' }))
                  }}
                >
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                </select>
              </FF>
              <FF label="O escribir nombre">
                <input
                  className="form-control"
                  value={form.cliente_nombre}
                  onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value, cliente_id: null }))}
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
                    onChange={e => setForm(f => ({ ...f, total: Number(e.target.value) }))}
                  />
                </FF>
                <FF label="Fecha">
                  <input
                    className="form-control"
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  />
                </FF>
              </div>
              <FF label="Motivo">
                <textarea
                  className="form-control"
                  rows={3}
                  value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Devolución de mercadería, descuento, error de facturación…"
                />
              </FF>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button
                className="btn btn-primary"
                style={{ background: '#00b37e', borderColor: '#00b37e' }}
                onClick={guardar}
                disabled={saving}
              >
                {saving ? 'Guardando…' : '↑ Crear NC'}
              </button>
            </div>
          </div>
        </div>
      )}
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
