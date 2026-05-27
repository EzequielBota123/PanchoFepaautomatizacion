'use client'
import { useEffect, useState } from 'react'

let _showToast: ((msg: string) => void) | null = null

export function toast(msg: string) {
  _showToast?.(msg)
}

export function Toast() {
  const [msg, setMsg]     = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    _showToast = (m: string) => {
      setMsg(m)
      setVisible(true)
      setTimeout(() => setVisible(false), 2500)
    }
    return () => { _showToast = null }
  }, [])

  return (
    <div className={`toast ${visible ? 'show' : ''}`}>
      {msg}
    </div>
  )
}
