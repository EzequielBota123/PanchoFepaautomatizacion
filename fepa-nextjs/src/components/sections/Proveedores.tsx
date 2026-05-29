'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Proveedor } from '@/lib/types'

const PROVINCIAS = ['Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén',
  'Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero',
  'Tierra del Fuego','Tucumán']

const COND_IVA = ['Responsable Inscripto','Monotributista','Exento','Consumidor Final']

export function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState<Proveedor | null>(null)
  const [saving, setSaving]           = useState(false)

  const empty = (): Partial<Proveedor> => ({
    razon_social: '', cuit: '', email: '', telefono: '',
    direccion: '', ciudad: '', provincia: 'Buenos Aires',
    cond_iva: 'Responsable Inscripto', activo: true, notas: '',
  })
  const [form, setForm] = useState<Partial<Proveedor>>(empty())

  const load = async () => {
    setLoading(true)
    const data = await fetch('/api/proveedores').then(r => r.json())
    if (Array.isArray(data)) setProveedores(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() =>
    proveedores.filter(p => {
      const q = search.toLowerCase()
      return !q || p.razon_social.toLowerCase().includes(q) || p.cuit.includes(q) || p.email.toLowerCase().includes(q)
    }), [proveedores, search])

  const openNew = () => { setEditing(null); setForm(empty()); setShowModal(true) }
  const openEdit = (p: Proveedor) => { setEditing(p); setForm({ ...p }); setShowModal(true) }

  const save = async () => {
    setSaving(true)
    const method = editing ? 'PATCH' : 'POST'
    const url    = editing ? `/api/proveedores/${editing.id}` : '/api/proveedores'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setShowModal(false)
    setSaving(false)
    load()
  }

  const del = async (id: number) => {
    if (!confirm('¿Desactivar este proveedor?')) return
    await fetch(`/api/proveedores/${id}`, { method: 'DELETE' })
    setProveedores(prev => prev.map(p => p.id === id ? { ...p, activo: false } : p))
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'Total proveedores', val: proveedores.length },
          { label: 'Activos',           val: proveedores.filter(p => p.activo).length },
          { label: 'Con CUIT',          val: proveedores.filter(p => p.cuit).length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input placeholder="Buscar por nombre, CUIT..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
        <button onClick={openNew}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          + Nuevo proveedor
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Razón Social', 'CUIT', 'Email', 'Teléfono', 'Provincia', 'Cond. IVA', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Sin proveedores</td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: p.activo ? 1 : 0.5 }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.razon_social}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{p.cuit || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>{p.email || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>{p.telefono || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>{p.provincia || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12 }}>{p.cond_iva}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    background: p.activo ? '#1a6b3a18' : '#c8440a18',
                    color: p.activo ? '#1a6b3a' : '#c8440a',
                    border: `1px solid ${p.activo ? '#1a6b3a40' : '#c8440a40'}`,
                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(p)}
                      style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--surface2)' }}>
                      Editar
                    </button>
                    {p.activo && (
                      <button onClick={() => del(p.id)}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #c8440a40', borderRadius: 4, cursor: 'pointer', color: '#c8440a', background: 'transparent' }}>
                        ×
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'RAZÓN SOCIAL *', key: 'razon_social', type: 'text', full: true },
                { label: 'CUIT',            key: 'cuit',         type: 'text' },
                { label: 'EMAIL',           key: 'email',        type: 'email' },
                { label: 'TELÉFONO',        key: 'telefono',     type: 'text' },
                { label: 'DIRECCIÓN',       key: 'direccion',    type: 'text', full: true },
                { label: 'CIUDAD',          key: 'ciudad',       type: 'text' },
              ].map(field => (
                <div key={field.key} style={{ gridColumn: field.full ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{field.label}</label>
                  <input type={field.type} value={(form as Record<string, unknown>)[field.key] as string || ''}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PROVINCIA</label>
                <select value={form.provincia || ''} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CONDICIÓN IVA</label>
                <select value={form.cond_iva || ''} onChange={e => setForm(f => ({ ...f, cond_iva: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  {COND_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NOTAS</label>
                <textarea value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '9px 20px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.razon_social}
                style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
