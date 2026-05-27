import type { Cliente } from '@/lib/types'
import { semaforo, semaforoLabel } from '@/lib/utils'

export function SemaforoTag({ cliente }: { cliente: Cliente }) {
  const color = semaforo(cliente)
  const label = semaforoLabel(cliente)
  return <span className={`semaforo ${color}`}>{label}</span>
}

export function AcuerdoBadge({ tipoAcuerdo }: { tipoAcuerdo: string }) {
  if (!tipoAcuerdo) return null
  const map: Record<string, string> = {
    'Consignación':             'badge-blue',
    'Cuenta corriente 30 días': 'badge-yellow',
    'Recibe y paga':            'badge-green',
    'Baja':                     'badge-red',
    'Cuchi':                    'badge-red',
  }
  const cls = map[tipoAcuerdo] || 'badge-gray'
  const short = tipoAcuerdo === 'Cuenta corriente 30 días' ? 'Cta Cte 30d' : tipoAcuerdo
  return <span className={`badge ${cls}`} style={{ fontSize: 9 }}>{short}</span>
}

export function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    pagada:    'badge-green',
    pendiente: 'badge-yellow',
    vencida:   'badge-red',
  }
  const labels: Record<string, string> = {
    pagada: 'Pagada', pendiente: 'Pendiente', vencida: 'Vencida',
  }
  return <span className={`badge ${map[estado] || 'badge-gray'}`}>{labels[estado] || estado}</span>
}
