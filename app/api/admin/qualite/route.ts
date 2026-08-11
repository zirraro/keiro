import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { noterObjection } from '@/lib/qualite/memoire';

export const runtime = 'nodejs';

/**
 * La mémoire de qualité : la consulter, et surtout l'enrichir d'une objection.
 *
 * ── Pourquoi une route pour ça ──
 *
 * Fondateur : « si on a une objection client, on la prend comme un contrôle
 * qualité du niveau d'après. » Une objection n'arrive jamais par un canal
 * automatique — elle est dite au téléphone, écrite dans un mail, lâchée dans
 * un chat. Sans un endroit où la déposer en dix secondes, elle se perd, et
 * l'erreur se répète chez le client suivant.
 *
 *   GET                       → l'état de la qualité par agent et par tâche
 *   POST {agent, objection}   → enregistre une objection ; elle devient une
 *                               règle injectée dans les prompts de cet agent,
 *                               pour TOUS les clients, dès la génération
 *                               suivante.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function autorise(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

function tablesAbsentes(e: any): boolean {
  return /relation .* does not exist|could not find the table/i.test(String(e?.message || ''));
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = sb();
  const jours = Number(req.nextUrl.searchParams.get('jours') || 30);
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();

  try {
    const { data: verdicts } = await supabase
      .from('qualite_verdicts')
      .select('agent, tache, note, note_apres, reecrit, bloque, defauts')
      .gte('created_at', depuis).limit(5000);

    const par: Record<string, { n: number; somme: number; reecrits: number; bloques: number; defauts: Record<string, number> }> = {};
    for (const v of verdicts || []) {
      const cle = `${v.agent}/${v.tache}`;
      const e = (par[cle] ||= { n: 0, somme: 0, reecrits: 0, bloques: 0, defauts: {} });
      e.n++; e.somme += Number(v.note) || 0;
      if (v.reecrit) e.reecrits++;
      if (v.bloque) e.bloques++;
      for (const d of (v.defauts || [])) {
        const k = String(d).slice(0, 120);
        e.defauts[k] = (e.defauts[k] || 0) + 1;
      }
    }

    const lignes = Object.entries(par).map(([cle, e]) => ({
      tache: cle,
      controles: e.n,
      note_moyenne: e.n ? Math.round((e.somme / e.n) * 10) / 10 : null,
      // Le taux de réécriture est l'indicateur qui compte : il dit combien de
      // fois le premier jet n'était pas au niveau. C'est lui qui doit baisser
      // à mesure que la mémoire enrichit les prompts.
      taux_reecriture_pct: e.n ? Math.round((e.reecrits / e.n) * 100) : 0,
      retenus: e.bloques,
      defaut_principal: Object.entries(e.defauts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    })).sort((a, b) => b.controles - a.controles);

    const { data: objections } = await supabase
      .from('qualite_objections')
      .select('agent, tache, objection, regle, created_at')
      .order('created_at', { ascending: false }).limit(30);

    return NextResponse.json({ ok: true, jours, par_tache: lignes, objections });
  } catch (e: any) {
    if (tablesAbsentes(e)) {
      return NextResponse.json({
        ok: false, error: 'tables_absentes',
        message: "La mémoire de qualité s'installe au prochain déploiement (migration 20260811_qualite_partagee.sql).",
      }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.agent || !body.objection) {
    return NextResponse.json({ ok: false, error: 'agent et objection requis' }, { status: 400 });
  }

  const r = await noterObjection(sb(), {
    agent: body.agent, tache: body.tache, userId: body.user_id,
    objection: body.objection, regle: body.regle, partagee: body.partagee,
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.motif }, { status: 500 });
  return NextResponse.json({
    ok: true,
    message: `Retenu. Cette règle est injectée dès la prochaine génération de ${body.agent}${body.partagee === false ? ' pour ce client' : ', pour tous les clients'}.`,
  });
}
