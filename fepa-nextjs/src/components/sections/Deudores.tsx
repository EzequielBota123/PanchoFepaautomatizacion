'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { Cliente, Factura, OrdenVenta, FilaImportOV } from '@/lib/types'
import { fmt, fmtDate, semaforo } from '@/lib/utils'

const fmtPeso = fmt

type AgingBucket = 'vencido' | 'proximo' | 'medio' | 'corriente'
type Toast = { id: number; msg: string; ok: boolean }

function getAging(fecha_vto: string | null): AgingBucket {
  if (!fecha_vto) return 'corriente'
  const hoy  = new Date(); hoy.setHours(0,0,0,0)
  const vto  = new Date(fecha_vto); vto.setHours(0,0,0,0)
  const dias = Math.round((vto.getTime() - hoy.getTime()) / 86400000)
  if (dias < 0)  return 'vencido'
  if (dias <= 7) return 'proximo'
  if (dias <= 30) return 'medio'
  return 'corriente'
}

const AGING_META: Record<AgingBucket, { label: string; color: string; bg: string }> = {
  vencido:   { label: 'Vencido',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)'  },
  proximo:   { label: 'Vence ≤7 días', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  medio:     { label: '8–30 días',     color: '#3b82f6', bg: 'rgba(59,130,246,0.06)' },
  corriente: { label: '+30 días',      color: '#00b37e', bg: 'rgba(0,179,126,0.06)'  },
}

type OVGrupo = { nombre: string; ovs: OrdenVenta[]; total: number; ultima: string }

export function Deudores() {
  const [activeTab, setActiveTab]     = useState<'ordenes' | 'facturas'>('ordenes')
  const [clientes, setClientes]       = useState<Cliente[]>([])
  const [facturas, setFacturas]       = useState<Factura[]>([])
  const [ordenes, setOrdenes]         = useState<OrdenVenta[]>([])
  const [loading, setLoading]         = useState(true)
  const [busqueda, setBusqueda]       = useState('')
  const [detalle, setDetalle]         = useState<Cliente | null>(null)
  const [ovExpanded, setOvExpanded]   = useState<string | null>(null)
  const [toasts, setToasts]           = useState<Toast[]>([])

  // Import facturas
  const [showImportFac, setShowImportFac]       = useState(false)
  const [importLoadingFac, setImportLoadingFac] = useState(false)
  const [importResultFac, setImportResultFac]   = useState<{ total: number; validas: number; invalidas: number; filas: unknown[] } | null>(null)
  const [importandoFac, setImportandoFac]       = useState(false)
  const [pendingFileFac, setPendingFileFac]     = useState<File | null>(null)

  // Import OVs
  const [showImportOV, setShowImportOV]       = useState(false)
  const [importLoadingOV, setImportLoadingOV] = useState(false)
  const [importResultOV, setImportResultOV]   = useState<{ total: number; validas: number; invalidas: number; filas: FilaImportOV[]; agrupado_por?: string | null } | null>(null)
  const [importandoOV, setImportandoOV]       = useState(false)
  const [pendingFileOV, setPendingFileOV]     = useState<File | null>(null)
  const fileOVRef = useRef<HTMLInputElement>(null)

  // Cobrar modal (facturas)
  const [facACobrar, setFacACobrar]   = useState<Factura | null>(null)
  const [cobrarForm, setCobrarForm]   = useState({ metodo: 'transferencia', referencia: '', fecha: new Date().toISOString().split('T')[0] })
  const [cobrando, setCobrando]       = useState(false)

  // Marcar OV como cobrada
  const [ovACobrar, setOvACobrar]     = useState<OrdenVenta | null>(null)
  const [cobrandoOV, setCobrandoOV]   = useState(false)

  const addToast = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rc, rf, ro] = await Promise.all([
        fetch('/api/clientes').then(r => r.json()),
        fetch('/api/facturas?estado=pendiente').then(r => r.json()),
        fetch('/api/ordenes').then(r => r.json()),
      ])
      if (Array.isArray(rc)) setClientes(rc)
      if (Array.isArray(rf)) setFacturas(rf)
      if (Array.isArray(ro)) setOrdenes(ro)
    } catch (e) { console.error('Deudores load error:', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Facturas ──
  const deudores = useMemo(() =>
    clientes
      .filter(c => c.saldo_deudor > 0)
      .filter(c => !busqueda || c.razon_social.toLowerCase().includes(busqueda.toLowerCase()))
      .sort((a, b) => b.saldo_deudor - a.saldo_deudor),
    [clientes, busqueda]
  )

  const agingTotals = useMemo(() => {
    const res: Record<AgingBucket, number> = { vencido: 0, proximo: 0, medio: 0, corriente: 0 }
    for (const f of facturas) res[getAging(f.fecha_vto)] += f.total
    return res
  }, [facturas])

  const totalSaldo = deudores.reduce((s, c) => s + c.saldo_deudor, 0)
  const enRiesgo   = deudores.filter(c => semaforo(c) === 'rojo').length

  // ── OVs agrupadas por cliente ──
  const ovsGrupo = useMemo<OVGrupo[]>(() => {
    const groups = new Map<string, OVGrupo>()
    for (const ov of ordenes) {
      if (ov.estado === 'anulada' || ov.estado === 'facturada_total') continue
      const k = (ov.cliente_nombre || 'Sin cliente').trim()
      if (!groups.has(k)) groups.set(k, { nombre: k, ovs: [], total: 0, ultima: ov.fecha })
      const g = groups.get(k)!
      g.ovs.push(ov)
      g.total += ov.total
      if (ov.fecha > g.ultima) g.ultima = ov.fecha
    }
    return [...groups.values()]
      .filter(g => !busqueda || g.nombre.toLowerCase().includes(busqueda.toLowerCase()))
      .sort((a, b) => b.total - a.total)
  }, [ordenes, busqueda])

  const totalOVs   = ovsGrupo.reduce((s, g) => s + g.total, 0)
  const totalOVCnt = ovsGrupo.reduce((s, g) => s + g.ovs.length, 0)

  // ── Cobrar factura ──
  const confirmarCobrar = async () => {
    if (!facACobrar) return
    setCobrando(true)
    try {
      const res = await fetch(`/api/facturas/${facACobrar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cobrada' }),
      })
      if (!res.ok) throw new Error('Error')
      addToast(`✅ Factura ${facACobrar.nro} marcada como cobrada`)
      setFacACobrar(null); setDetalle(null); loadData()
    } catch { addToast('Error al cobrar factura', false) }
    finally { setCobrando(false) }
  }

  // ── Cobrar OV ──
  const confirmarCobrarOV = async () => {
    if (!ovACobrar) return
    setCobrandoOV(true)
    try {
      const res = await fetch(`/api/ordenes/${ovACobrar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'facturada_total' }),
      })
      if (!res.ok) throw new Error('Error')
      addToast(`✅ Orden ${ovACobrar.nro} marcada como cobrada`)
      setOvACobrar(null); loadData()
    } catch { addToast('Error al actualizar orden', false) }
    finally { setCobrandoOV(false) }
  }

  // ── Import facturas ──
  const onFileFacChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setPendingFileFac(file); setImportLoadingFac(true); setImportResultFac(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('modo', 'preview')
      const res = await fetch('/api/facturas/import', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      setImportResultFac(await res.json())
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : 'Error procesando archivo', false) }
    finally { setImportLoadingFac(false); e.target.value = '' }
  }

  const confirmarImportFac = async () => {
    if (!importResultFac || !pendingFileFac) return
    setImportandoFac(true)
    try {
      const fd = new FormData(); fd.append('file', pendingFileFac); fd.append('modo', 'import')
      const res = await fetch('/api/facturas/import', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      const r = await res.json()
      addToast(`✅ ${r.importados} facturas importadas`)
      setShowImportFac(false); setImportResultFac(null); setPendingFileFac(null); loadData()
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : 'Error importando', false) }
    finally { setImportandoFac(false) }
  }

  // ── Import OVs ──
  const onFileOVChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setPendingFileOV(file); setImportLoadingOV(true); setImportResultOV(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('modo', 'preview')
      const res = await fetch('/api/ordenes/import', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      setImportResultOV(await res.json())
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : 'Error procesando archivo', false) }
    finally { setImportLoadingOV(false); e.target.value = '' }
  }

  const confirmarImportOV = async () => {
    if (!importResultOV || !pendingFileOV) return
    setImportandoOV(true)
    try {
      const fd = new FormData(); fd.append('file', pendingFileOV); fd.append('modo', 'import')
      const res = await fetch('/api/ordenes/import', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      const r = await res.json()
      addToast(`✅ ${r.importados} órdenes importadas${r.clientes_creados > 0 ? ` · ${r.clientes_creados} clientes nuevos` : ''}`)
      setShowImportOV(false); setImportResultOV(null); setPendingFileOV(null); loadData()
    } catch (err: unknown) { addToast(err instanceof Error ? err.message : 'Error importando', false) }
    finally { setImportandoOV(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Deudores y Cobranzas</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {activeTab === 'ordenes'
              ? `${ovsGrupo.length} clientes · ${totalOVCnt} órdenes · ${fmtPeso(totalOVs)} pendiente`
              : `${deudores.length} cliente${deudores.length !== 1 ? 's' : ''} con saldo · ${fmtPeso(totalSaldo)} total`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activeTab === 'ordenes' ? (
            <>
              <button className="btn btn-secondary" onClick={() => window.open('/api/ordenes/template', '_blank')}>📋 Plantilla OV</button>
              <button className="btn btn-secondary" onClick={() => { setImportResultOV(null); setPendingFileOV(null); setShowImportOV(true) }}>⬆ Importar OVs</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => window.open('/api/facturas/template', '_blank')}>📋 Plantilla Facturas</button>
              <button className="btn btn-secondary" onClick={() => { setImportResultFac(null); setPendingFileFac(null); setShowImportFac(true) }}>⬆ Importar Facturas</button>
            </>
          )}
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-primary)', borderRadius: 8, padding: 3, width: 'fit-content', marginBottom: 20, border: '1px solid var(--border)' }}>
        {(['ordenes', 'facturas'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setBusqueda('') }}
            style={{ padding: '7px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all .15s',
              background: activeTab === tab ? 'var(--primary)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--text-muted)' }}>
            {tab === 'ordenes' ? '📦 Órdenes de Venta' : '🧾 Facturas'}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ OV TAB ══════════════════════════════════════ */}
      {activeTab === 'ordenes' && (
        <>
          {/* OV STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
            <div style={STAT_CARD}>
              <div style={STAT_LABEL}>Total Pendiente</div>
              <div style={{ ...STAT_VAL, color: '#ef4444' }}>{fmtPeso(totalOVs)}</div>
              <div style={STAT_SUB}>{totalOVCnt} órdenes activas</div>
            </div>
            <div style={STAT_CARD}>
              <div style={STAT_LABEL}>Clientes con OV</div>
              <div style={{ ...STAT_VAL, color: 'var(--primary)' }}>{ovsGrupo.length}</div>
              <div style={STAT_SUB}>con saldo pendiente</div>
            </div>
            <div style={STAT_CARD}>
              <div style={STAT_LABEL}>Promedio por cliente</div>
              <div style={{ ...STAT_VAL }}>{ovsGrupo.length > 0 ? fmtPeso(Math.round(totalOVs / ovsGrupo.length)) : '$0'}</div>
              <div style={STAT_SUB}>saldo promedio</div>
            </div>
          </div>

          {/* SEARCH */}
          <div style={{ marginBottom: 12 }}>
            <input className="form-control" placeholder="🔍 Buscar cliente…" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ maxWidth: 300 }} />
          </div>

          {ovsGrupo.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No hay órdenes pendientes</div>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Importá el Excel de tu sistema para ver el estado de cada cliente.</div>
              <button className="btn btn-primary" onClick={() => { setImportResultOV(null); setPendingFileOV(null); setShowImportOV(true) }}>
                ⬆ Importar Excel de Órdenes
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)' }}>
                    {['Cliente','Órdenes','Total Pendiente','Última OV','Estado','Detalle'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ovsGrupo.map(g => {
                    const expanded = ovExpanded === g.nombre
                    const hasOverdue = g.ovs.some(o => {
                      if (!o.fecha_entrega) return false
                      return new Date(o.fecha_entrega) < new Date()
                    })
                    return (
                      <>
                        <tr key={g.nombre}
                          style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)', cursor: 'pointer', background: hasOverdue ? 'rgba(239,68,68,0.04)' : undefined }}
                          onClick={() => setOvExpanded(expanded ? null : g.nombre)}>
                          <td style={{ padding: '11px 14px', fontWeight: 600 }}>
                            {hasOverdue && <span style={{ marginRight: 5 }}>🔴</span>}
                            {g.nombre}
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{g.ovs.length}</span>
                          </td>
                          <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>
                            {fmtPeso(g.total)}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                            {fmtDate(g.ultima)}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                              background: hasOverdue ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                              color: hasOverdue ? '#ef4444' : '#f59e0b',
                              border: `1px solid ${hasOverdue ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                              {hasOverdue ? 'Vencido' : 'Pendiente'}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 18 }}>
                            {expanded ? '▲' : '▼'}
                          </td>
                        </tr>

                        {expanded && (
                          <tr key={`${g.nombre}_det`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={6} style={{ padding: '0 14px 14px 28px', background: 'var(--bg-primary)' }}>
                              <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {g.ovs.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(ov => {
                                  const diasDesde = Math.round((Date.now() - new Date(ov.fecha).getTime()) / 86400000)
                                  return (
                                    <div key={ov.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                      <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--primary)', minWidth: 90 }}>{ov.nro}</div>
                                      <div style={{ flex: 1 }}>
                                        {ov.obs && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{ov.obs.slice(0, 80)}{ov.obs.length > 80 ? '…' : ''}</div>}
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                          {fmtDate(ov.fecha)} · hace {diasDesde}d
                                          {ov.fecha_entrega && <span style={{ marginLeft: 8 }}>· Entrega: {fmtDate(ov.fecha_entrega)}</span>}
                                        </div>
                                      </div>
                                      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', minWidth: 100, textAlign: 'right' }}>{fmtPeso(ov.total)}</div>
                                      <button
                                        onClick={e => { e.stopPropagation(); setOvACobrar(ov) }}
                                        style={{ padding: '4px 10px', fontSize: 11, background: '#00b37e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        ✓ Cobrada
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════ FACTURAS TAB ════════════════════════════════ */}
      {activeTab === 'facturas' && (
        <>
          {/* AGING STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            {(Object.keys(AGING_META) as AgingBucket[]).map(bucket => {
              const meta = AGING_META[bucket]
              const facs = facturas.filter(f => getAging(f.fecha_vto) === bucket)
              return (
                <div key={bucket} style={{ background: meta.bg, borderRadius: 10, padding: '14px 18px', border: `1px solid ${meta.color}33` }}>
                  <div style={{ fontSize: 11, color: meta.color, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{meta.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: meta.color, lineHeight: 1 }}>{fmtPeso(agingTotals[bucket])}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{facs.length} factura{facs.length !== 1 ? 's' : ''}</div>
                </div>
              )
            })}
          </div>

          {/* SUMMARY STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
            <div style={STAT_CARD}>
              <div style={STAT_LABEL}>Cartera Total</div>
              <div style={{ ...STAT_VAL, color: '#ef4444' }}>{fmtPeso(totalSaldo)}</div>
              <div style={STAT_SUB}>{deudores.length} clientes con saldo</div>
            </div>
            <div style={STAT_CARD}>
              <div style={STAT_LABEL}>En Riesgo 🔴</div>
              <div style={{ ...STAT_VAL, color: '#ef4444' }}>{enRiesgo}</div>
              <div style={STAT_SUB}>Límite de crédito alcanzado</div>
            </div>
            <div style={STAT_CARD}>
              <div style={STAT_LABEL}>Facturas Pendientes</div>
              <div style={{ ...STAT_VAL, color: '#1a4a7a' }}>{facturas.length}</div>
              <div style={STAT_SUB}>{fmtPeso(facturas.reduce((s, f) => s + f.total, 0))} por cobrar</div>
            </div>
          </div>

          {/* TABLE */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Clientes con saldo deudor</span>
              <input className="form-control" placeholder="🔍 Buscar…" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: 200 }} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)' }}>
                    {['Cliente','Zona','Método Pago','Saldo Deudor','Límite','% Usado','Facturas','WA','Estado'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deudores.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin clientes con saldo deudor</td></tr>
                  )}
                  {deudores.map(c => {
                    const facsc    = facturas.filter(f => f.cliente_id === c.id)
                    const estado   = semaforo(c)
                    const pct      = c.limite_credito > 0 ? Math.min(100, Math.round((c.saldo_deudor / c.limite_credito) * 100)) : null
                    const alerta   = estado === 'rojo'
                    const vencidas = facsc.filter(f => getAging(f.fecha_vto) === 'vencido').length
                    const waMsg    = encodeURIComponent(`Hola ${c.razon_social}, te contactamos de FEPA Mayorista. Tenés un saldo pendiente de ${fmtPeso(c.saldo_deudor)}. ¿Podemos coordinar el pago?`)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: alerta ? 'rgba(239,68,68,0.04)' : undefined, cursor: 'pointer' }} onClick={() => setDetalle(c)}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {alerta && <span style={{ marginRight: 5 }}>🔴</span>}
                          {c.razon_social}
                          {facsc.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {facsc.length} factura{facsc.length > 1 ? 's' : ''} pendiente{facsc.length > 1 ? 's' : ''}
                              {vencidas > 0 && <span style={{ marginLeft: 6, color: '#ef4444', fontWeight: 700 }}>· {vencidas} vencida{vencidas > 1 ? 's' : ''}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{c.zona || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>{c.metodo_pago}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>{fmtPeso(c.saldo_deudor)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{c.limite_credito > 0 ? fmtPeso(c.limite_credito) : '∞'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {pct !== null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80 }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#00b37e', transition: 'width .3s' }} />
                              </div>
                              <span style={{ fontSize: 11, minWidth: 30, color: pct >= 100 ? '#ef4444' : 'var(--text-muted)' }}>{pct}%</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, textAlign: 'center' }}>
                          {facsc.length > 0 ? <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{facsc.length}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                          {c.whatsapp && (
                            <a href={`https://wa.me/54${c.whatsapp.replace(/\D/g, '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, textDecoration: 'none' }}>📱</a>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                            background: estado === 'rojo' ? 'rgba(239,68,68,0.15)' : estado === 'amarillo' ? 'rgba(245,158,11,0.15)' : 'rgba(0,179,126,0.15)',
                            color: estado === 'rojo' ? '#ef4444' : estado === 'amarillo' ? '#f59e0b' : '#00b37e',
                            border: `1px solid ${estado === 'rojo' ? 'rgba(239,68,68,0.3)' : estado === 'amarillo' ? 'rgba(245,158,11,0.3)' : 'rgba(0,179,126,0.3)'}` }}>
                            {estado === 'rojo' ? 'En riesgo' : estado === 'amarillo' ? 'Atención' : 'Al día'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════ DETALLE PANEL (Facturas) ══════════════════════════════ */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setDetalle(null)}>
          <div style={{ width: 440, background: 'var(--bg-secondary)', height: '100%', overflowY: 'auto', padding: 28, boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detalle.razon_social}</h3>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>{detalle.cuit || 'Sin CUIT'}</div>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding: '14px 16px', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saldo Deudor</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', fontSize: 18 }}>{fmtPeso(detalle.saldo_deudor)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Límite Crédito</span>
                <span style={{ fontFamily: 'monospace' }}>{detalle.limite_credito > 0 ? fmtPeso(detalle.limite_credito) : '∞'}</span>
              </div>
              {detalle.limite_credito > 0 && (
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.round((detalle.saldo_deudor / detalle.limite_credito) * 100))}%`, background: detalle.saldo_deudor >= detalle.limite_credito ? '#ef4444' : '#f59e0b' }} />
                </div>
              )}
            </div>
            <DRow label="Método de Pago" value={detalle.metodo_pago} />
            <DRow label="Zona" value={detalle.zona || '—'} />
            <DRow label="Vendedor" value={detalle.vendedor || '—'} />
            <DRow label="Email" value={detalle.email || '—'} />
            <DRow label="Teléfono" value={detalle.telefono || '—'} />
            {(() => {
              const facs = facturas.filter(f => f.cliente_id === detalle.id)
              if (facs.length === 0) return (
                <div style={{ marginTop: 20, padding: '14px', background: 'rgba(0,179,126,0.08)', borderRadius: 8, border: '1px solid rgba(0,179,126,0.2)', textAlign: 'center', color: '#00b37e', fontSize: 13 }}>
                  ✅ Sin facturas pendientes
                </div>
              )
              const buckets: AgingBucket[] = ['vencido','proximo','medio','corriente']
              return (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Facturas Pendientes ({facs.length})</div>
                  {buckets.map(bucket => {
                    const grupo = facs.filter(f => getAging(f.fecha_vto) === bucket)
                    if (grupo.length === 0) return null
                    const meta = AGING_META[bucket]
                    return (
                      <div key={bucket} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{meta.label}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: meta.color, fontWeight: 600 }}>{fmtPeso(grupo.reduce((s, f) => s + f.total, 0))}</span>
                        </div>
                        {grupo.map(f => {
                          const diasVto = f.fecha_vto ? Math.round((new Date(f.fecha_vto).getTime() - Date.now()) / 86400000) : null
                          return (
                            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: meta.bg, borderRadius: 6, border: `1px solid ${meta.color}33`, marginBottom: 6 }}>
                              <div>
                                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{f.nro}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {f.fecha_vto
                                    ? <span style={{ color: bucket === 'vencido' ? '#ef4444' : 'var(--text-muted)' }}>
                                        Vto: {fmtDate(f.fecha_vto)}{diasVto !== null && <span style={{ marginLeft: 6, fontWeight: 700 }}>{diasVto < 0 ? `(${Math.abs(diasVto)}d atrás)` : `(en ${diasVto}d)`}</span>}
                                      </span>
                                    : `Emitida: ${fmtDate(f.fecha)}`}
                                  {f.metodo_pago && <span style={{ marginLeft: 8 }}>· {f.metodo_pago}</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>{fmtPeso(f.total)}</span>
                                <button onClick={() => { setCobrarForm({ metodo: f.metodo_pago || 'transferencia', referencia: '', fecha: new Date().toISOString().split('T')[0] }); setFacACobrar(f) }}
                                  style={{ padding: '3px 8px', fontSize: 11, background: '#00b37e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  ✓ Cobrar
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            {detalle.whatsapp && (
              <a href={`https://wa.me/54${detalle.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${detalle.razon_social}, te contactamos de FEPA Mayorista. Tenés un saldo pendiente de ${fmtPeso(detalle.saldo_deudor)}. ¿Podemos coordinar el pago?`)}`}
                target="_blank" rel="noopener noreferrer" className="btn btn-secondary"
                style={{ display: 'block', textAlign: 'center', marginTop: 20, textDecoration: 'none' }}>
                📱 Enviar WA de cobranza
              </a>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ MARCAR OV COMO COBRADA ═══════════════════════════════ */}
      {ovACobrar && (
        <div style={OVERLAY} onClick={() => setOvACobrar(null)}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 56px rgba(0,0,0,0.55)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>✅ Marcar como Cobrada</h3>
              <button onClick={() => setOvACobrar(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '14px 16px', marginBottom: 20, border: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Orden</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ovACobrar.nro}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Cliente</span>
                <span style={{ fontWeight: 600 }}>{ovACobrar.cliente_nombre}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', fontSize: 16 }}>{fmtPeso(ovACobrar.total)}</span>
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>
              La orden pasará a estado <strong>cobrada</strong> y se quitará de la lista de pendientes.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setOvACobrar(null)} disabled={cobrandoOV}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarCobrarOV} disabled={cobrandoOV}
                style={{ background: '#00b37e', borderColor: '#00b37e' }}>
                {cobrandoOV ? 'Procesando…' : `✅ Confirmar ${fmtPeso(ovACobrar.total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ COBRAR FACTURA MODAL ══════════════════════════════════ */}
      {facACobrar && (
        <div style={OVERLAY} onClick={() => setFacACobrar(null)}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 8px 56px rgba(0,0,0,0.55)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>💵 Registrar Cobro</h3>
              <button onClick={() => setFacACobrar(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Factura</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{facACobrar.nro}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>Cliente</span>
                <span style={{ fontWeight: 600 }}>{facACobrar.cliente_nombre}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', fontSize: 16 }}>{fmtPeso(facACobrar.total)}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <FF label="Método de cobro">
                <select className="form-control" value={cobrarForm.metodo} onChange={e => setCobrarForm(f => ({ ...f, metodo: e.target.value }))}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                  <option value="contado">Contado</option>
                  <option value="mixto">Mixto</option>
                </select>
              </FF>
              <FF label="Referencia / N° cheque / transacción">
                <input className="form-control" value={cobrarForm.referencia} onChange={e => setCobrarForm(f => ({ ...f, referencia: e.target.value }))} placeholder="Opcional" />
              </FF>
              <FF label="Fecha de cobro">
                <input className="form-control" type="date" value={cobrarForm.fecha} onChange={e => setCobrarForm(f => ({ ...f, fecha: e.target.value }))} />
              </FF>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setFacACobrar(null)} disabled={cobrando}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarCobrar} disabled={cobrando} style={{ background: '#00b37e', borderColor: '#00b37e' }}>
                {cobrando ? 'Procesando…' : `✅ Confirmar Cobro ${fmtPeso(facACobrar.total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ IMPORT OVs MODAL ══════════════════════════════════════ */}
      {showImportOV && (
        <div style={OVERLAY} onClick={() => { if (!importLoadingOV && !importandoOV) setShowImportOV(false) }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 56px rgba(0,0,0,0.55)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>📦 Importar Órdenes de Venta</h3>
              <button onClick={() => setShowImportOV(false)} disabled={importLoadingOV || importandoOV} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {!importResultOV && !importLoadingOV && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>📦</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.8, fontSize: 14 }}>
                  Aceptamos el Excel de tu sistema (ej: <strong>OrdenesVentaDet</strong>).<br/>
                  Detectamos automáticamente la columna <strong>Comprador</strong> / <strong>Cliente</strong> / <strong>Razón Social</strong>.<br/>
                  Si el archivo tiene detalle por ítem, se agrupa por número de orden.
                </p>
                <label style={{ display: 'inline-block', marginTop: 12, padding: '12px 32px', background: 'var(--primary)', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                  📂 Seleccionar archivo .xlsx
                  <input ref={fileOVRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFileOVChosen} />
                </label>
              </div>
            )}

            {importLoadingOV && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                <div>Procesando…</div>
              </div>
            )}

            {importResultOV && !importLoadingOV && (
              <>
                {importResultOV.agrupado_por && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,179,126,0.08)', border: '1px solid rgba(0,179,126,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    Filas agrupadas por <strong>&quot;{importResultOV.agrupado_por}&quot;</strong> — cada orden = una OV.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Órdenes detectadas', value: importResultOV.total, color: undefined },
                    { label: 'Válidas', value: importResultOV.validas, color: '#00b37e' },
                    { label: 'Con errores', value: importResultOV.invalidas, color: importResultOV.invalidas > 0 ? '#ef4444' : undefined },
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
                        {['#','OK','Cliente','Total','Fecha','Obs','Errores'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importResultOV.filas.map(f => (
                        <tr key={f.fila} style={{ borderBottom: '1px solid var(--border)', background: f.valido ? undefined : 'rgba(239,68,68,0.05)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)', width: 40 }}>{f.fila}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', width: 40 }}>{f.valido ? '✅' : '❌'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{f.cliente_nombre || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{fmtPeso(f.total)}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>{f.fecha}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.obs || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#ef4444', fontSize: 12 }}>
                            {f.errores.length > 0 ? f.errores.join(' · ') : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => { setImportResultOV(null); setPendingFileOV(null) }}>← Cargar otro</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setShowImportOV(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={confirmarImportOV} disabled={importResultOV.validas === 0 || importandoOV}>
                      {importandoOV ? 'Importando…' : `✅ Importar ${importResultOV.validas} orden${importResultOV.validas !== 1 ? 'es' : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ IMPORT FACTURAS MODAL ═════════════════════════════════ */}
      {showImportFac && (
        <div style={OVERLAY} onClick={() => { if (!importLoadingFac && !importandoFac) setShowImportFac(false) }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 56px rgba(0,0,0,0.55)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>Importar Facturas desde Excel</h3>
              <button onClick={() => setShowImportFac(false)} disabled={importLoadingFac || importandoFac} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            {!importResultFac && !importLoadingFac && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🧾</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.7 }}>
                  Campos requeridos: <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>Cliente</code> y <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>Total</code>.<br/>
                  Descargá la{' '}<button onClick={() => window.open('/api/facturas/template', '_blank')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>plantilla</button>.
                </p>
                <label style={{ display: 'inline-block', marginTop: 12, padding: '12px 32px', background: 'var(--primary)', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                  📂 Seleccionar archivo .xlsx
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFileFacChosen} />
                </label>
              </div>
            )}
            {importLoadingFac && <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}><div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div><div>Procesando…</div></div>}
            {importResultFac && !importLoadingFac && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Total', value: (importResultFac as { total: number }).total, color: undefined },
                    { label: 'Válidas', value: (importResultFac as { validas: number }).validas, color: '#00b37e' },
                    { label: 'Con errores', value: (importResultFac as { invalidas: number }).invalidas, color: (importResultFac as { invalidas: number }).invalidas > 0 ? '#ef4444' : undefined },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 10 }}>
                  <button className="btn btn-secondary" onClick={() => { setImportResultFac(null); setPendingFileFac(null) }}>← Cargar otro</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setShowImportFac(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={confirmarImportFac} disabled={(importResultFac as { validas: number }).validas === 0 || importandoFac}>
                      {importandoFac ? 'Importando…' : `✅ Importar ${(importResultFac as { validas: number }).validas} factura${(importResultFac as { validas: number }).validas !== 1 ? 's' : ''}`}
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

const STAT_CARD: React.CSSProperties = { background: 'var(--bg-secondary)', borderRadius: 10, padding: '18px 20px', border: '1px solid var(--border)' }
const STAT_LABEL: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }
const STAT_VAL: React.CSSProperties  = { fontSize: 26, fontWeight: 800, lineHeight: 1 }
const STAT_SUB: React.CSSProperties  = { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }
const OVERLAY: React.CSSProperties  = { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }

function DRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
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
