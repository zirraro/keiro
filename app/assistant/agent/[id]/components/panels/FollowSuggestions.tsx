'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/**
 * Comptes recommandés à SUIVRE — un compte qui suit des comptes de sa niche
 * paraît actif (signal de crédibilité). Vrais handles du CRM + recherches
 * (zéro handle inventé). 2026-06-24 : déplacé de Léna vers JADE (agent
 * follows/engagement). TikTok + Instagram.
 */
export default function FollowSuggestions({ platform }: { platform: string }) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setData(null);
    if (platform !== 'instagram' && platform !== 'tiktok') return;
    fetch(`/api/agents/content/follow-suggestions?platform=${platform}`, { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d?.ok) setData(d); }).catch(() => {});
  }, [platform]);

  if ((platform !== 'instagram' && platform !== 'tiktok') || !data) return null;
  const profileUrl = (h: string) => platform === 'instagram' ? `https://www.instagram.com/${h}` : `https://www.tiktok.com/@${h}`;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <span className="text-xs font-semibold text-white/80">{en ? '👥 Accounts to follow — activate your account' : '👥 Comptes à suivre — active ton compte'}</span>
        <span className="text-white/40 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-[10px] text-white/40">{data.note}</p>
          {data.realHandles?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{en ? 'Peers / local' : 'Confrères / locaux'} ({data.sector})</div>
              <div className="flex flex-wrap gap-1.5">
                {data.realHandles.map((h: any) => (
                  <a key={h.handle} href={profileUrl(h.handle)} target="_blank" rel="noopener noreferrer" title={h.company} className="text-[11px] px-2 py-1 rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:border-emerald-500/50 hover:text-emerald-300">@{h.handle}</a>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">{en ? 'Explore & follow' : 'À explorer & suivre'}</div>
            <div className="space-y-1.5">
              {(data.categories || []).map((c: any, i: number) => (
                <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 hover:border-emerald-500/40">
                  <div className="text-[11px] font-medium text-white/80">{c.label} ↗</div>
                  <div className="text-[10px] text-white/40">{c.why}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
