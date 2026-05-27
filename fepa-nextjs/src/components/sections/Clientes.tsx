'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { Cliente, FilaImportCliente, CondIva, MetodoPago } from '@/lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtPeso = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const COND_IVA: CondIva[] = ['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final']
const METODOS_PAGO: { value: MetodoPago; label: string }[] = [
  { value: 'contado',       label: 'Contado'        },
  { value: 'transferencia', label: 'Transferencia'   },
  { value: 'cheque_30',     label: 'Cheque 30 días'  },
  { value: 'cheque_60',     label: 'Cheque 60 días'  },
  { value: 'cheque_90',     label: 'Cheque 90 días'  },
  { value: 'cheque_120',    label: 'Cheque 120 días' },
  { value: 'mixto',         label: 'Mixto'           },
]
const PROVINCIAS = [
  'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
  'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
  'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz',
  'Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán',
]

type Toast = { id: number; msg: string; ok: boolean }

const EMPTY: Omit<Cliente, 'id' | 'created_at' | 'updated_at'> = {
  razon_social: '', tipo_doc: 'CUIT', cuit: '', email: '', telefono: '',
  whatsapp: '', direccion: '', ciudad: '', provincia: 'Buenos Aires',
  codigo_postal: '', zona: '', cond_iva: 'Responsable Inscripto',
  metodo_pago: 'contado', vendedor: '', limite_credito: 0, saldo_deudor: 0,
  activo: true, notas: '', cuit_verificado: false,
}

// ── Main component ────────────────────────────────────────────────────────────
export function Clientes() {
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [loading, setLoading]     = useState(true)
  const [toasts, setToasts]       = useState<Toast[]>([])

  // filters
  const [q, setQ]                 = useState('')
  const [zonaF, setZonaF]         = useState('')
  const [vendedorF, setVendedorF] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)

  // CRUD modal
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<Cliente | null>(null)
  const [form, setForm]           = useState({ ...EMPTY })
  const [saving, setSaving]       = useState(false)
  const [modalTab, setModalTab]   = useState<'basico' | 'comercial' | 'ubicacion'>('basico')

  // Import modal
  const [showImport, setShowImport]       = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult]   = useState<{
    total: number; validas: number; invalidas: number; filas: FilaImportCliente[]
  } | null>(null)
  const [importando, setImportando]       = useState(false)
  const [pendingFile, setPendingFile]     = useState<File | null>(null)
  const fileInputRef                      = useRef<HTMLInputElement>(null)

  // detail side-panel
  const [detalle, setDetalle] = useState<Cliente | null>(null)

  // ── toaster ──
  const addToast = useCallback((msg: string, ok = true) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, ok }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  // ── load clientes ──
  const loadClientes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q)           params.set('q', q)
      if (zonaF)       params.set('zona', zonaF)
      if (vendedorF)   params.set('vendedor', vendedorF)
      if (soloActivos) params.set('activo', 'true')

      const res  = await fetch(`/api/clientes?${params}`)
      if (!res.ok) throw new Error('Error cargando clientes')
      const data = await res.json()
      setClientes(data)
    } catch {
      addToast('Error cargando clientes', false)
    } finally {
      setLoading(false)
    }
  }, [q, zonaF, vendedorF, soloActivos, addToast])

  useEffect(() => { loadClientes() }, [loadClientes])

  // ── derived filter lists ──
  const zonas      = Array.from(new Set(clientes.map(c => c.zona).filter(Boolean))).sort()
  const vendedores = Array.from(new Set(clientes.map(c => c.vendedor).filter(Boolean))).sort()

  // ── credit limit check ──
  const tieneAlerta = (c: Cliente) => c.limite_credito > 0 && c.saldo_deudor >= c.limite_credito
  const alertas     = clientes.filter(tieneAlerta)

  // ── open create / edit ──
  const abrirNuevo = () => {
    setEditando(null)
    setForm({ ...EMPTY })
    setModalTab('basico')
    setShowModal(true)
  }

  const abrirEditar = (c: Cliente) => {
    setEditando(c)
    setForm({
      razon_social: c.razon_social, tipo_doc: c.tipo_doc, cuit: c.cuit,
      email: c.email, telefono: c.telefono, whatsapp: c.whatsapp,
      direccion: c.direccion, ciudad: c.ciudad, provincia: c.provincia,
      codigo_postal: c.codigo_postal, zona: c.zona, cond_iva: c.cond_iva,
      metodo_pago: c.metodo_pago, vendedor: c.vendedor,
      limite_credito: c.limite_credito, saldo_deudor: c.saldo_deudor,
      activo: c.activo, notas: c.notas, cuit_verificado: c.cuit_verificado,
    })
    setModalTab('basico')
    setShowModal(true)
    setDetalle(null)
  }

  // ── save ──
  const guardar = async () => {
    if (!form.razon_social.trim()) { addToast('La razón social es obligatoria', false); return }
    setSaving(true)
    try {
      const url    = editando ? `/api/clientes/${editando.id}` : '/api/clientes'
      const method = editando ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Error guardando')
      }
      addToast(editando ? '✅ Cliente actualizado' : '✅ Cliente creado')
      setShowModal(false)
      loadClientes()
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : 'Error guardando', false)
    } finally {
      setSaving(false)
    }
  }

  // ── soft-delete ──
  const desactivar = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar a "${nombre}"? El cliente no se borrará, quedará inactivo.`)) return
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error')
      addToast(`${nombre} desactivado`)
      loadClientes()
    } catch {
      addToast('Error al desactivar', false)
    }
  }

  // ── import file chosen → preview ──
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setImportLoading(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('modo', 'preview')
      const res = await fetch('/api/clientes/import', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      setImportResult(await res.json())
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : 'Error procesando archivo', false)
    } finally {
      setImportLoading(false)
      e.target.value = ''
    }
  }

  // ── confirm import ──
  const confirmarImport = async () => {
    if (!importResult || importResult.validas === 0 || !pendingFile) return
    setImportando(true)
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      fd.append('modo', 'import')
      const res = await fetch('/api/clientes/import', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const r = await res.json()
      addToast(`✅ ${r.importados} clientes importados${r.invalidas > 0 ? ` (${r.invalidas} omitidas)` : ''}`)
      setShowImport(false)
      setImportResult(null)
      setPendingFile(null)
      loadClientes()
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : 'Error importando', false)
    } finally {
      setImportando(false)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="section-content">

      {/* ── TOASTS ── */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.ok ? '#00b37e' : '#ef4444',
            color: '#fff', padding: '10px 18px', borderRadius: 8,
            fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Clientes</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''}
            {alertas.length > 0 && (
              <span style={{ marginLeft: 10, color: '#ef4444', fontWeight: 600 }}>
                · 🔴 {alertas.length} con límite de crédito alcanzado
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => window.open('/api/clientes/template', '_blank')}
          >
            📋 Plantilla
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => window.open('/api/clientes/export', '_blank')}
          >
            ⬇ Exportar
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setImportResult(null); setPendingFile(null); setShowImport(true) }}
          >
            ⬆ Importar Excel
          </button>
          <button className="btn btn-primary" onClick={abrirNuevo}>
            + Nuevo Cliente
          </button>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-control"
          placeholder="🔍 Buscar nombre o CUIT…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ minWidth: 240, flex: 1 }}
        />
        <select
          className="form-control"
          value={zonaF}
          onChange={e => setZonaF(e.target.value)}
          style={{ minWidth: 150 }}
        >
          <option value="">Todas las zonas</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select
          className="form-control"
          value={vendedorF}
          onChange={e => setVendedorF(e.target.value)}
          style={{ minWidth: 150 }}
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={e => setSoloActivos(e.target.checked)}
          />
          Solo activos
        </label>
      </div>

      {/* ── TABLE ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>
      ) : clientes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>No hay clientes todavía</div>
          <div style={{ fontSize: 14 }}>Importá desde Excel o creá uno manualmente</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                <th style={TH}>Razón Social</th>
                <th style={TH}>CUIT</th>
                <th style={TH}>Zona</th>
                <th style={TH}>Cond. IVA</th>
                <th style={TH}>Método Pago</th>
                <th style={{ ...TH, textAlign: 'right' }}>Límite</th>
                <th style={{ ...TH, textAlign: 'right' }}>Saldo</th>
                <th style={{ ...TH, textAlign: 'center' }}>Contacto</th>
                <th style={{ ...TH, textAlign: 'center' }}>Estado</th>
                <th style={{ ...TH, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => {
                const alerta = tieneAlerta(c)
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: alerta ? 'rgba(239,68,68,0.04)' : undefined,
                      transition: 'background .15s',
                    }}
                    onClick={() => setDetalle(c)}
                    onMouseEnter={e => { if (!alerta) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = alerta ? 'rgba(239,68,68,0.04)' : '' }}
                  >
                    <td style={TD}>
                      <div style={{ fontWeight: 600 }}>
                        {alerta && <span title="Límite de crédito alcanzado" style={{ marginRight: 5 }}>🔴</span>}
                        {c.razon_social}
                      </div>
                      {c.vendedor && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>👤 {c.vendedor}</div>
                      )}
                    </td>
                    <td style={TD}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.cuit || '—'}</span>
                      {c.cuit_verificado && <span title="CUIT verificado en AFIP" style={{ marginLeft: 4 }}>✅</span>}
                    </td>
                    <td style={TD}>{c.zona || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={TD}>
                      <span style={{ ...BADGE, background: condIvaColor(c.cond_iva) }}>
                        {condIvaShort(c.cond_iva)}
                      </span>
                    </td>
                    <td style={TD}>
                      <span style={{ ...BADGE, background: '#1e293b', border: '1px solid var(--border)' }}>
                        {METODOS_PAGO.find(m => m.value === c.metodo_pago)?.label ?? c.metodo_pago}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>
                      {c.limite_credito > 0
                        ? fmtPeso(c.limite_credito)
                        : <span style={{ color: 'var(--text-muted)' }}>∞</span>
                      }
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: c.saldo_deudor > 0 ? '#ef4444' : undefined, fontWeight: c.saldo_deudor > 0 ? 600 : undefined }}>
                      {c.saldo_deudor > 0 ? fmtPeso(c.saldo_deudor) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {c.whatsapp && (
                        <a
                          href={`https://wa.me/54${c.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          style={{ marginRight: 6, textDecoration: 'none', fontSize: 16 }}
                        >
                          📱
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} title={c.email} style={{ textDecoration: 'none', fontSize: 16 }}>✉️</a>
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{
                        ...BADGE,
                        background: c.activo ? 'rgba(0,179,126,0.15)' : 'rgba(239,68,68,0.15)',
                        color: c.activo ? '#00b37e' : '#ef4444',
                        border: `1px solid ${c.activo ? 'rgba(0,179,126,0.4)' : 'rgba(239,68,68,0.4)'}`,
                      }}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }}
                        onClick={() => abrirEditar(c)}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                        onClick={() => desactivar(c.id, c.razon_social)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CREDIT ALERT FOOTER ── */}
      {alertas.length > 0 && (
        <div style={{
          marginTop: 16, padding: '12px 18px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 14,
        }}>
          🔴 <strong>{alertas.length} cliente{alertas.length > 1 ? 's' : ''}</strong> {alertas.length > 1 ? 'han' : 'ha'} alcanzado su límite de crédito.{' '}
          {alertas.map(c => c.razon_social).join(' · ')}
        </div>
      )}

      {/* ═══════════════ DETALLE SIDE PANEL ════════════════════════════════════ */}
      {detalle && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setDetalle(null)}
        >
          <div
            style={{
              width: 420, background: 'var(--bg-secondary)', height: '100%', overflowY: 'auto',
              padding: 28, boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{detalle.razon_social}</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, fontFamily: 'monospace' }}>
                  {detalle.cuit || 'Sin CUIT'} {detalle.cuit_verificado && '✅'}
                </div>
              </div>
              <button
                onClick={() => setDetalle(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
              >✕</button>
            </div>

            <DRow label="Condición IVA" value={detalle.cond_iva} />
            <DRow label="Método de Pago" value={METODOS_PAGO.find(m => m.value === detalle.metodo_pago)?.label ?? detalle.metodo_pago} />
            <DRow label="Zona" value={detalle.zona || '—'} />
            <DRow label="Vendedor" value={detalle.vendedor || '—'} />

            {/* Credit section */}
            <div style={{
              margin: '16px 0',
              padding: '14px 16px',
              background: 'var(--bg-primary)',
              borderRadius: 8,
              border: tieneAlerta(detalle) ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saldo Deudor</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', color: detalle.saldo_deudor > 0 ? '#ef4444' : undefined }}>
                  {fmtPeso(detalle.saldo_deudor)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Límite Crédito</span>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                  {detalle.limite_credito > 0 ? fmtPeso(detalle.limite_credito) : '∞ Sin límite'}
                </span>
              </div>
              {detalle.limite_credito > 0 && (
                <>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round((detalle.saldo_deudor / detalle.limite_credito) * 100))}%`,
                      background: tieneAlerta(detalle) ? '#ef4444' : detalle.saldo_deudor / detalle.limite_credito > 0.8 ? '#f59e0b' : '#00b37e',
                      transition: 'width .3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                    {Math.min(100, Math.round((detalle.saldo_deudor / detalle.limite_credito) * 100))}% utilizado
                  </div>
                  {tieneAlerta(detalle) && (
                    <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 700 }}>
                      ⚠️ Límite de crédito alcanzado — no aprobar nuevas OV
                    </div>
                  )}
                </>
              )}
            </div>

            <DRow label="Email" value={detalle.email || '—'} />
            <DRow label="Teléfono" value={detalle.telefono || '—'} />
            <DRow label="WhatsApp" value={detalle.whatsapp || '—'} />
            <DRow
              label="Dirección"
              value={[detalle.direccion, detalle.ciudad, detalle.provincia, detalle.codigo_postal].filter(Boolean).join(', ') || '—'}
            />
            {detalle.notas && <DRow label="Notas" value={detalle.notas} />}
            <DRow label="Estado" value={detalle.activo ? 'Activo' : 'Inactivo'} />

            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => abrirEditar(detalle)}>
                ✏️ Editar
              </button>
              {detalle.whatsapp && (
                <a
                  href={`https://wa.me/54${detalle.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                >
                  📱 WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ CRUD MODAL ════════════════════════════════════════════ */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)', borderRadius: 12, padding: 28,
              width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 8px 56px rgba(0,0,0,0.55)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                {editando ? `Editar: ${editando.razon_social}` : 'Nuevo Cliente'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
              {(['basico', 'comercial', 'ubicacion'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setModalTab(tab)}
                  style={{
                    background: 'none', border: 'none', padding: '8px 18px',
                    cursor: 'pointer', fontWeight: modalTab === tab ? 700 : 400,
                    color: modalTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottom: modalTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                    marginBottom: -1, fontSize: 14,
                  }}
                >
                  {tab === 'basico' ? '👤 Datos' : tab === 'comercial' ? '💼 Comercial' : '📍 Ubicación'}
                </button>
              ))}
            </div>

            {/* ── Tab Datos básicos ── */}
            {modalTab === 'basico' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <FF label="Razón Social *">
                  <input
                    className="form-control"
                    value={form.razon_social}
                    onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))}
                    placeholder="Distribuidora Ejemplo SRL"
                    autoFocus
                  />
                </FF>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                  <FF label="Tipo Doc.">
                    <select className="form-control" value={form.tipo_doc} onChange={e => setForm(f => ({ ...f, tipo_doc: e.target.value }))}>
                      <option>CUIT</option>
                      <option>DNI</option>
                      <option>Otro</option>
                    </select>
                  </FF>
                  <FF label="Número">
                    <input
                      className="form-control"
                      value={form.cuit}
                      onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))}
                      placeholder="20-12345678-9"
                    />
                  </FF>
                </div>
                <FF label="Email">
                  <input
                    className="form-control"
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="ventas@cliente.com"
                  />
                </FF>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <FF label="Teléfono">
                    <input
                      className="form-control"
                      value={form.telefono}
                      onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                      placeholder="11-4567-8900"
                    />
                  </FF>
                  <FF label="WhatsApp">
                    <input
                      className="form-control"
                      value={form.whatsapp}
                      onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="1145678900"
                    />
                  </FF>
                </div>
                <FF label="Notas internas">
                  <textarea
                    className="form-control"
                    rows={3}
                    value={form.notas}
                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Observaciones, acuerdos especiales, etc."
                  />
                </FF>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  />
                  Cliente activo
                </label>
              </div>
            )}

            {/* ── Tab Comercial ── */}
            {modalTab === 'comercial' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <FF label="Condición IVA">
                  <select
                    className="form-control"
                    value={form.cond_iva}
                    onChange={e => setForm(f => ({ ...f, cond_iva: e.target.value as CondIva }))}
                  >
                    {COND_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FF>
                <FF label="Método de Pago habitual">
                  <select
                    className="form-control"
                    value={form.metodo_pago}
                    onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value as MetodoPago }))}
                  >
                    {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </FF>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <FF label="Límite de Crédito ($)">
                    <input
                      className="form-control"
                      type="number"
                      min={0}
                      step={1000}
                      value={form.limite_credito}
                      onChange={e => setForm(f => ({ ...f, limite_credito: Number(e.target.value) }))}
                      placeholder="0 = sin límite"
                    />
                  </FF>
                  <FF label="Zona">
                    <input
                      className="form-control"
                      value={form.zona}
                      onChange={e => setForm(f => ({ ...f, zona: e.target.value }))}
                      placeholder="GBA Norte, Interior…"
                      list="zonas-list"
                    />
                    <datalist id="zonas-list">
                      {zonas.map(z => <option key={z} value={z} />)}
                    </datalist>
                  </FF>
                </div>
                <FF label="Vendedor asignado">
                  <input
                    className="form-control"
                    value={form.vendedor}
                    onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))}
                    placeholder="Nombre del vendedor"
                    list="vendedores-list"
                  />
                  <datalist id="vendedores-list">
                    {vendedores.map(v => <option key={v} value={v} />)}
                  </datalist>
                </FF>

                {form.limite_credito > 0 && form.saldo_deudor >= form.limite_credito && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', fontSize: 13, fontWeight: 600,
                  }}>
                    ⚠️ Límite alcanzado: {fmtPeso(form.saldo_deudor)} / {fmtPeso(form.limite_credito)}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab Ubicación ── */}
            {modalTab === 'ubicacion' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <FF label="Dirección">
                  <input
                    className="form-control"
                    value={form.direccion}
                    onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                    placeholder="Av. San Martín 1234"
                  />
                </FF>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                  <FF label="Ciudad">
                    <input
                      className="form-control"
                      value={form.ciudad}
                      onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))}
                      placeholder="Buenos Aires"
                    />
                  </FF>
                  <FF label="CP">
                    <input
                      className="form-control"
                      value={form.codigo_postal}
                      onChange={e => setForm(f => ({ ...f, codigo_postal: e.target.value }))}
                      placeholder="1414"
                    />
                  </FF>
                </div>
                <FF label="Provincia">
                  <select
                    className="form-control"
                    value={form.provincia}
                    onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))}
                  >
                    <option value="">— Seleccionar —</option>
                    {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </FF>
              </div>
            )}

            {/* ── Modal actions ── */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)',
            }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>
                {saving ? 'Guardando…' : editando ? '💾 Actualizar' : '✅ Crear Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ IMPORT MODAL ══════════════════════════════════════════ */}
      {showImport && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { if (!importLoading && !importando) setShowImport(false) }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)', borderRadius: 12, padding: 28,
              width: '100%', maxWidth: 900, maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 8px 56px rgba(0,0,0,0.55)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Importar Clientes desde Excel</h3>
              <button
                onClick={() => setShowImport(false)}
                disabled={importLoading || importando}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}
              >✕</button>
            </div>

            {/* Empty state */}
            {!importResult && !importLoading && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>📊</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
                  El archivo debe tener la columna <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>Razon Social</code> (obligatoria).
                  <br />
                  Descargá la{' '}
                  <button
                    onClick={() => window.open('/api/clientes/template', '_blank')}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', fontSize: 14 }}
                  >
                    plantilla de ejemplo
                  </button>{' '}
                  para ver el formato esperado.
                </p>
                <label style={{
                  display: 'inline-block', marginTop: 12,
                  padding: '12px 32px', background: 'var(--primary)', color: 'white',
                  borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15,
                }}>
                  📂 Seleccionar archivo .xlsx
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={onFileChosen}
                  />
                </label>
              </div>
            )}

            {/* Loading */}
            {importLoading && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                <div>Procesando archivo…</div>
              </div>
            )}

            {/* Preview results */}
            {importResult && !importLoading && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Total filas', value: importResult.total, color: undefined },
                    { label: 'Válidas', value: importResult.validas, color: '#00b37e' },
                    { label: 'Con errores', value: importResult.invalidas, color: importResult.invalidas > 0 ? '#ef4444' : undefined },
                  ].map(s => (
                    <div key={s.label} style={{
                      flex: 1, minWidth: 120, padding: '12px 16px', background: 'var(--bg-primary)',
                      borderRadius: 8, textAlign: 'center', border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        {['Fila','OK','Razón Social','CUIT','Ciudad','Cond. IVA','Mét. Pago','Errores'].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.filas.map(f => (
                        <tr key={f.fila} style={{
                          borderBottom: '1px solid var(--border)',
                          background: f.valido ? undefined : 'rgba(239,68,68,0.05)',
                        }}>
                          <td style={{ ...TD, color: 'var(--text-muted)', width: 40 }}>{f.fila}</td>
                          <td style={{ ...TD, textAlign: 'center', width: 40, fontSize: 16 }}>
                            {f.valido ? '✅' : '❌'}
                          </td>
                          <td style={{ ...TD, fontWeight: 600 }}>{f.razon_social}</td>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{f.cuit || '—'}</td>
                          <td style={TD}>{f.ciudad || '—'}</td>
                          <td style={TD}>{f.cond_iva}</td>
                          <td style={TD}>{f.metodo_pago}</td>
                          <td style={{ ...TD, color: '#ef4444', fontSize: 12, maxWidth: 260 }}>
                            {f.errores.length > 0 ? f.errores.join(' · ') : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, flexWrap: 'wrap', gap: 10 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => { setImportResult(null); setPendingFile(null) }}
                  >
                    ← Cargar otro archivo
                  </button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancelar</button>
                    <button
                      className="btn btn-primary"
                      onClick={confirmarImport}
                      disabled={importResult.validas === 0 || importando}
                    >
                      {importando
                        ? 'Importando…'
                        : `✅ Importar ${importResult.validas} cliente${importResult.validas !== 1 ? 's' : ''}`
                      }
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

// ── style constants ──────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: '10px 14px', fontWeight: 600, fontSize: 12,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.03em',
}
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
const BADGE: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#fff',
}

function condIvaColor(c: CondIva): string {
  switch (c) {
    case 'Responsable Inscripto': return '#1d4ed8'
    case 'Monotributista':        return '#7c3aed'
    case 'Exento':                return '#059669'
    case 'Consumidor Final':      return '#374151'
  }
}
function condIvaShort(c: CondIva): string {
  switch (c) {
    case 'Responsable Inscripto': return 'R.I.'
    case 'Monotributista':        return 'Mono'
    case 'Exento':                return 'Exento'
    case 'Consumidor Final':      return 'C.F.'
  }
}

function DRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14,
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
