'use client'

import { useToast } from '@/components/ui/toast'

export default function Home() {
  const { addToast } = useToast()

  return (
    <main className="min-h-screen flex items-center justify-center">
      <button
        onClick={() => addToast('Succès ✅', 'Ton action a bien été réalisée')}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold"
      >
        Tester un toast
      </button>
    </main>
  )
}
