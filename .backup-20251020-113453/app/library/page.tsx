"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "@/app/components/NavBar";

/** Helpers base64 */
function readAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type Profile = {
  owner_id: string;
  name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_family: string | null;
  logo_path: string | null;
  updated_at: string;
};
type Asset = {
  id: string;
  owner_id: string;
  name: string;
  mime: string;
  storage_path: string;
  created_at: string;
  url?: string | null;
};

export default function LibraryPage() {
  const [tab, setTab] = useState<"brand"|"files">("brand");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);

  const primary = profile?.primary_color || "#2b82f6";
  const secondary = profile?.secondary_color || "#111111";
  const font = profile?.font_family || "Inter, system-ui, sans-serif";

  async function refreshAll() {
    setLoading(true);
    try {
      const p = await fetch("/api/brand").then(r=>r.json());
      if (p.ok) setProfile(p.profile);
      const a = await fetch("/api/assets").then(r=>r.json());
      if (a.ok) setAssets(a.assets);
    } finally { setLoading(false); }
  }

  useEffect(() => { refreshAll(); }, []);

  async function saveProfile(partial: {
    name?: string; primaryColor?: string; secondaryColor?: string;
    fontFamily?: string; logoDataUrl?: string;
  }) {
    setLoading(true);
    try {
      const res = await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      }).then(r=>r.json());
      if (!res.ok) alert(res.error || "Erreur brand");
      else setProfile(res.profile);
    } finally { setLoading(false); }
  }

  async function uploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    for (const f of files) {
      const dataUrl = await readAsDataURL(f);
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, mime: f.type, dataUrl }),
      }).then(r=>r.json());
      if (!res.ok) alert(res.error || "Upload échoué");
    }
    await refreshAll();
    e.currentTarget.value = "";
  }

  async function removeAsset(id: string) {
    const res = await fetch(`/api/assets?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(r=>r.json());
    if (!res.ok) alert(res.error || "Suppression échouée");
    await refreshAll();
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Librairie</h1>
          <button onClick={refreshAll} className="px-3 py-2 border rounded">Actualiser</button>
        </div>

        <div className="inline-flex border rounded overflow-hidden mb-6">
          <button className={`px-4 py-2 text-sm ${tab==="brand" ? "bg-black text-white" : ""}`} onClick={()=>setTab("brand")}>Marque</button>
          <button className={`px-4 py-2 text-sm ${tab==="files" ? "bg-black text-white" : ""}`} onClick={()=>setTab("files")}>Fichiers</button>
        </div>

        {tab === "brand" && (
          <section className="grid md:grid-cols-2 gap-6">
            <div className="border rounded p-4">
              <h2 className="font-medium mb-4">Profil de marque</h2>

              <label className="block text-sm mb-1">Nom</label>
              <input className="w-full border rounded px-3 py-2 mb-3"
                value={profile?.name ?? ""}
                onChange={(e)=>setProfile(p=>p?{...p,name:e.target.value}:null)}
                onBlur={()=>saveProfile({ name: profile?.name ?? "" })}
                placeholder="Acme Inc." />

              <label className="block text-sm mb-1">Couleur primaire</label>
              <div className="flex items-center gap-2 mb-3">
                <input type="color" value={primary}
                  onChange={(e)=>saveProfile({ primaryColor: e.target.value })}/>
                <input className="flex-1 border rounded px-3 py-2" value={primary}
                  onChange={(e)=>saveProfile({ primaryColor: e.target.value })}/>
              </div>

              <label className="block text-sm mb-1">Couleur secondaire</label>
              <div className="flex items-center gap-2 mb-3">
                <input type="color" value={secondary}
                  onChange={(e)=>saveProfile({ secondaryColor: e.target.value })}/>
                <input className="flex-1 border rounded px-3 py-2" value={secondary}
                  onChange={(e)=>saveProfile({ secondaryColor: e.target.value })}/>
              </div>

              <label className="block text-sm mb-1">Police</label>
              <input className="w-full border rounded px-3 py-2 mb-3"
                value={font}
                onChange={(e)=>saveProfile({ fontFamily: e.target.value })}
                placeholder="Inter, system-ui, sans-serif" />

              <label className="block text-sm mb-1">Logo</label>
              <input type="file" accept="image/*" onChange={async (e)=>{
                const f = e.target.files?.[0]; if (!f) return;
                const dataUrl = await readAsDataURL(f);
                await saveProfile({ logoDataUrl: dataUrl });
              }}/>

              {loading && <div className="text-sm text-gray-500 mt-3">…sauvegarde</div>}
            </div>

            <div className="border rounded p-4">
              <h2 className="font-medium mb-4">Aperçu</h2>
              <div className="border rounded p-4" style={{ fontFamily: font }}>
                <div className="text-2xl font-semibold mb-1" style={{ color: primary }}>
                  {profile?.name || "Nom de marque"}
                </div>
                <div className="text-sm mb-3" style={{ color: secondary }}>
                  Titres, CTA et éléments UI s’aligneront automatiquement.
                </div>
                <button className="px-4 py-2 rounded text-white" style={{ background: primary }}>
                  Call‑to‑Action
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === "files" && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Fichiers</h2>
              <label className="px-3 py-2 border rounded cursor-pointer">
                Importer
                <input hidden type="file" multiple onChange={uploadFiles}/>
              </label>
            </div>

            {assets.length === 0 ? (
              <div className="text-sm text-gray-500">Aucun fichier pour l’instant.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {assets.map(a=>(
                  <div key={a.id} className="border rounded overflow-hidden">
                    {String(a.mime).startsWith("image/") ? (
                      <img src={a.url ?? ""} className="w-full aspect-square object-cover"/>
                    ) : (
                      <div className="w-full aspect-square grid place-content-center text-xs text-gray-600">
                        {a.name}
                      </div>
                    )}
                    <div className="px-2 py-1 text-xs flex items-center justify-between">
                      <a className="truncate" href={a.url ?? "#"} target="_blank" title={a.name}>{a.name}</a>
                      <button className="text-red-600" onClick={()=>removeAsset(a.id)}>Suppr.</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
