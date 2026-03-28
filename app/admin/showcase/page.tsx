'use client';

import { useState, useEffect } from 'react';

type ShowcaseImage = {
  id: string;
  business_type: string;
  image_url: string;
  title: string | null;
  description: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
};

export default function ShowcaseAdmin() {
  const [images, setImages] = useState<ShowcaseImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/showcase?type=all&limit=100')
      .then(r => r.json())
      .then(d => { if (d.images) setImages(d.images); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load all from Supabase directly
    import('@/lib/supabase/client').then(({ supabaseBrowser }) => {
      const sb = supabaseBrowser();
      sb.from('showcase_images').select('*').order('business_type').then(({ data }: { data: any }) => {
        if (data) setImages(data);
        setLoading(false);
      });
    });
  }, []);

  const types = [...new Set(images.map(i => i.business_type))];
  const filtered = filterType ? images.filter(i => i.business_type === filterType) : images;

  if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Showcase Images</h1>
            <p className="text-sm text-neutral-500">{images.length} images pour emails et DMs de prospection</p>
          </div>
          <a href="/admin/agents" className="text-sm text-purple-600">← Admin</a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Type filters */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterType(null)} className={`px-3 py-1.5 text-xs rounded-lg ${!filterType ? 'bg-purple-600 text-white' : 'bg-white border text-neutral-600 hover:bg-neutral-50'}`}>
            Tous ({images.length})
          </button>
          {types.map(t => (
            <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 text-xs rounded-lg capitalize ${filterType === t ? 'bg-purple-600 text-white' : 'bg-white border text-neutral-600 hover:bg-neutral-50'}`}>
              {t} ({images.filter(i => i.business_type === t).length})
            </button>
          ))}
        </div>

        {/* Image grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(img => (
            <div key={img.id} className="bg-white rounded-xl border overflow-hidden group">
              <div className="aspect-square relative">
                <img src={img.image_url} alt={img.title || ''} className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 text-white text-[9px] rounded">
                  {img.usage_count}x
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs font-medium text-neutral-900 truncate">{img.title || 'Sans titre'}</p>
                <p className="text-[10px] text-neutral-400 capitalize">{img.business_type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
