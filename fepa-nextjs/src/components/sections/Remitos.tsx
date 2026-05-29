'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Remito, Cliente, OrdenVenta } from '@/lib/types'

const fmtDate = (d: string | null | undefined) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '—'

const ESTADOS: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#9a7800' },
  entregado:  { label: 'Entregado',  color: '#1a6b3a' },
  anulado:    { label: 'Anulado',    color: '#c8440a' },
}

type ItemRow = { descripcion: string; cantidad: number }
const emptyItem = (): ItemRow => ({ descripcion: '', cantidad: 1 })

export function Remitos() {
  const [remitos, setRemitos]     = useState<Remito[]>([])
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [ordenes, setOrdenes]     = useState<OrdenVenta[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Remito | null>(null)
  const [saving, setSaving]       = useState(false)

  const [form, setForm] = useState({
    cliente_id: '', ov_id: '',
    fecha: new Date().toISOString().split('T')[0], obs: '',
  })
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const load = async () => {
    setLoading(true)
    const [rr, rc, ro] = await Promise.all([
      fetch('/api/remitos').then(r => r.json()),
      fetch('/api/clientes').then(r => r.json()),
      fetch('/api/ordenes').then(r => r.json()),
    ])
    if (Array.isArray(rr)) setRemitos(rr)
    if (Array.isArray(rc)) setClientes(rc)
    if (Array.isArray(ro)) setOrdenes(ro)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => remitos.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.cliente_nombre.toLowerCase().includes(q) || r.nro.includes(q)
    const matchEstado = !filtroEstado || r.estado === filtroEstado
    return matchSearch && matchEstado
  }), [remitos, search, filtroEstado])

  const openNew = () => {
    setEditing(null)
    setForm({ cliente_id: '', ov_id: '', fecha: new Date().toISOString().split('T')[0], obs: '' })
    setItems([emptyItem()])
    setShowModal(true)
  }

  const openEdit = (r: Remito) => {
    setEditing(r)
    setForm({
      cliente_id: String(r.cliente_id || ''),
      ov_id:      String(r.ov_id || ''),
      fecha:      r.fecha,
      obs:        r.obs,
    })
    setItems(r.items?.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad })) || [emptyItem()])
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    const clienteSelec = clientes.find(c => c.id === Number(form.cliente_id))
    const nextNro = editing?.nro || `R-${String(Date.now()).slice(-6)}`
    const payload = {
      nro:            nextNro,
      cliente_id:     form.cliente_id ? Number(form.cliente_id) : null,
      cliente_nombre: clienteSelec?.razon_social || '',
      ov_id:          form.ov_id ? Number(form.ov_id) : null,
      fecha:          form.fecha,
      obs:            form.obs,
      estado:         editing?.estado || 'pendiente',
      items:          items.filter(it => it.descripcion).map(it => ({
        descripcion: it.descripcion,
        cantidad:    it.cantidad,
      })),
    }

    const method = editing ? 'PATCH' : 'POST'
    const url    = editing ? `/api/remitos/${editing.id}` : '/api/remitos'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setShowModal(false)
    setSaving(false)
    load()
  }

  const changeEstado = async (id: number, estado: string) => {
    await fetch(`/api/remitos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    setRemitos(prev => prev.map(r => r.id === id ? { ...r, estado: estado as Remito['estado'] } : r))
  }

  const del = async (id: number) => {
    if (!confirm('¿Eliminar este remito?')) return
    await fetch(`/api/remitos/${id}`, { method: 'DELETE' })
    setRemitos(prev => prev.filter(r => r.id !== id))
  }

  const stats = useMemo(() => ({
    total:     remitos.length,
    pendiente: remitos.filter(r => r.estado === 'pendiente').length,
    entregado: remitos.filter(r => r.estado === 'entregado').length,
  }), [remitos])

  const ovsPorCliente = useMemo(() =>
    ordenes.filter(o => !form.cliente_id || o.cliente_id === Number(form.cliente_id)),
    [ordenes, form.cliente_id])

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'Total remitos',  val: stats.total },
          { label: 'Pendientes',     val: stats.pendiente, alert: stats.pendiente > 0 },
          { label: 'Entregados',     val: stats.entregado },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: `1px solid ${s.alert ? '#e8b80060' : 'var(--border)'}`, borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: s.alert ? '#9a7800' : 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: s.alert ? '#9a7800' : undefined }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <input placeholder="Buscar por cliente o número..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          <option value="">Todos</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={openNew}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          + Nuevo remito
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Número', 'Cliente', 'OV', 'Fecha', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Sin remitos</td></tr>
            )}
            {filtered.map(r => {
              const e = ESTADOS[r.estado]
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>{r.nro}</td>
                  <td style={{ padding: '10px 14px' }}>{r.cliente_nombre || '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--muted)' }}>
                    {r.ov_id ? `OV-${r.ov_id}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{fmtDate(r.fecha)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: e.color + '18', color: e.color, border: `1px solid ${e.color}40`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                      {e.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(r)}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--surface2)' }}>
                        Editar
                      </button>
                      {r.estado === 'pendiente' && (
                        <button onClick={() => changeEstado(r.id, 'entregado')}
                          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #1a6b3a', borderRadius: 4, cursor: 'pointer', color: '#1a6b3a', background: '#1a6b3a10' }}>
                          ✓ Entregar
                        </button>
                      )}
                      {r.estado !== 'anulado' && (
                        <button onClick={() => changeEstado(r.id, 'anulado')}
                          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #c8440a40', borderRadius: 4, cursor: 'pointer', color: '#c8440a', background: 'transparent' }}>
                          Anular
                        </button>
                      )}
                      <button onClick={() => del(r.id)}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)', background: 'transparent' }}>
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editing ? 'Editar remito' : 'Nuevo remito'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CLIENTE</label>
                <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value, ov_id: '' }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Sin cliente</option>
                  {clientes.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>ORDEN DE VENTA (opcional)</label>
                <select value={form.ov_id} onChange={e => setForm(f => ({ ...f, ov_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Sin OV</option>
                  {ovsPorCliente.map(o => <option key={o.id} value={o.id}>{o.nro} — {o.cliente_nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>FECHA</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>OBSERVACIONES</label>
                <input value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Notas de entrega..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Ítems a entregar</span>
                <button onClick={() => setItems(p => [...p, emptyItem()])}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ agregar</button>
              </div>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input value={it.descripcion} onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
                    placeholder="Descripción del artículo"
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
                  <input type="number" min="1" value={it.cantidad} onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x))}
                    style={{ width: 70, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
                  <button onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#c8440a', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '9px 20px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={save} disabled={saving}
                style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {saving ? 'Guardando...' : 'Guardar remito'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
