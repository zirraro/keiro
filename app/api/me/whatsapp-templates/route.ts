import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  WA_TEMPLATES, getTemplatesForBusiness, templateInLang, META_LANG_CODE,
  type WaLang, type WaTemplate,
} from '@/lib/agents/whatsapp-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Le catalogue de modèles WhatsApp d'UN client : son métier, sa langue, ses valeurs.
 *
 * ── Ce que le fondateur veut, et la nuance qui la rend possible ──
 *
 * « On doit pouvoir dans le dashboard de Stella sélectionner les templates et
 * les personnaliser directement depuis Keiro. » Et : « si c'est un nouveau
 * modèle et pas un modèle déjà utilisé, il y a un délai d'acceptation, donc on
 * dirige vers nos templates à personnaliser vu que l'utilisation est directe. »
 *
 * L'intuition est juste, avec une correction technique qui change la
 * conception : Meta renvoie en revue tout modèle dont on modifie le CORPS,
 * même approuvé. « Personnaliser » ne peut donc pas signifier réécrire le
 * texte — sinon on retombe dans le délai qu'on cherchait à éviter.
 *
 * Ce qui est immédiat, c'est de remplir les VARIABLES : `{{1}}` devient le nom
 * du commerce, `{{4}}` ses horaires. Le corps reste celui que Meta a approuvé,
 * l'envoi part sans attendre, et le client a bien un message qui lui
 * ressemble. C'est la personnalisation utile.
 *
 * Cette route rend donc, pour chaque modèle : son texte dans la langue voulue,
 * ses variables décrites une par une, les valeurs déjà enregistrées par le
 * client, un aperçu rendu — et son statut réel chez Meta, parce qu'un modèle
 * qu'on propose sans savoir s'il est approuvé est une promesse en l'air.
 *
 *   GET  ?lang=fr            → le catalogue de son métier, puis tout le reste
 *   POST { name, valeurs }   → enregistre ses valeurs par défaut
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Le statut Meta de chaque `nom|langue`, ou une carte vide si on ne peut pas lire. */
async function statutsMeta(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const waba = process.env.WHATSAPP_WABA_ID || '1021417964095758';
  if (!token) return out;
  try {
    let url = `${GRAPH}/${waba}/message_templates?limit=200&fields=name,language,status`;
    for (let p = 0; p < 4 && url; p++) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const j: any = await r.json();
      if (!Array.isArray(j?.data)) break;
      for (const t of j.data) out.set(`${t.name}|${t.language}`, t.status);
      url = j.paging?.next || '';
    }
  } catch { /* sans statut, on rend le catalogue quand même */ }
  return out;
}

/** Remplace {{1}}, {{2}}… par les valeurs du client, ou par la description à défaut. */
function apercu(corps: string, params: string[], valeurs: Record<string, string>): string {
  return corps.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const i = Number(n) - 1;
    return valeurs[String(n)] || `⟨${params[i] || `valeur ${n}`}⟩`;
  });
}

export async function GET(req: NextRequest) {
  const supabase = sb();
  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ ok: false, error: 'user_id requis' }, { status: 400 });

  const langue = (req.nextUrl.searchParams.get('lang') || 'fr') as WaLang;

  // Le métier et les valeurs déjà posées par ce client.
  let metier: string | null = null;
  let valeurs: Record<string, Record<string, string>> = {};
  try {
    const { data: d } = await supabase
      .from('business_dossiers').select('business_type').eq('user_id', userId).maybeSingle();
    metier = (d as any)?.business_type || null;
    const { data: cfg } = await supabase
      .from('org_agent_configs').select('config').eq('user_id', userId).eq('agent_id', 'whatsapp').maybeSingle();
    valeurs = ((cfg as any)?.config?.template_valeurs) || {};
  } catch { /* le catalogue reste utile sans dossier */ }

  const statuts = await statutsMeta();
  const duMetier = new Set(getTemplatesForBusiness(metier).map((t) => t.name));

  const vus = new Set<string>();
  const catalogue: any[] = [];
  for (const [famille, v] of Object.entries(WA_TEMPLATES)) {
    for (const t of v.templates as WaTemplate[]) {
      if (vus.has(t.name)) continue;
      vus.add(t.name);
      const corps = templateInLang(t, langue).body;
      const mesValeurs = valeurs[t.name] || {};
      const statut = statuts.get(`${t.name}|${META_LANG_CODE[langue]}`) || 'ABSENT';
      catalogue.push({
        nom: t.name,
        libelle: t.label,
        famille,
        pour_mon_metier: duMetier.has(t.name),
        categorie: t.category,
        corps,
        variables: t.params.map((p, i) => ({ numero: i + 1, description: p, valeur: mesValeurs[String(i + 1)] || '' })),
        apercu: apercu(corps, t.params, mesValeurs),
        statut_meta: statut,
        // Le point qui décide de l'expérience : approuvé = envoi immédiat.
        utilisable_maintenant: statut === 'APPROVED',
      });
    }
  }

  // Les modèles de son métier d'abord : c'est ce qu'il cherche.
  catalogue.sort((a, b) => (b.pour_mon_metier ? 1 : 0) - (a.pour_mon_metier ? 1 : 0));

  return NextResponse.json({
    ok: true,
    langue,
    metier,
    total: catalogue.length,
    utilisables_maintenant: catalogue.filter((c) => c.utilisable_maintenant).length,
    /**
     * Le message à afficher au client qui veut écrire son propre modèle.
     * Il n'est pas décoratif : c'est lui qui évite la déception d'un envoi
     * refusé, et qui oriente vers ce qui part tout de suite.
     */
    regle_meta: "Un modèle déjà approuvé part immédiatement. Réécrire son texte le renvoie en revue chez Meta (jusqu'à 24 h, parfois refusé). Personnalisez les variables : le message porte vos informations sans aucun délai.",
    catalogue,
  });
}

export async function POST(req: NextRequest) {
  const supabase = sb();
  const body = await req.json().catch(() => ({}));
  const userId = body?.user_id;
  const nom = body?.nom;
  const nouvelles = body?.valeurs;
  if (!userId || !nom || typeof nouvelles !== 'object') {
    return NextResponse.json({ ok: false, error: 'user_id, nom et valeurs requis' }, { status: 400 });
  }

  const { data: cfg } = await supabase
    .from('org_agent_configs').select('id, config').eq('user_id', userId).eq('agent_id', 'whatsapp').maybeSingle();

  const config = { ...((cfg as any)?.config || {}) };
  config.template_valeurs = { ...(config.template_valeurs || {}), [nom]: nouvelles };

  if ((cfg as any)?.id) {
    await supabase.from('org_agent_configs').update({ config }).eq('id', (cfg as any).id);
  } else {
    await supabase.from('org_agent_configs').insert({ user_id: userId, agent_id: 'whatsapp', config });
  }

  return NextResponse.json({ ok: true, nom, valeurs: nouvelles });
}
