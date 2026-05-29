'use client'
import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import type { Cliente, Factura } from '@/lib/types'
import { Toast } from './ui/Toast'
import { Sidebar } from './Sidebar'
import { Dashboard } from './sections/Dashboard'
import { Cobranzas } from './sections/Cobranzas'
import { FlujoEfectivo } from './sections/FlujoEfectivo'
import { Alertas } from './sections/Alertas'
import { Clientes } from './sections/Clientes'
import { Pipeline } from './sections/Pipeline'
import { AsistenteIA } from './sections/AsistenteIA'
import { Ordenes } from './sections/Ordenes'
import { Facturas } from './sections/Facturas'
import { NotasCredito } from './sections/NotasCredito'
import { Deudores } from './sections/Deudores'
import { Presupuestos } from './sections/Presupuestos'
import { Proveedores } from './sections/Proveedores'
import { Compras } from './sections/Compras'
import { Remitos } from './sections/Remitos'
import { CuentaCorriente } from './sections/CuentaCorriente'
import { ContabiliumConfig } from './sections/ContabiliumConfig'

// ── App Context ──────────────────────────────────────────────────────────────
interface AppCtx {
  clientes: Cliente[]
  facturas: Factura[]
  loading:  boolean
  reload:   () => Promise<void>
  updateCliente: (id: number, data: Partial<Cliente>) => Promise<void>
  deleteCliente: (id: number) => Promise<void>
  createCliente: (data: Partial<Cliente>) => Promise<void>
  updateFactura: (id: number, data: Partial<Factura>) => Promise<void>
  deleteFactura: (id: number) => Promise<void>
  createFactura: (data: Partial<Factura>) => Promise<Factura>
}

export const AppContext = createContext<AppCtx>({} as AppCtx)
export const useApp = () => useContext(AppContext)

const SECTIONS: Record<string, string> = {
  dashboard:   'Dashboard',
  cobranzas:   'Semáforo de Cobranzas',
  flujo:       'Flujo de Caja',
  alertas:     'Alertas de Seguimiento',
  clientes:    'Clientes',
  pipeline:    'Pipeline de Ventas',
  ia:          'Asistente IA',
  ordenes:     'Órdenes de Venta',
  facturas:    'Facturas',
  nc:          'Notas de Crédito',
  deudores:    'Registro de Deudores',
  presupuestos:'Presupuestos',
  proveedores: 'Proveedores',
  compras:     'Compras / Gastos',
  remitos:     'Remitos',
  cc:          'Cuenta Corriente',
  contabilium: 'Integración Contabilium',
}

export default function App() {
  const [section, setSection] = useState('dashboard')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading]   = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [rc, rf] = await Promise.all([
        fetch('/api/clientes').then(r => r.json()),
        fetch('/api/facturas').then(r => r.json()),
      ])
      if (Array.isArray(rc)) setClientes(rc)
      if (Array.isArray(rf)) setFacturas(rf)
    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // ── CRUD clientes ──
  const updateCliente = async (id: number, data: Partial<Cliente>) => {
    await fetch(`/api/clientes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ...data } : c))
  }

  const deleteCliente = async (id: number) => {
    await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
    setClientes(prev => prev.filter(c => c.id !== id))
    setFacturas(prev => prev.map(f => f.cliente_id === id ? { ...f, cliente_id: null } : f))
  }

  const createCliente = async (data: Partial<Cliente>) => {
    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    const nuevo = await res.json()
    setClientes(prev => [...prev, nuevo])
  }

  // ── CRUD facturas ──
  const updateFactura = async (id: number, data: Partial<Factura>) => {
    await fetch(`/api/facturas/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setFacturas(prev => prev.map(f => f.id === id ? { ...f, ...data } : f))
    if (data.estado === 'cobrada') {
      const f = facturas.find(x => x.id === id)
      if (f?.cliente_id) {
        setClientes(prev => prev.map(c =>
          c.id === f.cliente_id
            ? { ...c, saldo_deudor: Math.max(0, c.saldo_deudor - f.total) }
            : c
        ))
      }
    }
  }

  const deleteFactura = async (id: number) => {
    const f = facturas.find(x => x.id === id)
    await fetch(`/api/facturas/${id}`, { method: 'DELETE' })
    setFacturas(prev => prev.filter(x => x.id !== id))
    if (f && f.estado !== 'cobrada' && f.cliente_id) {
      setClientes(prev => prev.map(c =>
        c.id === f.cliente_id
          ? { ...c, saldo_deudor: Math.max(0, c.saldo_deudor - f.total) }
          : c
      ))
    }
  }

  const createFactura = async (data: Partial<Factura>): Promise<Factura> => {
    const res = await fetch('/api/facturas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    const nueva = await res.json()
    setFacturas(prev => [...prev, nueva])
    if (nueva.cliente_id && nueva.total) {
      setClientes(prev => prev.map(c =>
        c.id === nueva.cliente_id ? { ...c, saldo_deudor: c.saldo_deudor + nueva.total } : c
      ))
    }
    return nueva
  }

  const ctx: AppCtx = {
    clientes, facturas, loading, reload,
    updateCliente, deleteCliente, createCliente,
    updateFactura, deleteFactura, createFactura,
  }

  const renderSection = () => {
    switch (section) {
      case 'dashboard':    return <Dashboard />
      case 'cobranzas':   return <Cobranzas />
      case 'flujo':       return <FlujoEfectivo />
      case 'alertas':     return <Alertas />
      case 'clientes':    return <Clientes />
      case 'pipeline':    return <Pipeline />
      case 'ia':          return <AsistenteIA />
      case 'ordenes':     return <Ordenes />
      case 'facturas':    return <Facturas />
      case 'nc':          return <NotasCredito />
      case 'deudores':    return <Deudores />
      case 'presupuestos':return <Presupuestos />
      case 'proveedores': return <Proveedores />
      case 'compras':     return <Compras />
      case 'remitos':     return <Remitos />
      case 'cc':          return <CuentaCorriente />
      case 'contabilium': return <ContabiliumConfig />
      default:            return <Dashboard />
    }
  }

  return (
    <AppContext.Provider value={ctx}>
      <Sidebar activeSection={section} onNav={setSection} />
      <div className="main">
        <div className="topbar">
          <div className="page-title">{SECTIONS[section] || 'Dashboard'}</div>
          <div className="topbar-actions">
            <SyncButton onSync={reload} />
          </div>
        </div>
        <div className="content">
          {loading
            ? <div className="loading-overlay"><div className="spinner" /><span>Cargando datos...</span></div>
            : renderSection()
          }
        </div>
      </div>
      <Toast />
    </AppContext.Provider>
  )
}

function SyncButton({ onSync }: { onSync: () => Promise<void> }) {
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try { await onSync() }
    finally { setSyncing(false) }
  }

  return (
    <button
      className={`sync-btn ${syncing ? 'syncing' : ''}`}
      onClick={handleSync}
      disabled={syncing}
    >
      {syncing ? '↻ Actualizando...' : '↻ Actualizar'}
    </button>
  )
}
