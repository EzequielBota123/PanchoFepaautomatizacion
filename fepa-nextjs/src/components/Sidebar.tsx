'use client'
import { useApp } from './App'

const NAV = [
  { key: 'dashboard', icon: '◈', label: 'Dashboard',          section: 'PRINCIPAL' },
  { key: 'cobranzas', icon: '◎', label: 'Cobranzas',          section: null },
  { key: 'clientes',  icon: '◉', label: 'Clientes',           section: 'GESTIÓN' },
  { key: 'ordenes',   icon: '◧', label: 'Órdenes de Venta',   section: null },
  { key: 'pipeline',  icon: '◐', label: 'Pipeline de Ventas', section: null },
  { key: 'deudores',  icon: '◑', label: 'Deudores',           section: null },
]

interface Props {
  activeSection: string
  onNav: (section: string) => void
}

export function Sidebar({ activeSection, onNav }: Props) {
  const { facturas, clientes } = useApp()

  const pendientes = facturas.filter(f => f.estado === 'pendiente').length
  const conDeuda   = clientes.filter(c => (c.saldo_deudor || 0) > 0).length

  let lastSection = ''

  return (
    <div className="sidebar">
      <div className="logo-wrap">
        <div className="logo">FE<span>PA</span></div>
        <div className="logo-tag">Sistema de Cobranzas</div>
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
                  <span style={{
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 10, padding: '1px 6px',
                    fontSize: 9, fontFamily: 'IBM Plex Mono, monospace',
                  }}>{pendientes}</span>
                )}
                {item.key === 'deudores' && conDeuda > 0 && (
                  <span style={{
                    background: '#9a7800', color: '#fff',
                    borderRadius: 10, padding: '1px 6px',
                    fontSize: 9, fontFamily: 'IBM Plex Mono, monospace',
                  }}>{conDeuda}</span>
                )}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="contabilium-status">
          <span className="status-dot" />
          <span>v1.0 — Producción</span>
        </div>
      </div>
    </div>
  )
}
