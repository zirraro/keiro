/**
 * Est-ce que nos modèles répondent encore ?
 *
 * ── Pourquoi cette sonde existe ──
 *
 * Le 14 août 2026, en cherchant la répartition des coûts : ZÉRO appel Anthropic
 * depuis sept jours. Puis depuis trente : le dernier date du 1er août. Test
 * direct sur la clé :
 *
 *     400 — Your credit balance is too low to access the Anthropic API.
 *
 * Le crédit est vide depuis quatorze jours.
 *
 * ── Ce que ça a coûté sans qu'on le voie ──
 *
 * Le routeur (lib/agents/llm-router.ts) applique une décision du fondateur :
 * Hugo (email froid), Jade (DM), Ami et Noah tournent TOUJOURS sur Sonnet,
 * parce que « la nuance ferme la vente ». Léna passe en Sonnet dès qu'un brief
 * touche à l'actualité — c'est-à-dire presque toujours, puisque c'est notre
 * différenciant. Le juge visuel aussi.
 *
 * Or le repli est silencieux par conception : `if (!ANTHROPIC_KEY)` → Gemini,
 * et le coupe-circuit ajouté le 1er août bascule sur Gemini quand le crédit
 * tombe. C'est le bon comportement — mieux vaut livrer en Gemini que ne rien
 * livrer. Ce qui manquait, c'est que quelqu'un le SACHE.
 *
 * Pendant quatorze jours, les quatre agents les plus sensibles à la qualité ont
 * tourné sur le modèle qu'on avait explicitement écarté pour eux. Personne n'a
 * été prévenu, parce que rien ne surveillait une panne qui se répare toute
 * seule en dégradant.
 *
 * ── La leçon, une fois de plus ──
 *
 * Un repli qui fonctionne trop bien devient invisible. Il faut le rendre bruyant
 * quand il dure : une seconde de dégradation est une bonne nouvelle, deux
 * semaines sont une panne.
 */

export interface EtatModele {
  fournisseur: 'anthropic';
  disponible: boolean;
  /** Le message exact du fournisseur, à recopier dans l'alerte. */
  raison?: string;
  /** true quand c'est une question d'argent, pas de code : action fondateur. */
  creditEpuise?: boolean;
}

/**
 * Un appel minimal, qui échoue vite et ne facture rien quand il échoue.
 *
 * On demande un seul token : si le crédit est là, l'appel coûte une fraction de
 * centime ; s'il n'y est pas, l'API refuse avant de facturer quoi que ce soit.
 * Sonder coûte donc moins cher que de découvrir la panne deux semaines plus tard.
 */
export async function sonderAnthropic(): Promise<EtatModele> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return { fournisseur: 'anthropic', disponible: false, raison: 'ANTHROPIC_API_KEY absente de l\'environnement' };
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
      signal: AbortSignal.timeout(15_000),
      // Une sonde n'est pas une dépense d'agent : le compteur global la
      // rangerait sous « inconnu » et polluerait la ventilation par client.
      __keiroDejaCompte: true,
    } as any);

    if (r.ok) return { fournisseur: 'anthropic', disponible: true };

    const corps = await r.text().catch(() => '');
    const creditEpuise = /credit balance|billing|quota/i.test(corps);
    const message = (() => {
      try { return JSON.parse(corps)?.error?.message || corps.slice(0, 200); }
      catch { return corps.slice(0, 200); }
    })();
    return { fournisseur: 'anthropic', disponible: false, raison: `HTTP ${r.status} — ${message}`, creditEpuise };
  } catch (e: any) {
    // Un réseau qui tousse n'est pas un crédit vide : on ne crie pas au loup.
    return { fournisseur: 'anthropic', disponible: false, raison: `injoignable : ${e?.message?.slice(0, 120)}` };
  }
}

/**
 * Le bloc d'alerte — et la distinction entre une panne et une décision.
 *
 * Fondateur, le jour même où la sonde a été écrite : « Anthropic n'a pas de
 * crédit, et en plus c'est très cher, et il faut mettre les sous en avance —
 * c'est compliqué. »
 *
 * Autrement dit : ce n'est pas à réparer, c'est assumé. Une alerte rouge qui
 * répète tous les matins une chose que le fondateur a déjà tranchée n'est plus
 * une alerte, c'est du bruit — et le bruit finit par masquer les vraies.
 *
 * On règle donc CLAUDE_DESACTIVE=1 sur le serveur, et le bloc devient une ligne
 * de rappel discrète : quel étage travaille aujourd'hui, sans rien réclamer.
 */
export function blocModeleIndisponibleHtml(etat: EtatModele | null): string {
  if (!etat || etat.disponible) return '';
  const choisi = process.env.CLAUDE_DESACTIVE === '1';
  const argent = etat.creditEpuise;
  const deepseek = !!(process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY);
  const etageActuel = deepseek
    ? `<strong>DeepSeek v3.2</strong> (compte ByteDance, celui qui paie déjà les images)`
    : `<strong>Gemini Flash</strong> — le modèle des tâches simples`;

  if (choisi) {
    return `
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-left:3px solid #6b7280;border-radius:8px;padding:11px 13px;margin:0 0 14px;">
        <div style="font-size:12px;color:#374151;line-height:1.55;">
          <strong>Claude volontairement hors circuit.</strong> Les agents de vente et de stratégie tournent sur ${etageActuel}.
          ${deepseek ? '' : ' <span style="color:#b91c1c;">Aucune clé ByteDance : le repli est Gemini Flash, en dessous du niveau visé.</span>'}
        </div>
      </div>`;
  }

  return `
      <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:14px;margin:0 0 16px;">
        <strong style="color:#991b1b;font-size:14px;">🚨 ${argent ? 'Crédit Anthropic épuisé' : 'Claude injoignable'} — repli en cours</strong>
        <div style="font-size:12px;color:#7f1d1d;margin-top:6px;line-height:1.55;">
          <code style="background:#fff;padding:2px 5px;border-radius:3px;font-size:11px;">${etat.raison || 'raison inconnue'}</code>
        </div>
        <div style="font-size:12px;color:#7f1d1d;margin-top:8px;line-height:1.55;">
          Concernés : <strong>Hugo</strong> (email froid), <strong>Jade</strong> (DM), <strong>Ami</strong>, <strong>Noah</strong> —
          les quatre routés « toujours Sonnet » — plus <strong>Léna</strong> dès qu'un brief touche à l'actualité,
          et le <strong>juge visuel</strong>. Ils livrent, sur ${etageActuel}.
          ${argent ? '<br>Si c\'est un choix assumé, poser <code>CLAUDE_DESACTIVE=1</code> sur le serveur : ce bloc deviendra une simple ligne de rappel au lieu d\'une alerte quotidienne.' : ''}
        </div>
      </div>`;
}
