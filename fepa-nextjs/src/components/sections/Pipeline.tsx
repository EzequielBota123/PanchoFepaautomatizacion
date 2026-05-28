'use client'
import { useState, useEffect, useCallback } from 'react'
import { fmt } from '@/lib/utils'

interface Prospecto {
  id: number
  nombre: string
  zona: string
  tel: string
  potencial: number
  vendedor: string
  etapa: string
  notas: string
}

const ETAPAS = [
  { key: 'contacto',    label: 'Contacto',    color: 'var(--text-muted)' },
  { key: 'presupuesto', label: 'Presupuesto', color: '#f59e0b' },
  { key: 'negociacion', label: 'Negociación', color: '#3b82f6' },
  { key: 'cerrado',     label: 'Cerrado',     color: '#00b37e' },
]

type Toast = { id: number; msg: string; ok: boolean }

function emptyForm() {
  return { nombre: '', zona: '', tel: '', potencial: 0, vendedor: '', etapa: 'contacto', notas: '' }
}

export function Pipeline() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [loading, setLoading]       = useState(true)
  const [toasts, setToasts]         = useState<Toast[]>([])
  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState<Prospecto | null>(null)
  const [form, setForm]             = useState(emptyForm())
  const [saving, setSaving]         = useState(false)
  const [dragOver, setDragOver]     = useState<string | null>(null)
  const [dragging, setDragging]     = useState<number | null>(null)

  const addToast = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/prospectos')
      const data = await res.json()
      if (Array.isArray(data)) setProspectos(data)
    } catch { addToast('Error cargando prospectos', false) }
    finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { load() }, [load])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(emptyForm())
    setShowModal(true)
  }

  const abrirEditar = (p: Prospecto) => {
    setEditando(p)
    setForm({ nombre: p.nombre, zona: p.zona, tel: p.tel, potencial: p.potencial, vendedor: p.vendedor, etapa: p.etapa, notas: p.notas })
    setShowModal(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) { addToast('El nombre es obligatorio', false); return }
    setSaving(true)
    try {
      const url    = editando ? `/api/prospectos/${editando.id}` : '/api/prospectos'
      const method = editando ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, potencial: Number(form.potencial) }),
      })
      if (!res.ok) throw new Error()
      addToast(editando ? '✅ Prospecto actualizado' : '✅ Prospecto creado')
      setShowModal(false)
      load()
    } catch { addToast('Error guardando', false) }
    finally { setSaving(false) }
  }

  const eliminar = async (p: Prospecto) => {
    if (!confirm(`¿Eliminar a ${p.nombre}?`)) return
    try {
      await fetch(`/api/prospectos/${p.id}`, { method: 'DELETE' })
      setProspectos(prev => prev.filter(x => x.id !== p.id))
      addToast('Prospecto eliminado')
    } catch { addToast('Error eliminando', false) }
  }

  const moverEtapa = async (id: number, etapa: string) => {
    setProspectos(prev => prev.map(p => p.id === id ? { ...p, etapa } : p))
    try {
      await fetch(`/api/prospectos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapa }),
      })
    } catch { addToast('Error moviendo prospecto', false); load() }
  }

  const totalPotencial = prospectos.reduce((s, p) => s + (p.potencial || 0), 0)
  const cerrados       = prospectos.filter(p => p.etapa === 'cerrado')
  const totalCerrado   = cerrados.reduce((s, p) => s + (p.potencial || 0), 0)

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Pipeline de Ventas</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {prospectos.length} prospectos · {fmt(totalPotencial)} potencial · {fmt(totalCerrado)} cerrado
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNuevo}>+ Prospecto</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {ETAPAS.map(e => {
          const ps = prospectos.filter(p => p.etapa === e.key)
          return (
            <div key={e.key} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)', borderBottom: `3px solid ${e.color}` }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{e.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: e.color }}>{ps.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmt(ps.reduce((s, p) => s + p.potencial, 0))}</div>
            </div>
          )
        })}
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {ETAPAS.map(e => (
            <div
              key={e.key}
              onDragOver={ev => { ev.preventDefault(); setDragOver(e.key) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={ev => {
                ev.preventDefault()
                const id = Number(ev.dataTransfer.getData('text/plain'))
                if (id) moverEtapa(id, e.key)
                setDragOver(null)
                setDragging(null)
              }}
              style={{
                background: dragOver === e.key ? 'rgba(0,0,0,0.08)' : 'var(--bg-secondary)',
                borderRadius: 10,
                border: `2px solid ${dragOver === e.key ? e.color : 'var(--border)'}`,
                padding: 12,
                minHeight: 240,
                transition: 'border-color .2s, background .2s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: e.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                {e.label} ({prospectos.filter(p => p.etapa === e.key).length})
              </div>
              {prospectos.filter(p => p.etapa === e.key).map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={ev => {
                    ev.dataTransfer.setData('text/plain', String(p.id))
                    setDragging(p.id)
                  }}
                  onDragEnd={() => setDragging(null)}
                  style={{
                    background: 'var(--bg-primary)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 10,
                    border: '1px solid var(--border)',
                    cursor: 'grab',
                    opacity: dragging === p.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.nombre}</div>
                  {p.zona && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>📍 {p.zona}</div>}
                  {p.vendedor && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>👤 {p.vendedor}</div>}
                  {p.tel && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>📞 {p.tel}</div>}
                  {p.potencial > 0 && (
                    <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: e.color, marginBottom: 6 }}>
                      {fmt(p.potencial)}
                    </div>
                  )}
                  {p.notas && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
                      {p.notas.slice(0, 60)}{p.notas.length > 60 ? '…' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '3px 0', fontSize: 11 }}
                      onClick={() => abrirEditar(p)}
                    >✏️ Editar</button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 8px', fontSize: 11, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                      onClick={() => eliminar(p)}
                    >🗑</button>
                  </div>
                </div>
              ))}
              {prospectos.filter(p => p.etapa === e.key).length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  Arrastrá aquí
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
              <h3 style={{ margin: 0, fontWeight: 700 }}>{editando ? 'Editar Prospecto' : 'Nuevo Prospecto'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <FF label="Nombre *">
                <input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Empresa o contacto" autoFocus />
              </FF>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Zona">
                  <input className="form-control" value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} />
                </FF>
                <FF label="Teléfono">
                  <input className="form-control" value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))} />
                </FF>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Vendedor">
                  <input className="form-control" value={form.vendedor} onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))} />
                </FF>
                <FF label="Potencial ($)">
                  <input className="form-control" type="number" min={0} step={1000} value={form.potencial} onChange={e => setForm(f => ({ ...f, potencial: Number(e.target.value) }))} />
                </FF>
              </div>
              <FF label="Etapa">
                <select className="form-control" value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))}>
                  {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
              </FF>
              <FF label="Notas">
                <textarea className="form-control" rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </FF>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
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

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
