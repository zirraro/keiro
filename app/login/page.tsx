'use client';

import { useState } from 'react';
import { supabaseBrowser } from '../../lib/supabase/client';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { TiltCard } from '../../components/ui/tilt-card';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 flex items-center justify-center">
      <TiltCard className="max-w-md w-full p-6">
        <h1 className="text-2xl font-bold mb-4">Connexion</h1>
        {sent ? (
          <p className="text-neutral-300">Vérifie ta boîte mail pour valider la connexion.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ex: vous@exemple.com" required />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full">Recevoir un lien magique</Button>
          </form>
        )}
      </TiltCard>
    </main>
  );
}
