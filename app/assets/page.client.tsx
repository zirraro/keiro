'use client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase/client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { TiltCard } from "../../components/ui/tilt-card";

type Org = { id: string, name: string };
type Asset = { id: string; name: string | null; url: string | null; kind: string | null };

export default function AssetsPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<'logo'|'palette'|'font'|'other'>('logo');

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser(); // <-- créé côté client, au runtime
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: o } = await sb.from('orgs').select('*').eq('owner_id', user.id).maybeSingle();
      if (!o) return;
      setOrg(o);
      const { data: a } = await sb.from('assets').select('*').eq('org_id', o.id).order('created_at', { ascending: false });
      setAssets(a || []);
    })();
  }, []);

  async function onUpload(file?: File | null) {
    if (!file || !org) return;
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const path = `${user.id}/${Date.now()}_${file.name}`;
    const up = await sb.storage.from('logos').upload(path, file, { upsert: false });
    if (up.error) return;
    const { data } = sb.storage.from('logos').getPublicUrl(path);
    const { data: created } = await sb.from('assets').insert({
      org_id: org.id, user_id: user.id, kind, name: file.name, url: data.publicUrl
    }).select().single();
    setAssets([created, ...assets]);
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Galerie d’assets</h1>
        <TiltCard className="p-5">
          <div className="flex items-center gap-3">
            <select value={kind} onChange={(e)=>setKind(e.target.value as any)} className="bg-white border border-neutral-200 rounded px-3 py-2">
              <option value="logo">Logo</option>
              <option value="palette">Palette</option>
              <option value="font">Font</option>
              <option value="other">Autre</option>
            </select>
            <input ref={fileRef} type="file" className="hidden" onChange={(e)=>onUpload(e.target.files?.[0])}/>
            <Button onClick={() => fileRef.current?.click()}>Ajouter un fichier</Button>
          </div>
        </TiltCard>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map(a => (
            <TiltCard key={a.id} className="p-4">
              <div className="text-xs text-neutral-600">{a.kind}</div>
              <div className="font-medium">{a.name}</div>
              {a.url && <a href={a.url} target="_blank" className="text-sm underline underline-offset-4 mt-2 inline-block">Voir</a>}
            </TiltCard>
          ))}
        </div>
      </div>
    </main>
  );
}
