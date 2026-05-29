'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Presupuesto, ItemPresupuesto, Cliente } from '@/lib/types'

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '—'

const ESTADOS: Record<string, { label: string; color: string }> = {
  borrador:   { label: 'Borrador',   color: '#8a8278' },
  enviado:    { label: 'Enviado',    color: '#1a4a7a' },
  aceptado:   { label: 'Aceptado',  color: '#1a6b3a' },
  rechazado:  { label: 'Rechazado', color: '#c8440a' },
  vencido:    { label: 'Vencido',   color: '#9a7800' },
  convertido: { label: 'Convertido',color: '#6b21a8' },
}

function Badge({ estado }: { estado: string }) {
  const e = ESTADOS[estado] || { label: estado, color: '#8a8278' }
  return (
    <span style={{
      background: e.color + '18', color: e.color,
      border: `1px solid ${e.color}40`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
      fontFamily: 'IBM Plex Mono, monospace',
    }}>{e.label}</span>
  )
}

type ItemRow = { descripcion: string; cantidad: number; precio_unitario: number; descuento_pct: number }

const emptyItem = (): ItemRow => ({ descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0 })

export function Presupuestos() {
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [clientes, setClientes]         = useState<Cliente[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState<Presupuesto | null>(null)
  const [saving, setSaving]             = useState(false)
  const [convertingId, setConvertingId] = useState<number | null>(null)

  const [form, setForm] = useState({
    cliente_id: '', cliente_nombre: '', fecha: new Date().toISOString().split('T')[0],
    fecha_vto: '', obs: '', vendedor: '', cond_venta: '', descuento: 0,
  })
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const load = async () => {
    setLoading(true)
    const [rp, rc] = await Promise.all([
      fetch('/api/presupuestos').then(r => r.json()),
      fetch('/api/clientes').then(r => r.json()),
    ])
    if (Array.isArray(rp)) setPresupuestos(rp)
    if (Array.isArray(rc)) setClientes(rc)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => presupuestos.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.cliente_nombre.toLowerCase().includes(q) || p.nro.includes(q)
    const matchEstado = !filtroEstado || p.estado === filtroEstado
    return matchSearch && matchEstado
  }), [presupuestos, search, filtroEstado])

  const totalesItem = (it: ItemRow) => {
    const base = it.cantidad * it.precio_unitario
    return base * (1 - it.descuento_pct / 100)
  }

  const subtotal  = items.reduce((s, it) => s + totalesItem(it), 0)
  const descuento = subtotal * (form.descuento / 100)
  const total     = subtotal - descuento

  const openNew = () => {
    setEditing(null)
    setForm({ cliente_id: '', cliente_nombre: '', fecha: new Date().toISOString().split('T')[0], fecha_vto: '', obs: '', vendedor: '', cond_venta: '', descuento: 0 })
    setItems([emptyItem()])
    setShowModal(true)
  }

  const openEdit = (p: Presupuesto) => {
    setEditing(p)
    setForm({
      cliente_id:     String(p.cliente_id || ''),
      cliente_nombre: p.cliente_nombre,
      fecha:          p.fecha,
      fecha_vto:      p.fecha_vto || '',
      obs:            p.obs,
      vendedor:       p.vendedor,
      cond_venta:     p.cond_venta,
      descuento:      p.descuento && p.subtotal ? (p.descuento / p.subtotal) * 100 : 0,
    })
    setItems(p.items?.map(it => ({
      descripcion:     it.descripcion,
      cantidad:        it.cantidad,
      precio_unitario: it.precio_unitario,
      descuento_pct:   it.descuento_pct,
    })) || [emptyItem()])
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    const clienteSelec = clientes.find(c => c.id === Number(form.cliente_id))
    const nextNro = editing?.nro || `P-${String(Date.now()).slice(-6)}`
    const payload = {
      nro:            nextNro,
      cliente_id:     form.cliente_id ? Number(form.cliente_id) : null,
      cliente_nombre: clienteSelec?.razon_social || form.cliente_nombre,
      fecha:          form.fecha,
      fecha_vto:      form.fecha_vto || null,
      obs:            form.obs,
      vendedor:       form.vendedor,
      cond_venta:     form.cond_venta,
      subtotal,
      descuento,
      total,
      estado:         editing?.estado || 'borrador',
      items:          items.filter(it => it.descripcion).map(it => ({
        descripcion:     it.descripcion,
        cantidad:        it.cantidad,
        precio_unitario: it.precio_unitario,
        descuento_pct:   it.descuento_pct,
        subtotal:        totalesItem(it),
      })),
    }

    const method = editing ? 'PATCH' : 'POST'
    const url    = editing ? `/api/presupuestos/${editing.id}` : '/api/presupuestos'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setShowModal(false)
    setSaving(false)
    load()
  }

  const changeEstado = async (id: number, estado: string) => {
    await fetch(`/api/presupuestos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    setPresupuestos(prev => prev.map(p => p.id === id ? { ...p, estado: estado as Presupuesto['estado'] } : p))
  }

  const convertir = async (p: Presupuesto) => {
    if (!confirm(`¿Convertir presupuesto ${p.nro} a factura?`)) return
    setConvertingId(p.id)
    const res = await fetch(`/api/presupuestos/${p.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'convertir' })
    })
    const data = await res.json()
    setConvertingId(null)
    if (data.factura) {
      alert(`Factura ${data.factura.nro} creada exitosamente`)
      load()
    } else {
      alert('Error al convertir: ' + (data.error || 'desconocido'))
    }
  }

  const del = async (id: number) => {
    if (!confirm('¿Eliminar este presupuesto?')) return
    await fetch(`/api/presupuestos/${id}`, { method: 'DELETE' })
    setPresupuestos(prev => prev.filter(p => p.id !== id))
  }

  const stats = useMemo(() => ({
    total:      presupuestos.length,
    pendiente:  presupuestos.filter(p => ['borrador','enviado'].includes(p.estado)).length,
    aceptados:  presupuestos.filter(p => p.estado === 'aceptado').length,
    monto:      presupuestos.filter(p => ['borrador','enviado','aceptado'].includes(p.estado)).reduce((s, p) => s + p.total, 0),
  }), [presupuestos])

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total presupuestos', val: stats.total, mono: true },
          { label: 'En curso',           val: stats.pendiente, mono: true },
          { label: 'Aceptados',          val: stats.aceptados, mono: true },
          { label: 'Monto estimado',     val: fmt(stats.monto), mono: false },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: s.mono ? 'IBM Plex Mono, monospace' : undefined }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          placeholder="Buscar por cliente o número..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={openNew} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          + Nuevo presupuesto
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Número', 'Cliente', 'Fecha', 'Vencimiento', 'Total', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Sin presupuestos</td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>{p.nro}</td>
                <td style={{ padding: '10px 14px' }}>{p.cliente_nombre || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{fmtDate(p.fecha)}</td>
                <td style={{ padding: '10px 14px' }}>{fmtDate(p.fecha_vto)}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>{fmt(p.total)}</td>
                <td style={{ padding: '10px 14px' }}><Badge estado={p.estado} /></td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(p)}
                      style={{ padding: '4px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--surface2)' }}>
                      Editar
                    </button>
                    {p.estado === 'borrador' && (
                      <button onClick={() => changeEstado(p.id, 'enviado')}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #1a4a7a', borderRadius: 4, cursor: 'pointer', color: '#1a4a7a', background: '#1a4a7a10' }}>
                        Enviar
                      </button>
                    )}
                    {p.estado === 'enviado' && (
                      <>
                        <button onClick={() => changeEstado(p.id, 'aceptado')}
                          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #1a6b3a', borderRadius: 4, cursor: 'pointer', color: '#1a6b3a', background: '#1a6b3a10' }}>
                          Aceptar
                        </button>
                        <button onClick={() => changeEstado(p.id, 'rechazado')}
                          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #c8440a', borderRadius: 4, cursor: 'pointer', color: '#c8440a', background: '#c8440a10' }}>
                          Rechazar
                        </button>
                      </>
                    )}
                    {p.estado === 'aceptado' && (
                      <button onClick={() => convertir(p)} disabled={convertingId === p.id}
                        style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #6b21a8', borderRadius: 4, cursor: 'pointer', color: '#6b21a8', background: '#6b21a810' }}>
                        {convertingId === p.id ? '...' : '→ Factura'}
                      </button>
                    )}
                    <button onClick={() => del(p.id)}
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

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 780, maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CLIENTE</label>
                <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Sin cliente</option>
                  {clientes.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
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
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>CONDICIÓN VENTA</label>
                <select value={form.cond_venta} onChange={e => setForm(f => ({ ...f, cond_venta: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Contado</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                  <option value="90">90 días</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>VENDEDOR</label>
                <input value={form.vendedor} onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))} placeholder="Nombre vendedor"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>DESCUENTO GLOBAL (%)</label>
                <input type="number" min="0" max="100" value={form.descuento} onChange={e => setForm(f => ({ ...f, descuento: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }} />
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Ítems</span>
                <button onClick={() => setItems(prev => [...prev, emptyItem()])}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ agregar ítem</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    {['Descripción', 'Cant.', 'Precio Unit.', 'Dto%', 'Subtotal', ''].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <input value={it.descripcion} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))}
                          placeholder="Descripción del producto/servicio"
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '4px 6px', width: 70 }}>
                        <input type="number" min="1" value={it.cantidad} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '4px 6px', width: 110 }}>
                        <input type="number" min="0" value={it.precio_unitario} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, precio_unitario: Number(e.target.value) } : x))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '4px 6px', width: 60 }}>
                        <input type="number" min="0" max="100" value={it.descuento_pct} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, descuento_pct: Number(e.target.value) } : x))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '4px 8px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>{fmt(totalesItem(it))}</td>
                      <td style={{ padding: '4px 6px', width: 30 }}>
                        <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: '#c8440a', cursor: 'pointer', fontSize: 16 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginBottom: 20, fontSize: 13 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Subtotal: <strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{fmt(subtotal)}</strong></div>
                {form.descuento > 0 && <div style={{ color: '#c8440a', marginBottom: 4 }}>Descuento {form.descuento}%: <strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>-{fmt(descuento)}</strong></div>}
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
                style={{ padding: '9px 20px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {saving ? 'Guardando...' : 'Guardar presupuesto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
