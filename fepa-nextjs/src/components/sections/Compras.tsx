'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Compra, Proveedor } from '@/lib/types'

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: string | null | undefined) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '—'

const TIPOS   = ['factura', 'recibo', 'ticket', 'nc']
const METODOS = ['efectivo', 'transferencia', 'cheque', 'tarjeta', 'cuenta corriente']

type ItemRow = { descripcion: string; cantidad: number; precio_unitario: number }
const emptyItem = (): ItemRow => ({ descripcion: '', cantidad: 1, precio_unitario: 0 })

export function Compras() {
  const [compras, setCompras]         = useState<Compra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState<Compra | null>(null)
  const [saving, setSaving]           = useState(false)

  const [form, setForm] = useState({
    nro: '', proveedor_id: '', proveedor_nombre: '',
    fecha: new Date().toISOString().split('T')[0], fecha_vto: '',
    tipo: 'factura', metodo_pago: '', obs: '',
  })
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const load = async () => {
    setLoading(true)
    const [rc, rp] = await Promise.all([
      fetch('/api/compras').then(r => r.json()),
      fetch('/api/proveedores').then(r => r.json()),
    ])
    if (Array.isArray(rc)) setCompras(rc)
    if (Array.isArray(rp)) setProveedores(rp)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => compras.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.proveedor_nombre.toLowerCase().includes(q) || c.nro.toLowerCase().includes(q)
    const matchEstado = !filtroEstado || c.estado === filtroEstado
    return matchSearch && matchEstado
  }), [compras, search, filtroEstado])

  const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
  const iva      = subtotal * 0.21
  const total    = subtotal + iva

  const openNew = () => {
    setEditing(null)
    setForm({ nro: '', proveedor_id: '', proveedor_nombre: '', fecha: new Date().toISOString().split('T')[0], fecha_vto: '', tipo: 'factura', metodo_pago: '', obs: '' })
    setItems([emptyItem()])
    setShowModal(true)
  }

  const openEdit = (c: Compra) => {
    setEditing(c)
    setForm({
      nro:              c.nro,
      proveedor_id:     String(c.proveedor_id || ''),
      proveedor_nombre: c.proveedor_nombre,
      fecha:            c.fecha,
      fecha_vto:        c.fecha_vto || '',
      tipo:             c.tipo,
      metodo_pago:      c.metodo_pago,
      obs:              c.obs,
    })
    setItems(c.items?.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario })) || [emptyItem()])
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    const provSelec = proveedores.find(p => p.id === Number(form.proveedor_id))
    const payload = {
      nro:              form.nro,
      proveedor_id:     form.proveedor_id ? Number(form.proveedor_id) : null,
      proveedor_nombre: provSelec?.razon_social || form.proveedor_nombre,
      fecha:            form.fecha,
      fecha_vto:        form.fecha_vto || null,
      tipo:             form.tipo,
      metodo_pago:      form.metodo_pago,
      obs:              form.obs,
      subtotal,
      iva,
      total,
      estado:           editing?.estado || 'pendiente',
      items:            items.filter(it => it.descripcion).map(it => ({
        descripcion:     it.descripcion,
        cantidad:        it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal:        it.cantidad * it.precio_unitario,
      })),
    }

    const method = editing ? 'PATCH' : 'POST'
    const url    = editing ? `/api/compras/${editing.id}` : '/api/compras'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setShowModal(false)
    setSaving(false)
    load()
  }

  const marcarPagada = async (id: number) => {
    await fetch(`/api/compras/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'pagada' }) })
    setCompras(prev => prev.map(c => c.id === id ? { ...c, estado: 'pagada' } : c))
  }

  const del = async (id: number) => {
    if (!confirm('¿Eliminar esta compra?')) return
    await fetch(`/api/compras/${id}`, { method: 'DELETE' })
    setCompras(prev => prev.filter(c => c.id !== id))
  }

  const stats = useMemo(() => ({
    pendiente: compras.filter(c => c.estado === 'pendiente').reduce((s, c) => s + c.total, 0),
    pagado:    compras.filter(c => c.estado === 'pagada').reduce((s, c) => s + c.total, 0),
    count:     compras.length,
  }), [compras])

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: 'Total compras', val: stats.count, mono: true },
          { label: 'Pendiente de pago', val: fmt(stats.pendiente), mono: false, alert: stats.pendiente > 0 },
          { label: 'Pagado',           val: fmt(stats.pagado), mono: false },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: `1px solid ${s.alert ? '#c8440a60' : 'var(--border)'}`, borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: s.alert ? '#c8440a' : 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: s.mono ? 'IBM Plex Mono, monospace' : undefined, color: s.alert ? '#c8440a' : undefined }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <input placeholder="Buscar por proveedor o número..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagada">Pagada</option>
        </select>
        <button onClick={openNew}
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          + Nueva compra
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Número', 'Proveedor', 'Fecha', 'Vto.', 'Tipo', 'Total', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Sin compras registradas</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>{c.nro || '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.proveedor_nombre || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{fmtDate(c.fecha)}</td>
                <td style={{ padding: '10px 14px', color: c.fecha_vto && new Date(c.fecha_vto) < new Date() && c.estado === 'pendiente' ? '#c8440a' : undefined }}>
                  {fmtDate(c.fecha_vto)}
                </td>
                <td style={{ padding: '10px 14px', textTransform: 'capitalize' }}>{c.tipo}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>{fmt(c.total)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    background: c.estado === 'pagada' ? '#1a6b3a18' : '#e8b80018',
                    color: c.estado === 'pagada' ? '#1a6b3a' : '#9a7800',
                    border: `1px solid ${c.estado === 'pagada' ? '#1a6b3a40' : '#e8b80060'}`,
                    borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>{c.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(c)}
                      style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--surface2)' }}>
                      Editar
                    </button>
                    {c.estado === 'pendiente' && (
                      <button onClick={() => marcarPagada(c.id)}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #1a6b3a', borderRadius: 4, cursor: 'pointer', color: '#1a6b3a', background: '#1a6b3a10' }}>
                        ✓ Pagar
                      </button>
                    )}
                    <button onClick={() => del(c.id)}
                      style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #c8440a40', borderRadius: 4, cursor: 'pointer', color: '#c8440a', background: 'transparent' }}>
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editing ? 'Editar compra' : 'Nueva compra'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>PROVEEDOR</label>
                <select value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Sin proveedor</option>
                  {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NÚMERO COMPROBANTE</label>
                <input value={form.nro} onChange={e => setForm(f => ({ ...f, nro: e.target.value }))} placeholder="0001-00001234"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>TIPO</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textTransform: 'capitalize' }}>
                  {TIPOS.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>MÉTODO DE PAGO</label>
                <select value={form.metodo_pago} onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Seleccionar</option>
                  {METODOS.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>FECHA</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>VENCIMIENTO</label>
                <input type="date" value={form.fecha_vto} onChange={e => setForm(f => ({ ...f, fecha_vto: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Ítems</span>
                <button onClick={() => setItems(p => [...p, emptyItem()])}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ agregar</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    {['Descripción', 'Cant.', 'Precio Unit.', 'Subtotal', ''].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <input value={it.descripcion} onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '4px 6px', width: 70 }}>
                        <input type="number" min="1" value={it.cantidad} onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '4px 6px', width: 120 }}>
                        <input type="number" min="0" value={it.precio_unitario} onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, precio_unitario: Number(e.target.value) } : x))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: '4px 8px', fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(it.cantidad * it.precio_unitario)}</td>
                      <td><button onClick={() => setItems(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#c8440a', cursor: 'pointer' }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginBottom: 16, fontSize: 13 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Neto: <strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(subtotal)}</strong></div>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>IVA 21%: <strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(iva)}</strong></div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>TOTAL: <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(total)}</span></div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>OBSERVACIONES</label>
              <textarea value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding: '9px 20px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={save} disabled={saving}
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
