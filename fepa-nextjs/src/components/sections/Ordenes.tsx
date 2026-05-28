'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { OrdenVenta, EstadoOV, Cliente, FilaImportOV, TipoFactura, MetodoPago } from '@/lib/types'
import { fmt, fmtDate, diasHasta } from '@/lib/utils'

type Toast = { id: number; msg: string; ok: boolean }

const ESTADOS: { value: EstadoOV; label: string; color: string }[] = [
  { value: 'pendiente',         label: 'Pendiente',       color: '#f59e0b' },
  { value: 'facturada_parcial', label: 'Fact. Parcial',   color: '#3b82f6' },
  { value: 'facturada_total',   label: 'Facturada Total', color: '#00b37e' },
  { value: 'anulada',           label: 'Anulada',         color: '#6b7280' },
]

const METODOS_PAGO: { value: string; label: string }[] = [
  { value: 'contado',       label: 'Contado' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque_30',     label: 'Cheque 30 días' },
  { value: 'cheque_60',     label: 'Cheque 60 días' },
  { value: 'cheque_90',     label: 'Cheque 90 días' },
  { value: 'cheque_120',    label: 'Cheque 120 días' },
  { value: 'mixto',         label: 'Mixto' },
]

function calcFechaVto(metodo: string, desde: string): string {
  const dias: Record<string, number> = { contado: 0, transferencia: 3, cheque_30: 30, cheque_60: 60, cheque_90: 90, cheque_120: 120 }
  const d = new Date(desde || new Date())
  d.setDate(d.getDate() + (dias[metodo] ?? 30))
  return d.toISOString().split('T')[0]
}

export function Ordenes() {
  const [ordenes, setOrdenes]   = useState<OrdenVenta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading]   = useState(true)
  const [toasts, setToasts]     = useState<Toast[]>([])
  const [filtro, setFiltro]     = useState<EstadoOV | 'todas'>('pendiente')
  const [busqueda, setBusqueda] = useState('')

  // CRUD modal
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<OrdenVenta | null>(null)
  const [form, setForm]           = useState(emptyForm())
  const [saving, setSaving]       = useState(false)

  // Facturar modal
  const [ovAFacturar, setOvAFacturar]   = useState<OrdenVenta | null>(null)
  const [facForm, setFacForm]           = useState(emptyFacForm())
  const [facturando, setFacturando]     = useState(false)

  // Import modal
  const [showImport, setShowImport]       = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult]   = useState<{ total: number; validas: number; invalidas: number; filas: FilaImportOV[] } | null>(null)
  const [importando, setImportando]       = useState(false)
  const [pendingFile, setPendingFile]     = useState<File | null>(null)
  const fileRef                           = useRef<HTMLInputElement>(null)

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

  // ── CRUD ──
  const abrirNueva = () => { setEditando(null); setForm(emptyForm()); setShowModal(true) }
  const abrirEditar = (o: OrdenVenta) => {
    setEditando(o)
    setForm({ cliente_id: o.cliente_id, cliente_nombre: o.cliente_nombre, total: o.total, subtotal: o.subtotal, descuento: o.descuento, fecha: o.fecha, fecha_entrega: o.fecha_entrega || '', estado: o.estado, obs: o.obs, vendedor: o.vendedor })
    setShowModal(true)
  }

  const guardar = async () => {
    if (!form.cliente_nombre) { addToast('Seleccioná o escribí el cliente', false); return }
    setSaving(true)
    try {
      const url    = editando ? `/api/ordenes/${editando.id}` : '/api/ordenes'
      const method = editando ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, total: Number(form.total), subtotal: Number(form.subtotal || form.total) }) })
      if (!res.ok) throw new Error('Error guardando')
      addToast(editando ? '✅ OV actualizada' : '✅ OV creada')
      setShowModal(false); cargar()
    } catch { addToast('Error guardando', false) }
    finally { setSaving(false) }
  }

  const eliminar = async (o: OrdenVenta) => {
    if (!confirm(`¿Eliminar OV ${o.nro}?`)) return
    try {
      await fetch(`/api/ordenes/${o.id}`, { method: 'DELETE' })
      setOrdenes(prev => prev.filter(x => x.id !== o.id))
      addToast('OV eliminada')
    } catch { addToast('Error eliminando', false) }
  }

  // ── WORKFLOW: OV → Factura ──
  const abrirFacturar = (o: OrdenVenta) => {
    const clienteEnSistema = clientes.find(c => c.id === o.cliente_id)
    const metodoPago = clienteEnSistema?.metodo_pago || 'cheque_30'
    setOvAFacturar(o)
    setFacForm({
      tipo:        'B',
      fecha:       new Date().toISOString().split('T')[0],
      fecha_vto:   calcFechaVto(metodoPago, new Date().toISOString().split('T')[0]),
      metodo_pago: metodoPago,
      obs:         `Factura por ${o.nro}`,
    })
  }

  const confirmarFacturar = async () => {
    if (!ovAFacturar) return
    setFacturando(true)
    try {
      // 1. Crear factura
      const resF = await fetch('/api/facturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo:           facForm.tipo,
          cliente_id:     ovAFacturar.cliente_id,
          cliente_nombre: ovAFacturar.cliente_nombre,
          fecha:          facForm.fecha,
          fecha_vto:      facForm.fecha_vto || null,
          subtotal:       ovAFacturar.subtotal || ovAFacturar.total,
          total:          ovAFacturar.total,
          estado:         'pendiente',
          metodo_pago:    facForm.metodo_pago,
          obs:            facForm.obs,
        }),
      })
      if (!resF.ok) {
        const e = await resF.json()
        throw new Error(e.error || 'Error creando factura')
      }
      const factura = await resF.json()

      // 2. Actualizar saldo del cliente
      if (ovAFacturar.cliente_id) {
        const cliente = clientes.find(c => c.id === ovAFacturar.cliente_id)
        if (cliente) {
          await fetch(`/api/clientes/${ovAFacturar.cliente_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saldo_deudor: cliente.saldo_deudor + ovAFacturar.total }),
          })
        }
      }

      // 3. Marcar OV como facturada
      await fetch(`/api/ordenes/${ovAFacturar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'facturada_total' }),
      })

      addToast(`✅ Factura ${factura.nro} creada correctamente`)
      setOvAFacturar(null)
      cargar()
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : 'Error al facturar', false)
    } finally {
      setFacturando(false)
    }
  }

  // ── IMPORT ──
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setImportLoading(true)
    setImportResult(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('modo', 'preview')
      const res = await fetch('/api/ordenes/import', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      setImportResult(await res.json())
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : 'Error procesando archivo', false)
    } finally {
      setImportLoading(false); e.target.value = ''
    }
  }

  const confirmarImport = async () => {
    if (!importResult || importResult.validas === 0 || !pendingFile) return
    setImportando(true)
    try {
      const fd = new FormData(); fd.append('file', pendingFile); fd.append('modo', 'import')
      const res = await fetch('/api/ordenes/import', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      const r = await res.json()
      addToast(`✅ ${r.importados} órdenes importadas${r.clientes_creados > 0 ? ` · ${r.clientes_creados} clientes nuevos creados` : ''}${r.invalidas > 0 ? ` · ${r.invalidas} omitidas` : ''}`)
      setShowImport(false); setImportResult(null); setPendingFile(null); cargar()
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : 'Error importando', false)
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="section-content">

      {/* TOASTS */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.ok ? '#00b37e' : '#ef4444', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Órdenes de Venta</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {fmt(totalPend)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => window.open('/api/ordenes/template', '_blank')}>
            📋 Plantilla
          </button>
          <button className="btn btn-secondary" onClick={() => { setImportResult(null); setPendingFile(null); setShowImport(true) }}>
            ⬆ Importar Excel
          </button>
          <button className="btn btn-primary" onClick={abrirNueva}>+ Nueva OV</button>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {ESTADOS.map(e => {
          const count = ordenes.filter(o => o.estado === e.value).length
          const total = ordenes.filter(o => o.estado === e.value).reduce((s, o) => s + o.total, 0)
          return (
            <div key={e.value}
              onClick={() => setFiltro(e.value)}
              style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px 18px', border: `1px solid ${filtro === e.value ? e.color : 'var(--border)'}`, cursor: 'pointer', transition: 'border-color .15s' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{e.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: e.color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{fmt(total)}</div>
            </div>
          )
        })}
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn btn-secondary`} style={{ fontWeight: filtro === 'todas' ? 700 : 400, borderColor: filtro === 'todas' ? 'var(--primary)' : undefined }} onClick={() => setFiltro('todas')}>
          Todas ({ordenes.length})
        </button>
        {ESTADOS.map(e => (
          <button key={e.value} className="btn btn-secondary"
            style={{ fontWeight: filtro === e.value ? 700 : 400, borderColor: filtro === e.value ? e.color : undefined, color: filtro === e.value ? e.color : undefined }}
            onClick={() => setFiltro(e.value)}>
            {e.label} ({ordenes.filter(o => o.estado === e.value).length})
          </button>
        ))}
        <input className="form-control" placeholder="🔍 Buscar cliente u OV…" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ marginLeft: 'auto', minWidth: 200 }} />
      </div>

      {/* TABLE */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ marginBottom: 8 }}>Sin órdenes para este filtro</div>
          <button className="btn btn-primary" onClick={abrirNueva}>+ Crear primera OV</button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Nro OV','Cliente','Total','Fecha','Entrega','Estado','Detalle','Acciones'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(o => {
                const est  = ESTADOS.find(e => e.value === o.estado)
                const dias = o.fecha_entrega ? diasHasta(o.fecha_entrega) : null
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{o.nro}</td>
                    <td style={{ ...TD, fontWeight: 600, maxWidth: 200 }}>
                      {o.cliente_nombre}
                      {o.vendedor && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👤 {o.vendedor}</div>}
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>{fmt(o.total)}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(o.fecha)}</td>
                    <td style={TD}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(o.fecha_entrega)}</div>
                      {dias !== null && o.estado === 'pendiente' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: dias < 0 ? '#ef4444' : dias <= 3 ? '#f59e0b' : '#00b37e' }}>
                          {dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'Hoy' : `en ${dias}d`}
                        </span>
                      )}
                    </td>
                    <td style={TD}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: `${est?.color}22`, color: est?.color, border: `1px solid ${est?.color}44` }}>
                        {est?.label ?? o.estado}
                      </span>
                    </td>
                    <td style={{ ...TD, fontSize: 12, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.obs?.slice(0, 50)}{(o.obs?.length ?? 0) > 50 ? '…' : ''}
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                        {o.estado === 'pendiente' && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: 11, color: '#1a4a7a', border: '1px solid rgba(26,74,122,0.35)', whiteSpace: 'nowrap' }}
                            onClick={() => abrirFacturar(o)}
                          >
                            📄 Facturar
                          </button>
                        )}
                        <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => abrirEditar(o)}>✏️</button>
                        <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 12, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }} onClick={() => eliminar(o)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════ CRUD MODAL ══════════════════════════════════════════════ */}
      {showModal && (
        <div style={OVERLAY} onClick={() => setShowModal(false)}>
          <div style={MODAL_BOX} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HDR}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>{editando ? `Editar ${editando.nro}` : 'Nueva Orden de Venta'}</h3>
              <button onClick={() => setShowModal(false)} style={CLOSE_BTN}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <FF label="Cliente">
                <select className="form-control" value={form.cliente_id ?? ''} onChange={e => {
                  const id = Number(e.target.value)
                  const c  = clientes.find(x => x.id === id)
                  setForm(f => ({ ...f, cliente_id: id || null, cliente_nombre: c?.razon_social || '' }))
                }}>
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
                </select>
              </FF>
              <FF label="O escribir nombre libre">
                <input className="form-control" value={form.cliente_nombre} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value, cliente_id: null }))} placeholder="Nombre del cliente" />
              </FF>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Total ($)"><input className="form-control" type="number" min={0} step={100} value={form.total} onChange={e => setForm(f => ({ ...f, total: Number(e.target.value), subtotal: Number(e.target.value) }))} /></FF>
                <FF label="Descuento ($)"><input className="form-control" type="number" min={0} step={100} value={form.descuento} onChange={e => setForm(f => ({ ...f, descuento: Number(e.target.value) }))} /></FF>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Fecha"><input className="form-control" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></FF>
                <FF label="Fecha Entrega"><input className="form-control" type="date" value={form.fecha_entrega} onChange={e => setForm(f => ({ ...f, fecha_entrega: e.target.value }))} /></FF>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Estado">
                  <select className="form-control" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EstadoOV }))}>
                    {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </FF>
                <FF label="Vendedor"><input className="form-control" value={form.vendedor} onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))} placeholder="Nombre del vendedor" /></FF>
              </div>
              <FF label="Obs / Detalle de productos">
                <textarea className="form-control" rows={3} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} placeholder="Productos, tallas, condiciones…" />
              </FF>
            </div>
            <div style={MODAL_FTR}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : editando ? '💾 Actualizar' : '✅ Crear OV'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ FACTURAR MODAL ══════════════════════════════════════════ */}
      {ovAFacturar && (
        <div style={OVERLAY} onClick={() => setOvAFacturar(null)}>
          <div style={{ ...MODAL_BOX, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HDR}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>📄 Facturar OV {ovAFacturar.nro}</h3>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {ovAFacturar.cliente_nombre} · {fmt(ovAFacturar.total)}
                </div>
              </div>
              <button onClick={() => setOvAFacturar(null)} style={CLOSE_BTN}>✕</button>
            </div>

            {/* Preview info */}
            <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>OV</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{ovAFacturar.nro}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Cliente</span>
                <span style={{ fontWeight: 600 }}>{ovAFacturar.cliente_nombre}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total a Facturar</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: '#1a4a7a' }}>{fmt(ovAFacturar.total)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12 }}>
                <FF label="Tipo">
                  <select className="form-control" value={facForm.tipo} onChange={e => setFacForm(f => ({ ...f, tipo: e.target.value as TipoFactura }))}>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </FF>
                <FF label="Método de Pago">
                  <select className="form-control" value={facForm.metodo_pago}
                    onChange={e => {
                      const m = e.target.value
                      setFacForm(f => ({ ...f, metodo_pago: m as MetodoPago, fecha_vto: calcFechaVto(m, f.fecha) }))
                    }}>
                    {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </FF>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FF label="Fecha Factura"><input className="form-control" type="date" value={facForm.fecha} onChange={e => {
                  const fecha = e.target.value
                  setFacForm(f => ({ ...f, fecha, fecha_vto: calcFechaVto(f.metodo_pago, fecha) }))
                }} /></FF>
                <FF label="Vencimiento">
                  <input className="form-control" type="date" value={facForm.fecha_vto} onChange={e => setFacForm(f => ({ ...f, fecha_vto: e.target.value }))} />
                </FF>
              </div>
              <FF label="Observaciones">
                <input className="form-control" value={facForm.obs} onChange={e => setFacForm(f => ({ ...f, obs: e.target.value }))} />
              </FF>
            </div>

            <div style={MODAL_FTR}>
              <button className="btn btn-secondary" onClick={() => setOvAFacturar(null)} disabled={facturando}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarFacturar} disabled={facturando}>
                {facturando ? 'Emitiendo…' : `✅ Emitir Factura ${facForm.tipo} · ${fmt(ovAFacturar.total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ IMPORT MODAL ══════════════════════════════════════════ */}
      {showImport && (
        <div style={OVERLAY} onClick={() => { if (!importLoading && !importando) setShowImport(false) }}>
          <div style={{ ...MODAL_BOX, maxWidth: 820 }} onClick={e => e.stopPropagation()}>
            <div style={MODAL_HDR}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>Importar OV desde Excel</h3>
              <button onClick={() => setShowImport(false)} disabled={importLoading || importando} style={CLOSE_BTN}>✕</button>
            </div>

            {!importResult && !importLoading && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>📦</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.7 }}>
                  El archivo debe tener la columna <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>Cliente</code> y <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>Total</code>.
                  <br/>Descargá la{' '}
                  <button onClick={() => window.open('/api/ordenes/template', '_blank')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>plantilla</button>
                  {' '}para ver el formato.
                </p>
                <label style={{ display: 'inline-block', marginTop: 12, padding: '12px 32px', background: 'var(--primary)', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                  📂 Seleccionar archivo .xlsx
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFileChosen} />
                </label>
              </div>
            )}

            {importLoading && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                <div>Procesando…</div>
              </div>
            )}

            {importResult && !importLoading && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Total', value: importResult.total, color: undefined },
                    { label: 'Válidas', value: importResult.validas, color: '#00b37e' },
                    { label: 'Con errores', value: importResult.invalidas, color: importResult.invalidas > 0 ? '#ef4444' : undefined },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0 }}>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        {['Fila','OK','Cliente','Total','Fecha','Entrega','Obs','Errores'].map(h => <th key={h} style={TH}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.filas.map(f => (
                        <tr key={f.fila} style={{ borderBottom: '1px solid var(--border)', background: f.valido ? undefined : 'rgba(239,68,68,0.05)' }}>
                          <td style={{ ...TD, color: 'var(--text-muted)', width: 40 }}>{f.fila}</td>
                          <td style={{ ...TD, textAlign: 'center', width: 40 }}>{f.valido ? '✅' : '❌'}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>{f.cliente_nombre}</td>
                          <td style={{ ...TD, fontFamily: 'monospace' }}>{fmt(f.total)}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{f.fecha}</td>
                          <td style={{ ...TD, fontSize: 12 }}>{f.fecha_entrega || '—'}</td>
                          <td style={{ ...TD, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.obs || '—'}</td>
                          <td style={{ ...TD, color: '#ef4444', fontSize: 12 }}>{f.errores.length > 0 ? f.errores.join(' · ') : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => { setImportResult(null); setPendingFile(null) }}>← Cargar otro</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={confirmarImport} disabled={importResult.validas === 0 || importando}>
                      {importando ? 'Importando…' : `✅ Importar ${importResult.validas} OV${importResult.validas !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function emptyForm() {
  return { cliente_id: null as number | null, cliente_nombre: '', total: 0, subtotal: 0, descuento: 0, fecha: new Date().toISOString().split('T')[0], fecha_entrega: '', estado: 'pendiente' as EstadoOV, obs: '', vendedor: '' }
}

function emptyFacForm() {
  return { tipo: 'B' as TipoFactura, fecha: new Date().toISOString().split('T')[0], fecha_vto: '', metodo_pago: 'cheque_30' as MetodoPago, obs: '' }
}

const OVERLAY: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const MODAL_BOX: React.CSSProperties = { background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 56px rgba(0,0,0,0.55)' }
const MODAL_HDR: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }
const MODAL_FTR: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }
const CLOSE_BTN: React.CSSProperties = { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }
const TH: React.CSSProperties = { padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.04em' }
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
