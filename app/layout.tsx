import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Cifras', description: 'Organizador de cifras musicais' }
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}