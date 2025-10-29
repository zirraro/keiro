'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TiltCard } from '@/components/ui/tilt-card';

type BrandProfile = {
  id?: string;
  name: string | null;
  tone: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_family: string | null;
  logo_url: string | null;
};

export default function BrandPage() {
  const [profile, setProfile] = useState<BrandProfile>({
    name: '',
    tone: '',
    primary_color: '#2b82f6',
    secondary_color: '#111111',
    font_family: 'Inter, system-ui, sans-serif',
    logo_url: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Charger le profil au montage
  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      try {
        const res = await fetch('/api/brand');
        const data = await res.json();
        if (data.ok && data.profile) {
          setProfile({
            name: data.profile.name || '',
            tone: data.profile.tone || '',
            primary_color: data.profile.primary_color || '#2b82f6',
            secondary_color: data.profile.secondary_color || '#111111',
            font_family: data.profile.font_family || 'Inter, system-ui, sans-serif',
            logo_url: data.profile.logo_url || null,
          });
        }
      } catch (err: any) {
        setError(err?.message || 'Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          tone: profile.tone,
          primary_color: profile.primary_color,
          secondary_color: profile.secondary_color,
          font_family: profile.font_family,
          logo_url: profile.logo_url,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Profil de marque</h1>
            <p className="text-sm text-neutral-600 mt-1">
              Définissez l'identité visuelle de votre marque
            </p>
          </div>
          <a href="/assets">
            <Button variant="outline">Gérer les assets</Button>
          </a>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-3 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 p-3 text-sm">
            Profil sauvegardé avec succès !
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Formulaire */}
          <TiltCard className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nom de la marque</label>
              <input
                type="text"
                value={profile.name || ''}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Ex: Acme Inc."
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Ton de communication</label>
              <select
                value={profile.tone || ''}
                onChange={(e) => setProfile({ ...profile, tone: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sélectionner un ton</option>
                <option value="professional">Professionnel</option>
                <option value="friendly">Amical</option>
                <option value="casual">Décontracté</option>
                <option value="formal">Formel</option>
                <option value="humorous">Humoristique</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Couleur primaire</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={profile.primary_color || '#2b82f6'}
                    onChange={(e) => setProfile({ ...profile, primary_color: e.target.value })}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={profile.primary_color || '#2b82f6'}
                    onChange={(e) => setProfile({ ...profile, primary_color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Couleur secondaire</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={profile.secondary_color || '#111111'}
                    onChange={(e) => setProfile({ ...profile, secondary_color: e.target.value })}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={profile.secondary_color || '#111111'}
                    onChange={(e) => setProfile({ ...profile, secondary_color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Police de caractères</label>
              <input
                type="text"
                value={profile.font_family || ''}
                onChange={(e) => setProfile({ ...profile, font_family: e.target.value })}
                placeholder="Ex: Inter, system-ui, sans-serif"
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Utilisez des polices disponibles sur Google Fonts ou système
              </p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading ? 'Sauvegarde...' : 'Sauvegarder le profil'}
            </Button>
          </TiltCard>

          {/* Aperçu */}
          <TiltCard className="p-6">
            <h2 className="font-semibold mb-4">Aperçu</h2>
            <div
              className="border border-neutral-200 rounded-lg p-6 space-y-4"
              style={{ fontFamily: profile.font_family || 'Inter, system-ui, sans-serif' }}
            >
              <div>
                <h3
                  className="text-2xl font-bold"
                  style={{ color: profile.primary_color || '#2b82f6' }}
                >
                  {profile.name || 'Nom de marque'}
                </h3>
                <p
                  className="text-sm mt-1"
                  style={{ color: profile.secondary_color || '#111111' }}
                >
                  Votre contenu utilisera ces couleurs et cette typographie
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  className="px-4 py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: profile.primary_color || '#2b82f6' }}
                >
                  Bouton primaire
                </button>
                <button
                  className="px-4 py-2 rounded-lg border-2 font-medium"
                  style={{
                    borderColor: profile.primary_color || '#2b82f6',
                    color: profile.primary_color || '#2b82f6',
                  }}
                >
                  Bouton secondaire
                </button>
              </div>

              <div className="pt-4 border-t border-neutral-200">
                <p className="text-xs text-neutral-500">
                  Ton: <span className="font-medium">{profile.tone || 'Non défini'}</span>
                </p>
              </div>
            </div>
          </TiltCard>
        </div>
      </div>
    </main>
  );
}
