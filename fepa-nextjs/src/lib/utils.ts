import type { Cliente } from './types'

export type SemaforoColor = 'verde' | 'amarillo' | 'rojo'

export function fmt(n: number): string {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const clean = d.split('T')[0]
  const [y, m, day] = clean.split('-')
  return `${day}/${m}/${y}`
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function diasHasta(d: string | null | undefined): number {
  if (!d) return 0
  const clean = d.split('T')[0]
  const hoy = new Date(today())
  const dest = new Date(clean)
  return Math.round((dest.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export function diasDesde(d: string | null | undefined): number {
  if (!d) return 0
  return -diasHasta(d)
}

// Semáforo basado en saldo_deudor vs limite_credito
export function semaforo(cliente: Cliente): SemaforoColor {
  const saldo = cliente.saldo_deudor || 0
  if (saldo <= 0) return 'verde'
  if (cliente.limite_credito > 0) {
    const pct = saldo / cliente.limite_credito
    if (pct >= 1)   return 'rojo'
    if (pct >= 0.8) return 'amarillo'
    return 'verde'
  }
  // Without limit: use absolute thresholds
  if (saldo > 500_000) return 'rojo'
  if (saldo > 100_000) return 'amarillo'
  return 'verde'
}

export function semaforoLabel(c: Cliente): string {
  const s = semaforo(c)
  const labels: Record<SemaforoColor, string> = {
    verde:    'Al día',
    amarillo: 'Atención',
    rojo:     'En riesgo',
  }
  return labels[s]
}

export function acuerdoBadgeClass(tipo: string): string {
  const map: Record<string, string> = {
    'contado':       'badge-green',
    'transferencia': 'badge-blue',
    'cheque_30':     'badge-yellow',
    'cheque_60':     'badge-yellow',
    'cheque_90':     'badge-yellow',
    'cheque_120':    'badge-red',
    'mixto':         'badge-gray',
  }
  return map[tipo] || 'badge-gray'
}

export function acuerdoShort(tipo: string): string {
  const map: Record<string, string> = {
    'contado':       'Contado',
    'transferencia': 'Transf.',
    'cheque_30':     'Chq 30d',
    'cheque_60':     'Chq 60d',
    'cheque_90':     'Chq 90d',
    'cheque_120':    'Chq 120d',
    'mixto':         'Mixto',
  }
  return map[tipo] || tipo
}

export function nextId(arr: { id: number }[]): number {
  return arr.length > 0 ? Math.max(...arr.map(x => x.id)) + 1 : 1
}
