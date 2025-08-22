import './globals.css'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import Navbar from '../components/site/navbar'
import Footer from '../components/site/footer'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400','500','600','700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Keiro',
  description: 'Générez des visuels qui surfent sur l’actualité',
}

export default function RootLayout(<ToastProvider>{ children }</ToastProvider>: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${jakarta.className} bg-neutral-950 text-neutral-100`}>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  )
}
