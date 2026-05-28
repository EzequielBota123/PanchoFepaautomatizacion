'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

interface Msg { role: 'user' | 'assistant'; content: string }

const PILLS = [
  { label: '🔴 Riesgo hoy',      q: '¿Cuáles son los 5 clientes con mayor riesgo de impago hoy?' },
  { label: '💬 WA morosos',      q: 'Generá mensajes de WhatsApp para los 3 clientes más morosos, listos para copiar' },
  { label: '📅 Cobros semana',   q: '¿Cuánto voy a cobrar esta semana y quiénes pagan?' },
  { label: '🔍 Anomalías',       q: 'Detectá anomalías o datos sospechosos en la cartera' },
  { label: '📋 Plan semanal',    q: 'Dame el plan de cobranzas para los próximos 7 días' },
  { label: '👤 Por vendedor',    q: 'Resumí el estado de cuenta de cada vendedor' },
  { label: '📈 Forecast 30d',    q: 'Hacé un forecast de cobranza para los próximos 30 días' },
  { label: '✅ Completar datos', q: 'Qué clientes tienen datos incompletos (CUIT, zona, teléfono)?' },
]

const AUTOS = [
  { key: 'mensajes_cobro',       label: '💬 Mensajes de cobro por WhatsApp' },
  { key: 'detectar_anomalias',   label: '🔍 Detectar anomalías en la cartera' },
  { key: 'plan_cobros',          label: '📅 Plan de cobros semanal' },
  { key: 'resumen_vendedores',   label: '👤 Resumen de performance por vendedor' },
  { key: 'forecast',             label: '📈 Forecast de cobranza 30 días' },
  { key: 'notas_auto',           label: '🗒️ Sugerir notas de seguimiento' },
]

const AUTO_PROMPTS: Record<string, string> = {
  mensajes_cobro:     'Generá mensajes de WhatsApp listos para copiar para los 5 clientes más morosos. Incluí nombre, monto y una propuesta de acuerdo.',
  detectar_anomalias: 'Analizá la cartera completa y detectá anomalías: datos incoherentes, saldos sospechosos, CUITs duplicados, clientes sin zona o vendedor. Sé específico.',
  plan_cobros:        'Generá un plan de cobros para los próximos 7 días. Indicá a quién llamar cada día, en qué orden de prioridad y qué mensaje usar.',
  resumen_vendedores: 'Resumí la performance de cada vendedor: cantidad de clientes, deuda total, % en riesgo y recomendación de acción para esta semana.',
  forecast:           'Hacé un forecast de cuánto se va a cobrar en los próximos 30 días, semana por semana, basándote en los vencimientos.',
  notas_auto:         'Sugerí notas de seguimiento para los clientes que requieren atención urgente. Para cada uno: qué decir y cuándo contactarlos.',
}

export function AsistenteIA() {
  const [msgs, setMsgs]           = useState<Msg[]>([])
  const [hist, setHist]           = useState<Msg[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [analisis, setAnalisis]   = useState<string | null>(null)
  const [accion, setAccion]       = useState<string | null>(null)
  const [autoRes, setAutoRes]     = useState<{ titulo: string; texto: string } | null>(null)
  const [noKey, setNoKey]         = useState(false)
  const msgsRef                   = useRef<HTMLDivElement>(null)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  const scrollBottom = () => {
    setTimeout(() => {
      if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
    }, 50)
  }

  const claudeCall = useCallback(async (messages: Msg[], systemOverride?: string, maxTokens = 1200): Promise<string> => {
    const res = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, systemOverride, maxTokens }),
    })
    if (res.status === 503) { setNoKey(true); throw new Error('Sin API key') }
    if (!res.ok) throw new Error('Error API')
    const data = await res.json()
    return data.text || ''
  }, [])

  const genAnalisis = useCallback(async () => {
    setAnalisis('Analizando…')
    try {
      const txt = await claudeCall([{
        role: 'user',
        content: 'Generá 4 insights clave del estado de cobranzas. Respondé SOLO con JSON válido, sin texto extra ni backticks:\n[{"tipo":"warning|tip|info|danger","titulo":"TÍTULO","texto":"descripción concisa"}]',
      }], undefined, 1000)
      const cleaned = txt.replace(/```json|```/g, '').trim()
      const ins = JSON.parse(cleaned) as { tipo: string; titulo: string; texto: string }[]
      const colors: Record<string, [string, string]> = {
        danger:  ['rgba(239,68,68,0.08)',  '#ef4444'],
        warning: ['rgba(245,158,11,0.08)', '#f59e0b'],
        tip:     ['rgba(0,179,126,0.08)',  '#00b37e'],
        info:    ['rgba(59,130,246,0.08)', '#3b82f6'],
      }
      const html = ins.map(i => {
        const [bg, col] = colors[i.tipo] || colors.info
        return `<div style="background:${bg};border-left:3px solid ${col};border-radius:4px;padding:9px 12px;margin-bottom:8px;font-size:12px;line-height:1.5">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${col};margin-bottom:3px;font-weight:700">${i.titulo}</div>
          ${i.texto}</div>`
      }).join('')
      setAnalisis(html)

      // Acción prioritaria
      const a = await claudeCall([{
        role: 'user',
        content: '¿Cuál es LA UNA acción más importante para el equipo de cobranzas HOY? 2-3 oraciones, muy concreto.',
      }], undefined, 300)
      setAccion(a)
    } catch {
      setAnalisis('<div style="color:var(--text-muted);font-size:12px">Error al generar análisis</div>')
    }
  }, [claudeCall])

  useEffect(() => { genAnalisis() }, [genAnalisis])

  const sendMsg = useCallback(async (txt: string) => {
    if (!txt.trim() || loading) return
    const userMsg: Msg = { role: 'user', content: txt }
    setMsgs(m => [...m, userMsg])
    const newHist = [...hist, userMsg]
    setHist(newHist)
    setLoading(true)
    scrollBottom()
    try {
      const reply = await claudeCall(newHist)
      const aiMsg: Msg = { role: 'assistant', content: reply }
      setMsgs(m => [...m, aiMsg])
      setHist(h => [...h, aiMsg].slice(-30))
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: '⚠ Error al conectar con el asistente.' }])
    } finally {
      setLoading(false)
      scrollBottom()
    }
  }, [loading, hist, claudeCall])

  const sendChat = () => {
    if (!input.trim()) return
    const txt = input
    setInput('')
    sendMsg(txt)
  }

  const runAuto = async (key: string) => {
    const label = AUTOS.find(a => a.key === key)?.label || key
    setAutoRes({ titulo: label, texto: 'Procesando…' })
    try {
      const txt = await claudeCall([{ role: 'user', content: AUTO_PROMPTS[key] }], undefined, 1600)
      setAutoRes({ titulo: label, texto: txt })
    } catch {
      setAutoRes({ titulo: label, texto: '⚠ Error al procesar la automatización.' })
    }
  }

  const renderMsg = (txt: string) =>
    txt
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>')
      .replace(/\n/g, '<br>')

  return (
    <div className="section-content">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Asistente IA</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>claude-sonnet-4 — datos de cartera en tiempo real</p>
      </div>

      {noKey && (
        <div style={{ padding: '14px 18px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', marginBottom: 20, fontSize: 13 }}>
          ⚠ Configurá <code>ANTHROPIC_API_KEY</code> en el archivo <code>.env.local</code> para usar el asistente IA.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

        {/* Chat */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: 580 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>◉ Chat con FEPA IA</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,179,126,0.15)', color: '#00b37e', fontWeight: 600 }}>En línea</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => { setMsgs([]); setHist([]) }}
              >↺ Nueva</button>
            </div>
          </div>

          {/* Messages */}
          <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>◉</div>
                Preguntá sobre clientes, cobranzas, deudas…
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: m.role === 'user' ? 'var(--primary)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: m.role === 'user' ? '#fff' : 'var(--text-muted)',
                }}>
                  {m.role === 'user' ? 'Vos' : 'IA'}
                </div>
                <div
                  style={{
                    maxWidth: '80%',
                    background: m.role === 'user' ? 'var(--primary)' : 'var(--bg-primary)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                    borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.55,
                    border: '1px solid var(--border)',
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMsg(m.content) }}
                />
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>IA</div>
                <div style={{ background: 'var(--bg-primary)', borderRadius: '12px 12px 12px 4px', padding: '12px 16px', border: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pills */}
          <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
            {PILLS.map(p => (
              <button
                key={p.label}
                onClick={() => sendMsg(p.q)}
                disabled={loading}
                style={{ padding: '3px 10px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
              placeholder="Preguntá sobre clientes, cobranzas…"
              disabled={loading}
              rows={2}
              style={{
                flex: 1, resize: 'none',
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              className="btn btn-primary"
              style={{ alignSelf: 'flex-end', padding: '8px 16px' }}
              onClick={sendChat}
              disabled={loading || !input.trim()}
            >
              ↑
            </button>
          </div>
        </div>

        {/* Panel derecho */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Análisis automático */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Análisis Automático</span>
              <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={genAnalisis}>↻</button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {analisis ? (
                <div dangerouslySetInnerHTML={{ __html: analisis }} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Cargando…</div>
              )}
            </div>
          </div>

          {/* Acción prioritaria */}
          {accion && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>⚡ Acción Prioritaria</span>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: renderMsg(accion) }}
              />
            </div>
          )}

          {/* Automatizaciones */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🤖 Automatizaciones</span>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {AUTOS.map(a => (
                <button
                  key={a.key}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', fontSize: 12, padding: '6px 10px', textAlign: 'left' }}
                  onClick={() => runAuto(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resultado automatizaciones */}
      {autoRes && (
        <div style={{ marginTop: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>{autoRes.titulo}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => navigator.clipboard.writeText(autoRes.texto)}
              >
                📋 Copiar
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => setAutoRes(null)}
              >✕</button>
            </div>
          </div>
          <div
            style={{ padding: '16px 20px', maxHeight: 500, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: renderMsg(autoRes.texto) }}
          />
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
