'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { OrdenVenta, Cliente } from '@/lib/types'
import { fmt, fmtDate } from '@/lib/utils'

const fmt$ = fmt

const ESTADO_COLOR: Record<string, string> = {
  pendiente:         '#f59e0b',
  facturada_parcial: '#3b82f6',
  facturada_total:   '#00b37e',
  anulada:           '#6b7280',
}
const ESTADO_LABEL: Record<string, string> = {
  pendiente:         'Pendiente',
  facturada_parcial: 'Fact. Parcial',
  facturada_total:   'Facturada',
  anulada:           'Anulada',
}

type GrupoCliente = {
  key:           string       // ctb_persona_id o cliente_nombre
  nombre:        string
  cliente_id:    number | null
  ctb_persona_id: number | null
  ordenes:       OrdenVenta[]
  totalPendiente: number
  totalFacturado: number
}

type ItemCTB = {
  Codigo:        string
  Concepto:      string
  Cantidad:      number
  PrecioUnitario:number
  Iva:           number
  Bonificacion:  number
}

export function Ordenes() {
  const [ordenes, setOrdenes]   = useState<OrdenVenta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading]   = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todas')

  // Modal cliente
  const [clienteModal, setClienteModal] = useState<GrupoCliente | null>(null)

  // Detalle de una OV (items desde Contabilium)
  const [ovDetalle, setOvDetalle]       = useState<OrdenVenta | null>(null)
  const [ovItems, setOvItems]           = useState<ItemCTB[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [ro, rc] = await Promise.all([
        fetch('/api/ordenes').then(r => r.json()),
        fetch('/api/clientes?activo=true').then(r => r.json()),
      ])
      if (Array.isArray(ro)) setOrdenes(ro)
      if (Array.isArray(rc)) setClientes(rc)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Agrupar OVs por cliente (1 fila por cliente)
  const grupos: GrupoCliente[] = useMemo(() => {
    const map = new Map<string, GrupoCliente>()
    for (const o of ordenes) {
      const key    = o.ctb_persona_id ? String(o.ctb_persona_id) : (o.cliente_nombre || 'sin-cliente')
      const nombre = o.cliente_nombre || 'Sin cliente'
      if (!map.has(key)) {
        map.set(key, {
          key,
          nombre,
          cliente_id:    o.cliente_id,
          ctb_persona_id: (o as OrdenVenta & { ctb_persona_id?: number }).ctb_persona_id ?? null,
          ordenes:        [],
          totalPendiente: 0,
          totalFacturado: 0,
        })
      }
      const g = map.get(key)!
      g.ordenes.push(o)
      if (o.estado === 'pendiente' || o.estado === 'facturada_parcial') g.totalPendiente += o.total
      if (o.estado === 'facturada_total') g.totalFacturado += o.total
    }
    return Array.from(map.values()).sort((a, b) => b.totalPendiente - a.totalPendiente)
  }, [ordenes])

  const gruposFiltrados = useMemo(() => {
    let lista = grupos
    if (busqueda) {
      const q = busqueda.toLowerCase()
      lista   = lista.filter(g => g.nombre.toLowerCase().includes(q))
    }
    if (filtroEstado !== 'todas') {
      lista = lista.filter(g => g.ordenes.some(o => o.estado === filtroEstado))
    }
    return lista
  }, [grupos, busqueda, filtroEstado])

  const stats = useMemo(() => ({
    totalClientes:  grupos.length,
    totalPendiente: ordenes.filter(o => o.estado === 'pendiente').reduce((s, o) => s + o.total, 0),
    cantPendiente:  ordenes.filter(o => o.estado === 'pendiente').length,
    cantFacturadas: ordenes.filter(o => o.estado === 'facturada_total').length,
  }), [grupos, ordenes])

  const abrirCliente = (g: GrupoCliente) => {
    setClienteModal(g)
    setOvDetalle(null)
    setOvItems([])
  }

  const abrirDetalle = async (o: OrdenVenta) => {
    setOvDetalle(o)
    setOvItems([])
    if (!o.ctb_id) return
    setLoadingItems(true)
    try {
      const res  = await fetch(`/api/ordenes/${o.id}/detalle`)
      const data = await res.json()
      setOvItems((data?.ctbDetalle?.Items || []) as ItemCTB[])
    } finally {
      setLoadingItems(false)
    }
  }

  const clienteInfo = (g: GrupoCliente): Cliente | undefined =>
    g.cliente_id ? clientes.find(c => c.id === g.cliente_id) : undefined

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando órdenes…</div>

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Clientes con OVs',    val: stats.totalClientes,             mono: true },
          { label: 'Pendiente de cobro',  val: fmt$(stats.totalPendiente),      color: '#c8440a' },
          { label: 'OVs pendientes',      val: stats.cantPendiente,             mono: true, color: '#f59e0b' },
          { label: 'OVs facturadas',      val: stats.cantFacturadas,            mono: true, color: '#00b37e' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: s.mono ? 'IBM Plex Mono, monospace' : undefined, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 Buscar cliente…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
        />
        {['todas','pendiente','facturada_total','facturada_parcial','anulada'].map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: filtroEstado === e ? 700 : 400, cursor: 'pointer',
              background: filtroEstado === e ? (ESTADO_COLOR[e] || 'var(--accent)') : 'var(--bg-secondary)',
              color: filtroEstado === e ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filtroEstado === e ? (ESTADO_COLOR[e] || 'var(--accent)') : 'var(--border)'}`,
            }}>
            {e === 'todas' ? 'Todas' : ESTADO_LABEL[e]}
          </button>
        ))}
      </div>

      {/* Tabla agrupada por cliente */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Cliente','Órdenes','Pendiente','Facturado','Última OV',''].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gruposFiltrados.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>Sin órdenes para este filtro</td></tr>
            )}
            {gruposFiltrados.map(g => {
              const cli      = clienteInfo(g)
              const ultimaOV = g.ordenes.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0]
              const estados  = [...new Set(g.ordenes.map(o => o.estado))]
              return (
                <tr key={g.key} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => abrirCliente(g)}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{g.nombre}</div>
                    {cli?.cuit && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>CUIT {cli.cuit}</div>}
                    {cli?.ciudad && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cli.ciudad}{cli.provincia ? `, ${cli.provincia}` : ''}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{g.ordenes.length}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {estados.map(e => (
                        <span key={e} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: (ESTADO_COLOR[e] || '#999') + '22', color: ESTADO_COLOR[e] || '#999', fontWeight: 600 }}>
                          {ESTADO_LABEL[e]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: g.totalPendiente > 0 ? '#c8440a' : 'var(--text-muted)' }}>
                    {g.totalPendiente > 0 ? fmt$(g.totalPendiente) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'IBM Plex Mono, monospace', color: '#00b37e' }}>
                    {g.totalFacturado > 0 ? fmt$(g.totalFacturado) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {ultimaOV ? fmtDate(ultimaOV.fecha) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      Ver →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ══════════ MODAL CLIENTE ══════════════════════════════════════════════ */}
      {clienteModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { if (!ovDetalle) setClienteModal(null) }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, width: '100%', maxWidth: 820, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 12px 60px #0005' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '22px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{clienteModal.nombre}</h2>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  {clienteModal.ordenes.length} órdenes de venta
                </div>
              </div>
              <button onClick={() => setClienteModal(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Datos del cliente */}
              {(() => {
                const cli = clienteInfo(clienteModal)
                return (
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '16px 20px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Datos del Cliente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
                      {cli ? [
                        ['CUIT',           cli.cuit || '—'],
                        ['Email',          cli.email || '—'],
                        ['Teléfono',       cli.telefono || cli.whatsapp || '—'],
                        ['Ciudad',         cli.ciudad || '—'],
                        ['Provincia',      cli.provincia || '—'],
                        ['Cond. IVA',      cli.cond_iva || '—'],
                        ['Método de pago', cli.metodo_pago || '—'],
                        ['Límite crédito', cli.limite_credito > 0 ? fmt$(cli.limite_credito) : 'Sin límite'],
                        ['Saldo deudor',   fmt$(cli.saldo_deudor)],
                      ].map(([k, v]) => (
                        <div key={String(k)}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
                          <div style={{ fontWeight: 600, marginTop: 1 }}>{String(v)}</div>
                        </div>
                      )) : (
                        <div style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: 12 }}>
                          Cliente no sincronizado en la base local. Sincronizá Clientes desde Contabilium para ver sus datos.
                        </div>
                      )}
                    </div>
                    {cli && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 13 }}>
                        <div style={{ background: '#c8440a18', border: '1px solid #c8440a40', borderRadius: 6, padding: '8px 16px' }}>
                          <div style={{ fontSize: 10, color: '#c8440a', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pendiente OVs</div>
                          <div style={{ fontWeight: 800, fontFamily: 'IBM Plex Mono, monospace', color: '#c8440a' }}>{fmt$(clienteModal.totalPendiente)}</div>
                        </div>
                        <div style={{ background: '#00b37e18', border: '1px solid #00b37e40', borderRadius: 6, padding: '8px 16px' }}>
                          <div style={{ fontSize: 10, color: '#00b37e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Facturado</div>
                          <div style={{ fontWeight: 800, fontFamily: 'IBM Plex Mono, monospace', color: '#00b37e' }}>{fmt$(clienteModal.totalFacturado)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Órdenes del cliente */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  Órdenes de Venta ({clienteModal.ordenes.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {clienteModal.ordenes
                    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                    .map(o => {
                      const isOpen = ovDetalle?.id === o.id
                      return (
                        <div key={o.id} style={{ border: `1px solid ${isOpen ? ESTADO_COLOR[o.estado] || 'var(--border)' : 'var(--border)'}`, borderRadius: 8, overflow: 'hidden' }}>
                          {/* OV row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: isOpen ? 'var(--bg-primary)' : 'transparent', cursor: 'pointer' }}
                            onClick={() => isOpen ? setOvDetalle(null) : abrirDetalle(o)}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 13 }}>{o.nro}</span>
                                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 3, background: (ESTADO_COLOR[o.estado] || '#999') + '22', color: ESTADO_COLOR[o.estado] || '#999', fontWeight: 700 }}>
                                  {ESTADO_LABEL[o.estado]}
                                </span>
                                {(o as OrdenVenta & { ctb_comprobante_id?: number }).ctb_comprobante_id ? (
                                  <span style={{ fontSize: 10, color: '#00b37e', background: '#00b37e18', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>✓ Facturada</span>
                                ) : null}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                {fmtDate(o.fecha)}{o.vendedor ? ` · ${o.vendedor}` : ''}{o.obs ? ` · ${o.obs.slice(0, 60)}` : ''}
                              </div>
                            </div>
                            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 800, fontSize: 15, color: o.estado === 'facturada_total' ? '#00b37e' : '#c8440a' }}>
                              {fmt$(o.total)}
                            </div>
                            <div style={{ fontSize: 18, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</div>
                          </div>

                          {/* Ítems */}
                          {isOpen && (
                            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                              {loadingItems ? (
                                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Cargando artículos…</div>
                              ) : ovItems.length > 0 ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg-secondary)' }}>
                                      {['Código','Artículo','Cant.','Precio Unit.','IVA%','Subtotal'].map(h => (
                                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ovItems.map((it, i) => {
                                      const cant   = Number(it.Cantidad || 0)
                                      const precio = Number(it.PrecioUnitario || 0)
                                      const boni   = Number(it.Bonificacion || 0)
                                      const sub    = cant * precio * (1 - boni / 100)
                                      return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                          <td style={{ padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>{it.Codigo || '—'}</td>
                                          <td style={{ padding: '8px 10px', fontWeight: 600, maxWidth: 260 }}>{it.Concepto || '—'}</td>
                                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{cant}</td>
                                          <td style={{ padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>{fmt$(precio)}</td>
                                          <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{it.Iva}%</td>
                                          <td style={{ padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>{fmt$(sub)}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-secondary)' }}>
                                      <td colSpan={5} style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>TOTAL</td>
                                      <td style={{ padding: '9px 10px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 800, fontSize: 15 }}>{fmt$(o.total)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              ) : (
                                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                  Sin ítems disponibles (OV no sincronizada desde Contabilium o sin ctb_id)
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
