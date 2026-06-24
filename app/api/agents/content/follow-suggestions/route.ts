import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { detectSector, SECTORS } from '@/lib/agents/sales-playbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comptes recommandés à SUIVRE (TikTok / Instagram) — signal de compte actif.
 *
 * 2026-06-24 — Founder : dans l'onglet réseau de Léna, proposer des comptes à
 * suivre pour que le compte client paraisse actif (suivre des comptes de sa
 * niche). Pour TOUS les clients (rentre dans leur plan).
 *
 * SÉCURITÉ : zéro handle inventé. On combine :
 *  1. de VRAIS handles présents dans le CRM du client (prospects/confrères de
 *     son secteur déjà scrapés — réels), filtrés par plateforme ;
 *  2. des CATÉGORIES de comptes à suivre + des liens de RECHERCHE TikTok/IG
 *     (le client trouve et suit lui-même de vrais comptes).
 * Suivre des confrères/locaux/inspirations = active le compte sans auto-follow
 * (l'API ne permet pas le follow programmatique — c'est une recommandation).
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const searchUrl = (platform: string, q: string) =>
  platform === 'instagram'
    ? `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`
    : `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const platform = (new URL(req.url).searchParams.get('platform') || 'tiktok').toLowerCase();
  const handleCol = platform === 'instagram' ? 'instagram' : 'tiktok_handle';

  // Secteur + ville du client (brand kit puis dossier).
  let sectorLabel = 'commerce local', city = '';
  try {
    const { data: kit } = await supabase.from('brand_kits').select('vertical, address').eq('org_id', user.id).maybeSingle();
    const sector = detectSector(kit?.vertical || '');
    sectorLabel = (SECTORS as any)[sector]?.label || sectorLabel;
    const addr = String(kit?.address || '');
    const m = addr.match(/\d{5}\s+([A-Za-zÀ-ÿ' -]+)/); if (m) city = m[1].trim();
  } catch { /* best-effort */ }

  // 1) Vrais handles du CRM (mêmes secteur, plateforme renseignée) — réels.
  const realHandles: { handle: string; company: string }[] = [];
  try {
    const { data: rows } = await supabase.from('crm_prospects')
      .select(`company, ${handleCol}`).eq('user_id', user.id).not(handleCol, 'is', null).limit(40);
    const seen = new Set<string>();
    for (const r of (rows || []) as any[]) {
      const h = String(r[handleCol] || '').replace(/^@/, '').replace(/\s/g, '').trim();
      if (!h || h.length < 2 || !/^[a-zA-Z0-9._]{2,30}$/.test(h) || seen.has(h.toLowerCase())) continue;
      seen.add(h.toLowerCase());
      realHandles.push({ handle: h, company: r.company || h });
      if (realHandles.length >= 8) break;
    }
  } catch { /* best-effort */ }

  // 2) Catégories de comptes à suivre (par secteur) + liens de recherche réels.
  const sl = sectorLabel.toLowerCase();
  const categories = [
    { label: `Confrères ${sl}${city ? ' à ' + city : ' de ta région'}`, why: 'Suivre tes pairs = signal de niche claire pour l\'algo + veille concurrentielle.', url: searchUrl(platform, `${sl}${city ? ' ' + city : ''}`) },
    { label: `Comptes locaux${city ? ' de ' + city : ''}`, why: 'Ancre ton compte localement (l\'algo te montre à une audience proche).', url: searchUrl(platform, city || 'commerce local') },
    { label: `Inspiration ${sl}`, why: 'Les meilleurs de ton secteur — pour t\'inspirer des formats qui marchent.', url: searchUrl(platform, `meilleur ${sl}`) },
    { label: 'Tendances du moment', why: 'Suivre les comptes tendance te branche sur les sons/formats viraux.', url: searchUrl(platform, 'tendance 2026') },
  ];

  return NextResponse.json({
    ok: true,
    platform,
    sector: sectorLabel,
    city: city || null,
    realHandles,
    categories,
    note: 'Suivre 5-10 comptes pertinents rend ton compte actif et crédible. L\'app ne peut pas suivre à ta place (les réseaux l\'interdisent) — un tap sur chaque suggestion et c\'est fait.',
  });
}
