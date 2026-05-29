'use client'
import { useApp } from './App'

const NAV = [
  { key: 'dashboard',    icon: '◈', label: 'Dashboard',          section: 'PRINCIPAL' },
  { key: 'cobranzas',    icon: '◎', label: 'Semáforo',           section: 'COBRANZAS' },
  { key: 'flujo',        icon: '◐', label: 'Flujo de Caja',      section: null },
  { key: 'alertas',      icon: '◉', label: 'Alertas',            section: null },
  { key: 'clientes',     icon: '◉', label: 'Clientes',           section: 'CRM' },
  { key: 'pipeline',     icon: '◐', label: 'Pipeline',           section: null },
  { key: 'cc',           icon: '◑', label: 'Cuenta Corriente',   section: null },
  { key: 'ia',           icon: '◈', label: 'Asistente IA',       section: 'IA' },
  { key: 'presupuestos', icon: '◧', label: 'Presupuestos',       section: 'VENTAS' },
  { key: 'ordenes',      icon: '◧', label: 'Órdenes de Venta',   section: null },
  { key: 'remitos',      icon: '◨', label: 'Remitos',            section: null },
  { key: 'facturas',     icon: '◫', label: 'Facturas',           section: null },
  { key: 'nc',           icon: '↑',  label: 'Notas de Crédito',  section: null },
  { key: 'deudores',     icon: '◑', label: 'Deudores',           section: 'GESTIÓN' },
  { key: 'proveedores',  icon: '◉', label: 'Proveedores',        section: 'COMPRAS' },
  { key: 'compras',      icon: '◧', label: 'Compras / Gastos',   section: null },
  { key: 'contabilium',  icon: '⟳', label: 'Contabilium Sync',  section: 'CONFIG' },
]

interface Props {
  activeSection: string
  onNav: (section: string) => void
}

export function Sidebar({ activeSection, onNav }: Props) {
  const { facturas, clientes } = useApp()

  const pendientes = facturas.filter(f => f.estado === 'pendiente').length
  const conDeuda   = clientes.filter(c => (c.saldo_deudor || 0) > 0).length
  const enAlerta   = clientes.filter(c => c.limite_credito > 0 && c.saldo_deudor >= c.limite_credito * 0.8).length

  let lastSection = ''

  return (
    <div className="sidebar">
      <div className="logo-wrap">
        <div className="logo">FE<span>PA</span></div>
        <div className="logo-tag">ERP Mayorista</div>
      </div>

      <nav className="nav">
        {NAV.map(item => {
          const showSection = item.section && item.section !== lastSection
          if (item.section) lastSection = item.section

          return (
            <div key={item.key}>
              {showSection && (
                <div className="nav-section">{item.section}</div>
              )}
              <div
                className={`nav-item ${activeSection === item.key ? 'active' : ''}`}
                onClick={() => onNav(item.key)}
              >
                <span className="nav-dot" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'cobranzas' && pendientes > 0 && (
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}>
                    {pendientes}
                  </span>
                )}
                {item.key === 'alertas' && enAlerta > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}>
                    {enAlerta}
                  </span>
                )}
                {item.key === 'deudores' && conDeuda > 0 && (
                  <span style={{ background: '#9a7800', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}>
                    {conDeuda}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="contabilium-status">
          <span className="status-dot" />
          <span>v3.0 — Contabilium</span>
        </div>
      </div>
    </div>
  )
}
