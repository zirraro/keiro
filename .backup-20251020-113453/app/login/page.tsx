'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = supabaseBrowser()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string|null>(null)
  const url = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-4">
      <h1 className="text-2xl font-semibold">Connexion</h1>

      <div className="space-y-2">
        <label className="text-sm">Email (magic link)</label>
        <div className="flex gap-2">
          <input
            className="border rounded-md px-3 py-2 w-full"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="toi@exemple.com"
          />
          <button
            className="px-3 py-2 rounded-md bg-black text-white"
            onClick={async ()=>{
              setErr(null)
              const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: `${url}/auth/callback` }
              })
              if (error) setErr(error.message); else setSent(true)
            }}
          >
            Envoyer
          </button>
        </div>
        {sent && <p className="text-sm text-green-700">Vérifie ta boîte mail 👍</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-md border"
            onClick={async ()=>{ await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${url}/auth/callback` } })}}
          >Google</button>
          <button
            className="px-3 py-2 rounded-md border"
            onClick={async ()=>{ await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: `${url}/auth/callback` } })}}
          >GitHub</button>
        </div>
        <p className="text-xs text-neutral-500">
          Ajoute http://localhost:3000 dans Supabase → Authentication → URL Configuration.
        </p>
      </div>
    </div>
  )
}
