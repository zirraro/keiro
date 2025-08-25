'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

type FbPage = { id: string; name: string; access_token?: string };
type IgAccount = { id: string; username: string };

export default function MetaIntegrationPage() {
  const { data: session, status } = useSession();
  const [loadingPages, setLoadingPages] = useState(false);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [selected, setSelected] = useState<FbPage | null>(null);

  const [ig, setIg] = useState<IgAccount | null>(null);
  const [igLoading, setIgLoading] = useState(false);

  const [fbMessage, setFbMessage] = useState('Hello depuis Keiro 🚀');
  const [fbLink, setFbLink] = useState('');

  const [igImageUrl, setIgImageUrl] = useState('https://replicate.delivery/pbxt/8o3w3vN9/test-square.png');
  const [igCaption, setIgCaption] = useState('Test via Keiro 🎯');

  const isAuthed = status === 'authenticated';
  const masked = (t?: string) => !t ? '' : t.length <= 8 ? '***' : `${t.slice(0,4)}***${t.slice(-4)}`;

  async function loadPages() {
    setLoadingPages(true);
    try {
      const res = await fetch('/api/social/pages', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erreur pages');
      setPages(json.pages || []);
      if (json.pages?.length) setSelected(json.pages[0]);
    } catch (e:any) {
      alert(e.message || String(e));
    } finally {
      setLoadingPages(false);
    }
  }

  async function fetchIg() {
    if (!selected?.id || !selected?.access_token) {
      alert('Sélectionne une Page qui a un access_token');
      return;
    }
    setIgLoading(true);
    try {
      const res = await fetch('/api/social/instagram/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selected.id, pageAccessToken: selected.access_token }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'IG fetch error');
      setIg(json.ig || null);
      if (!json.ig) alert("Cette Page n'est pas reliée à un compte Instagram pro/creator.");
    } catch (e:any) {
      alert(e.message || String(e));
    } finally {
      setIgLoading(false);
    }
  }

  async function publishToPage() {
    if (!selected?.id || !selected?.access_token) {
      alert('Sélectionne une Page qui a un access_token');
      return;
    }
    try {
      const res = await fetch('/api/social/facebook/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: selected.id,
          pageAccessToken: selected.access_token,
          message: fbMessage,
          link: fbLink || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'FB publish error');
      alert('✅ Publication Facebook OK (post id: ' + json.id + ')');
    } catch (e:any) {
      alert(e.message || String(e));
    }
  }

  async function publishToInstagram() {
    if (!selected?.access_token || !ig?.id) {
      alert('Récupère d’abord le compte Instagram relié à la Page');
      return;
    }
    try {
      const res = await fetch('/api/social/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          igUserId: ig.id,
          pageAccessToken: selected.access_token,
          imageUrl: igImageUrl,
          caption: igCaption,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'IG publish error');
      alert('✅ Publication Instagram OK (media id: ' + json.id + ')');
    } catch (e:any) {
      alert(e.message || String(e));
    }
  }

  useEffect(() => {
    if (isAuthed) loadPages();
  }, [isAuthed]);

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Connexion Meta (Facebook & Instagram)</h1>

      {!isAuthed ? (
        <Card className="p-6">
          <p className="mb-4">Connecte ton compte Facebook pour accéder à tes Pages et publier.</p>
          <Button onClick={() => signIn('facebook')}>Se connecter avec Facebook</Button>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-neutral-500">Connecté</span>
            <Button variant="outline" onClick={() => signOut()}>Se déconnecter</Button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="font-semibold mb-3">Mes Pages</h2>
              {loadingPages ? (
                <p>Chargement…</p>
              ) : pages.length === 0 ? (
                <p>Aucune Page trouvée (vérifie les permissions et que tu as des Pages).</p>
              ) : (
                <div className="space-y-3">
                  {pages.map((p) => (
                    <button
                      key={p.id}
                      className={`w-full text-left border rounded p-3 hover:bg-neutral-50 ${selected?.id===p.id?'border-blue-400':'border-neutral-200'}`}
                      onClick={() => { setSelected(p); setIg(null); }}
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-neutral-500">ID: {p.id}</div>
                      <div className="text-xs text-neutral-500">Page token: {masked(p.access_token)}</div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={loadPages}>Rafraîchir</Button>
                <Button onClick={fetchIg} disabled={!selected || igLoading}>
                  {igLoading ? 'Recherche IG…' : 'Obtenir le compte Instagram lié'}
                </Button>
              </div>

              {ig && (
                <div className="mt-3 text-sm">
                  Instagram relié : <span className="font-semibold">@{ig.username}</span> (id: {ig.id})
                </div>
              )}
            </Card>

            <div className="space-y-6">
              <Card className="p-6">
                <h2 className="font-semibold mb-3">Publier sur la Page Facebook</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm">Message</label>
                    <Input value={fbMessage} onChange={e=>setFbMessage(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm">Lien (optionnel)</label>
                    <Input value={fbLink} onChange={e=>setFbLink(e.target.value)} placeholder="https://…" />
                  </div>
                  <Button onClick={publishToPage} disabled={!selected}>Publier sur la Page</Button>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-semibold mb-3">Publier une image sur Instagram</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm">Image URL</label>
                    <Input value={igImageUrl} onChange={e=>setIgImageUrl(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm">Caption</label>
                    <Input value={igCaption} onChange={e=>setIgCaption(e.target.value)} />
                  </div>
                  <Button onClick={publishToInstagram} disabled={!ig || !selected}>Publier sur Instagram</Button>
                </div>
                <p className="text-xs text-neutral-500 mt-3">
                  (Besoin d’un compte Instagram <strong>professionnel/creator</strong> relié à la Page.)
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
