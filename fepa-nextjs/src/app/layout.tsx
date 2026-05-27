import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FEPA — Cobranzas & Clientes',
  description: 'Sistema de cobranzas y gestión de clientes FEPA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
