import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoCompat } from '@/lib/email/brevo-compat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * RAPPORT QUOTIDIEN DES COÛTS — pour piloter, pas pour alerter.
 *
 * Demande du fondateur (2026-08-05) : « un mail quotidien à contact@keiroai.com
 * sur les coûts Gemini du jour, Seedream, etc., tous les coûts qu'on a par
 * client — et même sur mrzirraro, qui se comporte comme un client super actif.
 * Je veux pouvoir piloter et ne pas avoir de surprise. »
 *
 * ── Pourquoi un rapport et pas une alerte de plus ──
 *
 * Une alerte ne se déclenche qu'au moment où c'est déjà trop tard. Le contrôle
 * quotidien existant n'écrit que si la marge projetée passe sous 70 % : on
 * découvre alors une dérive installée depuis des jours. Un chiffre reçu chaque
 * matin, même quand tout va bien, donne la seule chose qui manque — une
 * habitude et un point de comparaison.
 *
 * ── Ce qui est comparé ──
 *
 * Le jour seul ne dit rien. On affiche donc systématiquement la veille et la
 * moyenne des sept derniers jours : c'est l'écart qui informe, pas le montant.
 * Et la projection de fin de mois, parce que c'est elle qui décide s'il faut
 * agir aujourd'hui ou observer.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const DESTINATAIRE = 'contact@keiroai.com';

function eur(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} €`;
}

/** Variation lisible, ou une mention explicite quand elle n'a pas de sens. */
function variation(actuel: number, reference: number): string {
  if (reference <= 0) return actuel > 0 ? 'nouveau' : '—';
  const pct = Math.round(((actuel - reference) / reference) * 100);
  if (Math.abs(pct) < 5) return 'stable';
  return `${pct > 0 ? '+' : ''}${pct} %`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const maintenant = new Date();
  const debutJour = new Date(maintenant.getTime() - 24 * 3600 * 1000).toISOString();
  const debutVeille = new Date(maintenant.getTime() - 48 * 3600 * 1000).toISOString();
  const debut7j = new Date(maintenant.getTime() - 7 * 86400000).toISOString();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).toISOString();

  // Une seule lecture couvrant le mois : plusieurs requêtes coûteraient plus
  // cher que de filtrer en mémoire, et le volume reste modeste.
  const { data: evts, error } = await supabase
    .from('api_cost_events')
    .select('provider, kind, cost_eur, user_id, agent, created_at')
    .gte('created_at', debutMois)
    .limit(20000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const tous = evts || [];
  const dans = (depuis: string, jusqua?: string) => tous.filter(e =>
    e.created_at >= depuis && (!jusqua || e.created_at < jusqua));

  const jour = dans(debutJour);
  const veille = dans(debutVeille, debutJour);
  const semaine = dans(debut7j);

  const somme = (lot: any[]) => lot.reduce((s, e) => s + Number(e.cost_eur || 0), 0);
  const grouper = (lot: any[], cle: string) => {
    const g: Record<string, number> = {};
    for (const e of lot) g[e[cle] || '—'] = (g[e[cle] || '—'] || 0) + Number(e.cost_eur || 0);
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  };

  const totalJour = somme(jour);
  const totalVeille = somme(veille);
  const moyenne7j = somme(semaine) / 7;
  const totalMois = somme(tous);

  // Projection linéaire sur le rythme des sept derniers jours : plus fiable
  // que d'extrapoler la seule journée écoulée, qui peut être atypique.
  const joursEcoules = Math.max(1, maintenant.getDate());
  const joursDuMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0).getDate();
  const projection = totalMois + moyenne7j * (joursDuMois - joursEcoules);

  // ── Noms des clients : un identifiant technique ne se pilote pas ──
  const idsClients = [...new Set(jour.map(e => e.user_id).filter(Boolean))] as string[];
  const noms = new Map<string, string>();
  if (idsClients.length) {
    const { data: profils } = await supabase
      .from('profiles').select('id, email, company_name, subscription_plan').in('id', idsClients);
    for (const p of profils || []) {
      noms.set((p as any).id, `${(p as any).company_name || (p as any).email} (${(p as any).subscription_plan || '—'})`);
    }
  }

  const parFournisseur = grouper(jour, 'provider');
  const parAgent = grouper(jour, 'agent');
  const parClient = grouper(jour, 'user_id');

  const nonAttribue = parClient.find(([k]) => k === '—')?.[1] ?? 0;
  const partNonAttribuee = totalJour > 0 ? Math.round((nonAttribue / totalJour) * 100) : 0;

  const ligne = (label: string, montant: number, ref?: number) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${label}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums"><b>${eur(montant)}</b></td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#666;font-size:12px">${ref !== undefined ? variation(montant, ref) : ''}</td></tr>`;

  const tableau = (titre: string, lignes: string) =>
    `<h3 style="color:#0c1a3a;margin:22px 0 6px;font-size:15px">${titre}</h3>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px">${lignes}</table>`;

  const veilleParCle = (cle: string) => Object.fromEntries(grouper(veille, cle));
  const vFournisseur = veilleParCle('provider');
  const vAgent = veilleParCle('agent');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:22px">
  <h2 style="color:#0c1a3a;margin:0 0 4px">Coûts du jour — ${maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
  <p style="color:#666;font-size:13px;margin:0 0 18px">Dernières 24 h · comparé à la veille et à la moyenne 7 jours</p>

  <div style="background:#f6f8fc;border-radius:12px;padding:16px;margin-bottom:6px">
    <div style="font-size:30px;font-weight:700;color:#0c1a3a">${eur(totalJour)}</div>
    <div style="color:#666;font-size:13px;margin-top:4px">
      veille ${eur(totalVeille)} (${variation(totalJour, totalVeille)}) ·
      moyenne 7 j ${eur(moyenne7j)} (${variation(totalJour, moyenne7j)})
    </div>
  </div>

  <div style="background:#fff;border:1px solid #e5e9f0;border-radius:12px;padding:14px;margin-bottom:6px">
    <div style="color:#666;font-size:12px">Mois en cours</div>
    <div style="font-size:18px;font-weight:600">${eur(totalMois)} <span style="color:#666;font-weight:400;font-size:14px">→ projection fin de mois <b>${eur(projection)}</b></span></div>
  </div>

  ${tableau('Par fournisseur', parFournisseur.map(([k, v]) => ligne(k, v, vFournisseur[k] ?? 0)).join('') || '<tr><td style="padding:8px;color:#888">aucune dépense</td></tr>')}
  ${tableau('Par agent', parAgent.map(([k, v]) => ligne(k === '—' ? 'non attribué' : k, v, vAgent[k] ?? 0)).join('') || '')}
  ${tableau('Par client', parClient.map(([k, v]) => ligne(k === '—' ? '<i>non attribué</i>' : (noms.get(k) || k.slice(0, 8)), v)).join('') || '')}

  ${partNonAttribuee > 20 ? `<p style="background:#fff7e6;border-left:3px solid #f0a020;padding:10px 12px;font-size:13px;margin-top:16px">
    <b>${partNonAttribuee} % de la dépense n'est rattachée à aucun client.</b>
    Ce sont les traitements globaux (veille de tendances, blog, supervision) ou des chemins d'appel
    où le contexte n'est pas encore posé. Tant que cette part reste élevée, la marge par client est approximative.
  </p>` : ''}

  <p style="color:#888;font-size:11px;margin-top:26px;border-top:1px solid #eee;padding-top:12px">
    Rapport quotidien de pilotage — envoyé tous les jours, y compris quand tout va bien.
    Les alertes de dérive restent séparées.
  </p>
</div>`;

  await sendBrevoCompat({
    sender: { name: 'KeiroAI Pilotage', email: 'contact@keiroai.com' },
    to: [{ email: DESTINATAIRE }],
    subject: `Coûts ${eur(totalJour)} — projection ${eur(projection)} (${maintenant.toLocaleDateString('fr-FR')})`,
    htmlContent: html,
  });

  return NextResponse.json({
    ok: true,
    total_jour: Math.round(totalJour * 100) / 100,
    total_mois: Math.round(totalMois * 100) / 100,
    projection_fin_mois: Math.round(projection * 100) / 100,
    part_non_attribuee_pct: partNonAttribuee,
    fournisseurs: parFournisseur.length,
    clients: parClient.filter(([k]) => k !== '—').length,
  });
}
