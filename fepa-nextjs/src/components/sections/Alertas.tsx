'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Cliente, Factura } from '@/lib/types'
import { fmt, fmtDate, diasHasta, semaforo } from '@/lib/utils'

export function Alertas() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState<'todas' | 'credito' | 'vencidas' | 'riesgo'>('todas')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rc, rf] = await Promise.all([
        fetch('/api/clientes').then(r => r.json()),
        fetch('/api/facturas?estado=pendiente').then(r => r.json()),
      ])
      if (Array.isArray(rc)) setClientes(rc)
      if (Array.isArray(rf)) setFacturas(rf)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  type Alerta = {
    id: string
    tipo: 'credito' | 'vencida' | 'riesgo'
    cliente: string
    titulo: string
    detalle: string
    valor: number
    color: string
  }

  const alertas: Alerta[] = useMemo(() => {
    const result: Alerta[] = []

    // Límite de crédito alcanzado
    clientes.forEach(c => {
      if (c.limite_credito > 0 && c.saldo_deudor >= c.limite_credito) {
        result.push({
          id: `cred-${c.id}`,
          tipo: 'credito',
          cliente: c.razon_social,
          titulo: 'Límite de crédito alcanzado',
          detalle: `Saldo: ${fmt(c.saldo_deudor)} / Límite: ${fmt(c.limite_credito)} (${Math.round((c.saldo_deudor/c.limite_credito)*100)}%)`,
          valor: c.saldo_deudor,
          color: '#ef4444',
        })
      } else if (c.limite_credito > 0 && c.saldo_deudor >= c.limite_credito * 0.8) {
        result.push({
          id: `cred80-${c.id}`,
          tipo: 'credito',
          cliente: c.razon_social,
          titulo: 'Crédito al 80%',
          detalle: `Saldo: ${fmt(c.saldo_deudor)} / Límite: ${fmt(c.limite_credito)} (${Math.round((c.saldo_deudor/c.limite_credito)*100)}%)`,
          valor: c.saldo_deudor,
          color: '#f59e0b',
        })
      }
    })

    // Facturas vencidas
    facturas.forEach(f => {
      const dias = diasHasta(f.fecha_vto)
      if (dias < 0) {
        result.push({
          id: `venc-${f.id}`,
          tipo: 'vencida',
          cliente: f.cliente_nombre,
          titulo: `Factura vencida hace ${Math.abs(dias)} días`,
          detalle: `${f.nro} · Vto: ${fmtDate(f.fecha_vto)}`,
          valor: f.total,
          color: '#ef4444',
        })
      } else if (dias <= 3) {
        result.push({
          id: `venc3-${f.id}`,
          tipo: 'vencida',
          cliente: f.cliente_nombre,
          titulo: dias === 0 ? 'Factura vence HOY' : `Factura vence en ${dias} día${dias !== 1 ? 's' : ''}`,
          detalle: `${f.nro} · Vto: ${fmtDate(f.fecha_vto)}`,
          valor: f.total,
          color: '#f97316',
        })
      }
    })

    // Clientes en riesgo (sin crédito configurado pero con saldo alto)
    clientes.forEach(c => {
      if (c.limite_credito === 0 && semaforo(c) === 'rojo') {
        result.push({
          id: `riesgo-${c.id}`,
          tipo: 'riesgo',
          cliente: c.razon_social,
          titulo: 'Cliente en riesgo — saldo alto',
          detalle: `Saldo deudor: ${fmt(c.saldo_deudor)}`,
          valor: c.saldo_deudor,
          color: '#ef4444',
        })
      }
    })

    return result.sort((a, b) => b.valor - a.valor)
  }, [clientes, facturas])

  const filtered = filtro === 'todas' ? alertas : alertas.filter(a => a.tipo === (filtro === 'vencidas' ? 'vencida' : filtro))

  const countOf = (t: string) => alertas.filter(a => a.tipo === (t === 'vencidas' ? 'vencida' : t)).length

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Cargando…</div>

  return (
    <div className="section-content">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Alertas de Seguimiento</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
          {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} activa{alertas.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Límite de Crédito" count={countOf('credito')} color="#ef4444" />
        <StatCard label="Facturas Vencidas" count={countOf('vencidas')} color="#f59e0b" />
        <StatCard label="Clientes en Riesgo" count={countOf('riesgo')} color="#6b7280" />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { key: 'todas',   label: `Todas (${alertas.length})` },
          { key: 'credito', label: `Crédito (${countOf('credito')})` },
          { key: 'vencidas',label: `Vencidas (${countOf('vencidas')})` },
          { key: 'riesgo',  label: `Riesgo (${countOf('riesgo')})` },
        ] as { key: typeof filtro; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            className="btn btn-secondary"
            style={{ fontSize: 13, fontWeight: filtro === key ? 700 : 400, borderColor: filtro === key ? 'var(--primary)' : undefined }}
            onClick={() => setFiltro(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div>Sin alertas en esta categoría</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(a => (
            <div
              key={a.id}
              style={{
                background: 'var(--bg-secondary)',
                borderRadius: 8,
                padding: '14px 18px',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${a.color}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{a.cliente}</div>
                <div style={{ fontSize: 13, color: a.color, fontWeight: 600, marginBottom: 2 }}>{a.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.detalle}</div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: a.color }}>{fmt(a.valor)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {a.tipo === 'credito' ? 'Crédito' : a.tipo === 'vencida' ? 'Vencida' : 'Riesgo'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{count}</div>
    </div>
  )
}
