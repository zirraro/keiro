'use client'
import { useEffect, useState } from 'react'

type Brand = { id: string; name: string }
type NewsItem = {
  id: string; brand_id: string; title: string; summary: string|null;
  url: string; image_url: string|null; source: string|null; published_at: string|null; created_at: string
}

export default function NewsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [items, setItems] = useState<NewsItem[]>([])
  const [form, setForm] = useState({ title: '', summary: '', url: '', image_url: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/brands').then(r=>r.json()).then(j=>{
      setBrands(j.data||[])
      if (!brandId && j.data?.[0]?.id) setBrandId(j.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!brandId) return
    fetch(`/api/news?brand_id=${encodeURIComponent(brandId)}&limit=20`)
      .then(r=>r.json()).then(j=>setItems(j.data||[]))
  }, [brandId])

  const submit = async () => {
    if (!brandId) return
    setLoading(true)
    const res = await fetch('/api/news/ingest', {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ brand_id: brandId, ...form, source: 'UI', published_at: new Date().toISOString() })
    })
    const j = await res.json()
    setLoading(false)
    if (j?.data) {
      setItems(i => [j.data, ...i])
      setForm({ title:'', summary:'', url:'', image_url:'' })
    } else {
      alert('Erreur: '+(j?.error?.message||res.status))
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Actus</h1>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">Marque</label>
          <select value={brandId} onChange={e=>setBrandId(e.target.value)} className="border rounded px-3 py-2 w-full">
            {brands.map(b=> <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 border rounded p-4">
        <div className="space-y-2">
          <label className="block text-sm">Titre</label>
          <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="border rounded px-3 py-2 w-full" />
          <label className="block text-sm">Résumé</label>
          <textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} className="border rounded px-3 py-2 w-full" />
          <label className="block text-sm">URL</label>
          <input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} className="border rounded px-3 py-2 w-full" />
          <label className="block text-sm">Image URL (optionnel)</label>
          <input value={form.image_url} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))} className="border rounded px-3 py-2 w-full" />
          <button disabled={loading||!brandId||!form.title||!form.url} onClick={submit}
                  className="mt-3 px-4 py-2 rounded bg-black text-white disabled:opacity-50">
            {loading ? 'Ajout…' : 'Ajouter l’actualité'}
          </button>
        </div>
        <div className="text-sm text-neutral-600">
          <p>⚠️ Depuis le terminal, les inserts ne passent que pour des <b>brands orphelines</b> (user_id = null). Depuis le navigateur (connecté), toutes tes brands fonctionnent.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {items.map(it => (
          <a key={it.id} href={it.url} target="_blank" className="border rounded overflow-hidden hover:shadow">
            {it.image_url && <img src={it.image_url} alt="" className="w-full aspect-video object-cover" />}
            <div className="p-3">
              <div className="text-xs text-neutral-500">{it.source ?? '—'} • {new Date(it.published_at ?? it.created_at).toLocaleString()}</div>
              <div className="font-medium">{it.title}</div>
              {it.summary && <div className="text-sm text-neutral-700 mt-1">{it.summary}</div>}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
