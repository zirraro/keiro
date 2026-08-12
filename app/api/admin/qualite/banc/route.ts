import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { controlerSortie } from '@/lib/qualite/controle-sortie';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Le banc d'essai : quelle est la qualité de ce que les agents ont RÉELLEMENT
 * envoyé aux clients ?
 *
 * ── Pourquoi un banc plutôt que déclencher les agents ──
 *
 * Fondateur, 2026-08-12 : « lance aussi d'autres actions à contrôler pour les
 * six agents… le but c'est de mesurer la qualité de l'agent contenu et des
 * autres pour qu'ils soient super efficaces et pertinents pour les clients. »
 *
 * Déclencher les agents pour remplir un tableau enverrait de VRAIS emails de
 * prospection, de VRAIES réponses en messages privés, et de VRAIES réponses
 * publiques sous des avis Google. Des actions irréversibles, chez de vraies
 * personnes, pour produire une statistique.
 *
 * Or la matière existe déjà : ces agents ont produit des centaines de textes
 * ces dernières semaines. On les repasse devant le contrôle qualité — le même
 * barème que celui qui filtre désormais les envois — et on obtient la mesure
 * sans rien envoyer.
 *
 * C'est aussi plus juste : on mesure ce que le client A REÇU, pas ce qu'un
 * agent produirait dans un test.
 *
 *   GET  → diagnostic : générations récentes et mesures associées
 *   POST → passe les sorties réelles de chaque agent au contrôle
 *          body { heures?: 168, parAgent?: 5 }
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function autorise(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = sb();
  const heures = Number(req.nextUrl.searchParams.get('heures') || 6);
  const depuis = new Date(Date.now() - heures * 3600000).toISOString();

  const { data: crees } = await supabase.from('content_calendar')
    .select('platform, format, status, hook, visual_url, video_url, source, created_at')
    .gte('created_at', depuis).order('created_at', { ascending: false }).limit(30);

  const { data: mesures } = await supabase.from('agent_logs')
    .select('data, created_at').eq('action', 'qa_visual_tentatives')
    .gte('created_at', depuis).limit(50);

  const { data: retenus } = await supabase.from('agent_logs')
    .select('data, created_at').eq('action', 'qc_portail_retenu')
    .gte('created_at', depuis).limit(30);

  return NextResponse.json({
    ok: true, heures,
    generations: (crees || []).map((p: any) => ({
      quand: String(p.created_at).slice(11, 16),
      reseau: p.platform, format: p.format, statut: p.status,
      visuel: !!p.visual_url, video: !!p.video_url,
      recycle: String(p.source || '').includes('recycl'),
      accroche: String(p.hook || '').slice(0, 70),
    })),
    mesures_qualite: (mesures || []).map((m: any) => ({
      reseau: m.data?.reseau, premier_coup: m.data?.premier_coup,
      essais: m.data?.nb_tentatives, scores: m.data?.scores,
      recycle: m.data?.recycle, defauts: m.data?.defauts_premier,
    })),
    retenus_par_le_controle: (retenus || []).map((r: any) => ({
      reseau: r.data?.reseau, code: r.data?.code, motif: String(r.data?.diagnostic || '').slice(0, 120),
    })),
  });
}

/**
 * Chaque source déclare OÙ trouver le texte réellement envoyé, et sous quel
 * barème le juger. Sans cette table, on jugerait un message privé avec les
 * exigences d'un contrat de travail.
 */
const SOURCES: Array<{
  agent: string; tache: string; libelle: string;
  table: 'agent_logs' | 'crm_activities';
  actions?: string[];
  extraire: (row: any) => { texte: string; contexte?: string } | null;
}> = [
  {
    agent: 'email', tache: 'email_prospection', libelle: 'Emails de Hugo',
    table: 'crm_activities',
    extraire: (r) => {
      const d = r.data || {};
      const corps = d.body || d.message || r.description || '';
      return corps.length > 60 ? { texte: corps, contexte: `Objet : ${d.subject || '(sans objet)'}` } : null;
    },
  },
  {
    agent: 'gmaps', tache: 'avis_google', libelle: 'Réponses aux avis (Théo)',
    table: 'agent_logs', actions: ['review_reply_sent'],
    extraire: (r) => {
      const d = r.data || {};
      const corps = d.reply || d.body || d.reponse || '';
      return corps.length > 30 ? { texte: corps, contexte: d.review_text ? `Avis : « ${String(d.review_text).slice(0, 300)} »` : undefined } : null;
    },
  },
  {
    agent: 'dm_instagram', tache: 'dm_reponse', libelle: 'Messages privés (Jade)',
    table: 'agent_logs', actions: ['dm_auto_reply_sent', 'dm_sent', 'auto_reply_sent'],
    extraire: (r) => {
      const d = r.data || {};
      const corps = d.reply || d.message || d.texte || '';
      return corps.length > 20 ? { texte: corps, contexte: d.incoming ? `Message reçu : « ${String(d.incoming).slice(0, 300)} »` : undefined } : null;
    },
  },
  {
    agent: 'whatsapp', tache: 'whatsapp_reponse', libelle: 'Réponses WhatsApp (Stella)',
    table: 'agent_logs', actions: ['whatsapp_reply_sent', 'whatsapp_sent'],
    extraire: (r) => {
      const d = r.data || {};
      const corps = d.message || d.reply || '';
      return corps.length > 20 ? { texte: corps } : null;
    },
  },
  {
    agent: 'rh', tache: 'document_juridique', libelle: 'Documents de Sara',
    table: 'agent_logs', actions: ['chat_reply', 'document_generated'],
    extraire: (r) => {
      const d = r.data || {};
      const corps = d.reply || d.document || '';
      return corps.length > 800 ? { texte: corps } : null;
    },
  },
  {
    agent: 'comptable', tache: 'document_juridique', libelle: 'Documents de Louis',
    table: 'agent_logs', actions: ['chat_reply', 'document_generated'],
    extraire: (r) => {
      const d = r.data || {};
      const corps = d.reply || d.document || '';
      return corps.length > 800 ? { texte: corps } : null;
    },
  },
];

export async function POST(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = sb();
  const body = await req.json().catch(() => ({}));
  const heures = Number(body.heures) > 0 ? Number(body.heures) : 168;
  // Un échantillon suffit : on cherche le NIVEAU, pas l'exhaustivité. Cinq
  // textes par agent donnent déjà une moyenne parlante, pour quelques centimes.
  const parAgent = Math.min(10, Number(body.parAgent) > 0 ? Number(body.parAgent) : 5);
  const depuis = new Date(Date.now() - heures * 3600000).toISOString();

  const resultats: any[] = [];

  for (const src of SOURCES) {
    if (Array.isArray(body.agents) && body.agents.length && !body.agents.includes(src.agent)) continue;

    let lignes: any[] = [];
    try {
      if (src.table === 'crm_activities') {
        const { data } = await supabase.from('crm_activities')
          .select('data, description, created_at').eq('type', 'email')
          .gte('created_at', depuis).order('created_at', { ascending: false }).limit(parAgent * 4);
        lignes = data || [];
      } else {
        const { data } = await supabase.from('agent_logs')
          .select('data, created_at, user_id').eq('agent', src.agent).in('action', src.actions || [])
          .gte('created_at', depuis).order('created_at', { ascending: false }).limit(parAgent * 4);
        lignes = data || [];
      }
    } catch { /* source indisponible */ }

    const echantillon = lignes.map(src.extraire).filter(Boolean).slice(0, parAgent) as Array<{ texte: string; contexte?: string }>;

    if (!echantillon.length) {
      resultats.push({ agent: src.agent, libelle: src.libelle, controles: 0, message: 'aucune sortie réelle trouvée sur la période' });
      continue;
    }

    const notes: number[] = [];
    const defauts: string[] = [];
    let sousLeSeuil = 0;
    for (const e of echantillon) {
      const v = await controlerSortie({ agent: src.agent, tache: src.tache, contenu: e.texte, contexte: e.contexte });
      notes.push(v.note);
      if (v.note < 7) sousLeSeuil++;
      for (const d of v.defauts.slice(0, 2)) defauts.push(d);
    }

    resultats.push({
      agent: src.agent, libelle: src.libelle, tache: src.tache,
      controles: notes.length,
      note_moyenne: Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10,
      note_min: Math.min(...notes),
      sous_le_seuil: sousLeSeuil,
      defauts_releves: [...new Set(defauts)].slice(0, 5),
    });
  }

  return NextResponse.json({ ok: true, heures, echantillon_par_agent: parAgent, resultats });
}
