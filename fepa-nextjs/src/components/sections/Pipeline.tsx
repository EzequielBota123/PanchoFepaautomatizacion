'use client'
import { useState } from 'react'
import { fmt } from '@/lib/utils'
import { Modal } from '../ui/Modal'
import { toast } from '../ui/Toast'

interface Prospecto {
  id: number
  nombre: string
  zona: string
  tel: string
  potencial: number
  vendedor: string
  etapa: string
}

const ETAPAS = [
  { key: 'contacto',    label: 'Contacto',    color: 'var(--muted)' },
  { key: 'presupuesto', label: 'Presupuesto', color: 'var(--yellow)' },
  { key: 'negociacion', label: 'Negociación', color: 'var(--accent3)' },
  { key: 'cerrado',     label: 'Cerrado',     color: 'var(--green)' },
]

const INICIALES: Prospecto[] = []

export function Pipeline() {
  const [prospectos, setProspectos] = useState<Prospecto[]>(INICIALES)
  const [modalAdd, setModalAdd]     = useState(false)
  const [modalEdit, setModalEdit]   = useState<Prospecto | null>(null)

  const potencialTotal = prospectos.reduce((s, p) => s + p.potencial, 0)
  const cerrados = prospectos.filter(p => p.etapa === 'cerrado')

  const setEtapa = (id: number, etapa: string) => {
    setProspectos(prev => prev.map(p => p.id === id ? { ...p, etapa } : p))
  }

  const deleteProspecto = (id: number) => {
    if (!confirm('¿Eliminar prospecto?')) return
    setProspectos(prev => prev.filter(p => p.id !== id))
    toast('Prospecto eliminado')
  }

  return (
    <div>
      {/* ── Stats ── */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <div className="stat-box blue">
          <div className="stat-label">Prospectos</div>
          <div className="stat-val">{prospectos.length}</div>
        </div>
        <div className="stat-box yellow">
          <div className="stat-label">Potencial Total</div>
          <div className="stat-val" style={{ fontSize: 20 }}>{fmt(potencialTotal)}</div>
        </div>
        <div className="stat-box green">
          <div className="stat-label">Cerrados</div>
          <div className="stat-val">{cerrados.length}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">En Negociación</div>
          <div className="stat-val">{prospectos.filter(p => p.etapa === 'negociacion').length}</div>
        </div>
      </div>

      {/* ── Kanban ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
        {ETAPAS.map(etapa => {
          const items = prospectos.filter(p => p.etapa === etapa.key)
          return (
            <div key={etapa.key} className="card">
              <div className="card-header" style={{ borderBottom: `2px solid ${etapa.color}` }}>
                <span className="card-title">{etapa.label}</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{items.length}</span>
              </div>
              <div style={{ padding: 10, minHeight: 120 }}>
                {items.map(p => (
                  <div key={p.id} style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '10px 12px', marginBottom: 8,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>{p.zona} · {p.vendedor}</div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--accent3)' }}>{fmt(p.potencial)}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {ETAPAS.filter(e => e.key !== etapa.key).map(e => (
                        <button key={e.key} className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '2px 6px' }}
                          onClick={() => setEtapa(p.id, e.key)}>→ {e.label}</button>
                      ))}
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '2px 6px', color: 'var(--red)' }}
                        onClick={() => deleteProspecto(p.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setModalAdd(true)}>+ Nuevo prospecto</button>
      </div>

      {modalAdd && (
        <ModalProspecto
          onClose={() => setModalAdd(false)}
          onSave={(data) => {
            const id = prospectos.length > 0 ? Math.max(...prospectos.map(p => p.id)) + 1 : 1
            setProspectos(prev => [...prev, { ...data, id }])
            setModalAdd(false)
            toast('✓ Prospecto agregado')
          }}
        />
      )}
    </div>
  )
}

function ModalProspecto({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: Omit<Prospecto, 'id'>) => void
}) {
  const [form, setForm] = useState({
    nombre: '', zona: '', tel: '', potencial: '', vendedor: '', etapa: 'contacto',
  })

  const handleSubmit = () => {
    if (!form.nombre) return alert('El nombre es obligatorio')
    onSave({ ...form, potencial: parseFloat(form.potencial) || 0 })
  }

  return (
    <Modal title="Nuevo Prospecto" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Guardar</button>
        </>
      }
    >
      <div className="form-grid">
        {[
          ['nombre', 'Nombre / Empresa'],
          ['zona', 'Zona'],
          ['tel', 'Teléfono'],
          ['vendedor', 'Vendedor'],
        ].map(([key, label]) => (
          <div className="form-group" key={key}>
            <label className="form-label">{label}</label>
            <input className="form-input" value={form[key as keyof typeof form]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}
        <div className="form-group">
          <label className="form-label">Potencial ($)</label>
          <input type="number" className="form-input" value={form.potencial}
            onChange={e => setForm(f => ({ ...f, potencial: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Etapa inicial</label>
          <select className="form-select" value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))}>
            {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  )
}
