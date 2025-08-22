'use client'

import * as React from 'react'

type ToastMessage = {
  id: number
  title: string
  description?: string
}

type ToastContextType = {
  addToast: (title: string, description?: string) => void
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([])

  function addToast(title: string, description?: string) {
    setToasts((prev) => [...prev, { id: Date.now(), title, description }])
    setTimeout(() => {
      setToasts((prev) => prev.slice(1)) // auto-remove après 3s
    }, 3000)
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Zone d'affichage des toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-neutral-800 text-white px-4 py-2 rounded-lg shadow-lg border border-neutral-700"
          >
            <strong>{toast.title}</strong>
            {toast.description && <p className="text-sm">{toast.description}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Hook pratique
export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
