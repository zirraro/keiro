import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Un fournisseur en impayé arrête tout, et personne ne le sait.
 *
 * ── Ce qui s'est passé le 19 août ──
 *
 * Fondateur : « possible que j'aie plus de budget sur ByteDance, ils ont
 * essayé de débiter et c'est refusé — est-ce que ça s'arrête direct et comment
 * tu peux l'identifier ? »
 *
 * Son intuition était juste. L'API répond :
 *   403 AccountOverdueError — your account has an overdue balance
 *
 * Et ça coupe TOUT le compte d'un coup : la génération d'images (Seedream), la
 * vidéo (Seedance), le texte (DeepSeek) et le juge de vision (seed-2-0). Quatre
 * fonctions du produit, un seul prélèvement refusé.
 *
 * ── Pourquoi ça n'a pas été vu ──
 *
 * Rien ne s'est plaint. Les posts sont sortis sans visuel, le juge s'est sauté
 * lui-même faute d'image à regarder, et le calendrier s'est rempli de
 * brouillons vides. J'ai passé une heure à soupçonner mon propre code — quotas,
 * portail qualité, ordre des fournisseurs — pendant que la cause était une
 * facture.
 *
 * C'est le mode de panne le plus coûteux du produit : tout paraît fonctionner,
 * chaque étape rend une réponse, et le résultat est vide.
 *
 * ── Ce que ce contrôle fait ──
 *
 * Un appel minimal par fournisseur, toutes les heures. Il distingue les trois
 * causes qui appellent des actions différentes :
 *   · IMPAYÉ → une facture à régler, aucune correction de code n'y changera rien ;
 *   · CLÉ REFUSÉE → une clé à renouveler ;
 *   · INJOIGNABLE → un incident réseau, souvent passager.
 *
 * Une seule alerte par jour et par fournisseur : répéter ne fait pas payer plus
 * vite, et une alerte qui se répète cesse d'être lue.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function cleArk(): string {
  return (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c').trim();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const etats: Record<string, string> = {};

  // ── ByteDance : images, vidéo, texte et juge de vision sur le MÊME compte ──
  try {
    const r = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cleArk()}` },
      body: JSON.stringify({ model: 'deepseek-v3-2-251201', messages: [{ role: 'user', content: 'ok' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(15000),
    });
    const t = await r.text();
    etats.bytedance = r.ok ? 'ok'
      : /Overdue/i.test(t) ? 'IMPAYÉ'
      : /Authentication|key/i.test(t) ? 'CLÉ REFUSÉE'
      : `HTTP ${r.status}`;
  } catch (e: any) {
    etats.bytedance = `INJOIGNABLE (${String(e?.message).slice(0, 40)})`;
  }

  // ── Gemini, via IPv4 : la plage IPv6 d'OVH est refusée par Google ──
  if (process.env.GEMINI_API_KEY) {
    try {
      const { fetchIPv4 } = await import('@/lib/net/ipv4');
      const r = await fetchIPv4(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } } }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const t = await r.text();
      etats.gemini = r.ok ? 'ok' : /quota|billing/i.test(t) ? 'QUOTA/FACTURE' : `HTTP ${r.status}`;
    } catch (e: any) {
      etats.gemini = `INJOIGNABLE (${String(e?.message).slice(0, 40)})`;
    }
  }

  const enPanne = Object.entries(etats).filter(([, v]) => v !== 'ok');
  if (enPanne.length === 0) return NextResponse.json({ ok: true, etats });

  const supabase = sb();
  const detail = enPanne.map(([f, v]) => `${f} : ${v}`).join(' · ');
  console.error(`[Fournisseurs] ${detail}`);

  try {
    await supabase.from('agent_logs').insert({
      agent: 'ops', action: 'fournisseur_indisponible', status: 'error',
      error_message: detail.slice(0, 500),
      data: { etats },
      created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne bloque pas l'alerte */ }

  // Une alerte par jour et par fournisseur : répéter ne fait pas payer plus vite.
  try {
    const depuis = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: deja } = await supabase
      .from('agent_logs').select('id')
      .eq('action', 'fournisseur_alerte_envoyee')
      .gte('created_at', depuis).limit(1);
    if (!deja?.length) {
      const impaye = enPanne.some(([, v]) => v === 'IMPAYÉ');
      const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
      await sendEmailWithFallback({
        to: 'contact@keiroai.com',
        subject: impaye ? '🔴 Fournisseur en IMPAYÉ — la production est à l\'arrêt' : `⚠️ Fournisseur indisponible — ${detail}`,
        html: `<p><strong>${detail}</strong></p>
${impaye ? `<p>Un compte en impayé coupe TOUT d'un coup. Sur ByteDance : la génération d'images, la vidéo, le texte DeepSeek et le juge de vision — quatre fonctions du produit pour un seul prélèvement refusé.</p>
<p>Rien ne se plaint : les posts sortent sans visuel, le juge se saute faute d'image, le calendrier se remplit de brouillons vides. <strong>Action : régler la facture.</strong> Aucune correction de code n'y changera quoi que ce soit.</p>` : '<p>Vérifier la clé et la joignabilité du service.</p>'}`,
      });
      await supabase.from('agent_logs').insert({
        agent: 'ops', action: 'fournisseur_alerte_envoyee', status: 'warning',
        data: { etats }, created_at: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.warn('[Fournisseurs] alerte non envoyée :', e?.message);
  }

  return NextResponse.json({ ok: true, etats, alerte: true });
}
