/**
 * Contrôle éditorial d'un post AVANT publication : l'image, la légende et les
 * hashtags racontent-ils la même chose ?
 *
 * Pourquoi ce module existe (fondateur, 2026-07-31) : « on voit une flèche sur
 * le dernier post, aucun intérêt réel toute seule sur l'image, en plus en
 * description on parle d'un restaurateur lyonnais mais aucun lien ».
 *
 * Le contrôle qualité existant couvrait deux choses et pas la troisième :
 *   • lib/visuals/image-qa      → la qualité TECHNIQUE (net, sans texte, sans
 *                                 artefact) ;
 *   • lib/validators/visual-coherence → la DIVERSITÉ (pas deux fois le même
 *                                 visuel, palette qui ne tourne pas en rond) ;
 *   • personne ne vérifiait que l'image PARLE DU MÊME SUJET que la légende.
 *
 * Une image techniquement irréprochable et jamais utilisée peut donc être
 * complètement hors-sujet : c'est exactement le cas de la flèche néon.
 *
 * Cinq motifs de rejet :
 *
 *   1. CLIENT INVENTÉ — la légende présente un client identifiable (« Marie,
 *      fleuriste à Lyon », « Les Fleurs de Juliette ») comme un cas réel.
 *      Nommer un client qui n'existe pas engage la marque, et le premier
 *      prospect qui demande la référence met le vendeur en défaut.
 *
 *   2. CHIFFRE INVRAISEMBLABLE — un ordre de grandeur aberrant (« +500% en
 *      2 semaines »). Arbitrage fondateur du 31/07 : un ordre de grandeur
 *      illustratif et plausible ne bloque PAS — « on sait que plus de clients
 *      augmente le chiffre, ça doit juste pas être aberrant ».
 *
 *   3. HORS-SUJET — l'image n'illustre pas le propos de la légende.
 *
 *   4. IMAGE VIDE — pictogramme ou symbole abstrait isolé (flèche, ampoule,
 *      engrenage, point d'interrogation) sur un fond dégradé. Ça ne montre
 *      rien, ça n'apprend rien, ça ne donne envie de rien. Le lecteur scrolle.
 *
 *   5. HASHTAGS À CÔTÉ — les hashtags annoncent un sujet absent du post.
 *
 *   6. LIEN À L'ACTUALITÉ FORCÉ — le post s'accroche à un événement sans
 *      rapport réel. Test : si la phrase marche encore en changeant de métier,
 *      le lien est forcé. Un lien opportuniste fait plus de mal que pas
 *      d'actualité du tout.
 *
 *   7. ACCROCHE MOLLE — la première ligne ne retient pas. Elle est notée à
 *      part (hookScore) : sur Instagram elle est seule visible avant « plus »,
 *      sur TikTok elle joue dans les trois premières secondes. Elle ne bloque
 *      pas seule mais pèse sur la note globale.
 *
 * Le verdict porte DEUX jugements séparés : le post est-il publiable en
 * l'état, et l'image mérite-t-elle d'être republiée sous une autre légende.
 * Seule l'image vide est irrécupérable ; tous les autres défauts se corrigent
 * en réécrivant le texte, ce qui évite de jeter un visuel réussi.
 *
 * On demande au modèle de DÉCRIRE l'image avant de juger : un jugement rendu
 * sans description explicite se contente trop souvent de valider.
 */

export interface CoherenceUnavailable { unavailableReason: 'billing' }

export interface CoherenceVerdict {
  /** Publiable en l'état ? */
  pass: boolean;
  /** 0-10 — cohérence globale entre image, légende et hashtags. */
  score: number;
  /** Ce que le modèle voit RÉELLEMENT sur l'image. */
  imageDescription: string;
  /** Motifs de rejet, du plus grave au moins grave. */
  reasons: string[];
  /**
   * L'image, jugée SEULE, mérite-t-elle d'être publiée ?
   *
   * Fondateur 2026-07-31 : « les visuels qui passent très bien le contrôle
   * qualité peuvent être réutilisés malgré les mauvaises descriptions, à
   * changer, et hashtags aussi ». On sépare donc les deux jugements : une
   * bonne image avec une mauvaise légende n'est pas un post à jeter, c'est
   * une légende à réécrire.
   */
  imageUsable: boolean;
  /** Drapeaux détaillés, utiles pour les statistiques de rejet. */
  flags: {
    /** Un client identifié et inventé, présenté comme réel. */
    inventedClient: boolean;
    /** Un chiffre ou une affirmation invraisemblable. */
    implausibleClaim: boolean;
    offTopic: boolean;
    emptyVisual: boolean;
    hashtagMismatch: boolean;
    /** Le post s'accroche à une actualité ou un événement sans lien réel. */
    forcedNewsLink: boolean;
    /** La première ligne ne retient pas — le lecteur passe. */
    weakHook: boolean;
  };
  /** 0-10 — force de l'accroche seule (première ligne, 3 premières secondes). */
  hookScore: number;
}

const MODEL = 'claude-sonnet-4-6';

/** En dessous, le post ne part pas. Relevé de 5 à 7 : on est plus exigeant. */
export const COHERENCE_PASS_SCORE = 7;

const SYSTEM = `Tu es directeur artistique et rédacteur en chef d'un compte de marque sur les réseaux sociaux. On te soumet UN post prêt à partir : son image, sa légende, ses hashtags.

Ta mission : dire s'il part ou s'il reste au placard. Sois EXIGEANT — mieux vaut ne rien publier qu'un post qui fait amateur.

COMMENCE TOUJOURS par décrire ce que tu vois vraiment sur l'image, factuellement, sans te laisser influencer par la légende. Cette description conditionne tout le reste.

Puis évalue quatre points :

1. CLIENT INVENTÉ ET IDENTIFIÉ
   La légende présente-t-elle un client IDENTIFIABLE — un prénom, un nom de commerce, une ville précise — comme un cas réel et vérifiable ?
   À rejeter : « Marie, fleuriste à Lyon, a doublé ses réservations », « Les Fleurs de Juliette ont explosé leurs commandes », « on a interrogé 847 commerçants ».
   C'est le seul motif de ce bloc qui bloque : nommer un client qui n'existe pas engage la marque, et le premier prospect qui demande la référence met le vendeur en défaut.

   NE bloque PAS — un ordre de grandeur illustratif est légitime, une vente amène du chiffre, tout le monde le sait :
     • un cas SANS identité (« un fleuriste qui passe de 2 à 8 publications par semaine ») ;
     • un ordre de grandeur plausible sur un mécanisme évident (« plus de visibilité, plus de clients, plus de chiffre ») ;
     • une projection ou une hypothèse (« si tu publies 3 fois par semaine… ») ;
     • un conseil, une promesse générale.

2. CHIFFRE INVRAISEMBLABLE
   Le chiffre annoncé est-il ABERRANT — hors de toute proportion pour un commerce de proximité ?
   À rejeter : « +500% en 2 semaines », « ×10 de chiffre d'affaires », « 50 000 abonnés en un mois », « 12h économisées par semaine » sur un outil qui publie des posts.
   Repère : au-delà d'un doublement sur quelques semaines, ou d'un gain de temps supérieur à 3-4h par semaine, ça ne passe plus le test du bon sens.
   Un ordre de grandeur crédible (+20%, +30%, « deux fois plus de visibilité ») passe sans problème.

3. HORS-SUJET
   L'image illustre-t-elle le propos de la légende ? Un lien lointain ou décoratif ne suffit pas : un lecteur doit comprendre pourquoi CETTE image accompagne CE texte.

4. IMAGE VIDE
   L'image se réduit-elle à un pictogramme ou un symbole abstrait isolé — flèche, ampoule, engrenage, point d'interrogation, forme géométrique — posé sur un fond uni ou dégradé ?
   Ce type d'image ne montre rien, n'apprend rien, ne donne envie de rien. Elle est rejetée même si elle est jolie et techniquement parfaite.

   ⚠️ NE CONFONDS PAS « abstrait » et « sans produit ». Tous les métiers n'ont pas un objet à photographier, et le sujet concret change selon l'activité :
     • Commerce avec produit (restaurant, boulangerie, boutique, fleuriste, caviste) → le plat, l'étal, la vitrine, le produit en main.
     • Service à la personne (coiffeur, institut, ongles, coach, kiné) → le geste professionnel, le résultat sur la personne, le salon, la cabine.
     • Artisan (plombier, menuisier, électricien, garage, bâtiment) → les mains au travail, l'outil, le chantier, l'avant/après d'une réparation, le véhicule d'intervention.
     • PME, B2B, profession libérale (comptable, consultant, agence, bureau d'études, industrie) → l'atelier, la ligne de production, l'équipe en situation, un poste de travail, un document ou un écran LISIBLE, un graphique dont on comprend l'axe.
   Pour un service ou une PME, une personne au travail, un lieu professionnel, un outil ou un écran lisible sont des sujets PARFAITEMENT concrets. Ne pénalise jamais l'absence d'objet physique : ce qui compte est qu'on identifie une activité réelle.
   Le seul vrai critère : l'image montre-t-elle une SCÈNE ou un OBJET identifiable, ou juste un symbole décoratif ?

5. HASHTAGS À CÔTÉ
   Les hashtags annoncent-ils un sujet, un métier ou un lieu absent du post ?

6. LIEN AVEC L'ACTUALITÉ — FORT OU FORCÉ ?
   Si le post s'appuie sur une actualité, un événement, une saison ou une tendance (Tour de France, rentrée, canicule, sortie d'un film, trend TikTok), demande-toi si le lien tient VRAIMENT.
   ✅ LIEN FORT — l'actualité et le métier se rejoignent naturellement, et le rapprochement apporte quelque chose :
      « Canicule annoncée : nos glaces artisanales sortent du congélateur à -18°, elles tiennent le trajet jusqu'à chez toi. »
      « Rentrée : on garde le pain au levain au chaud jusqu'à 19h pour ceux qui sortent tard du bureau. »
   ⛔ LIEN FORCÉ — l'actualité sert de prétexte, on l'aurait collée à n'importe quel métier :
      « Le Tour de France passe. Nous aussi on avance ! Découvre nos prestations. »
      « Comme les JO, on vise l'excellence. »
   Le test : si tu remplaces le métier par un autre et que la phrase marche encore, le lien est forcé. Un lien forcé fait plus de mal que pas d'actualité du tout — le lecteur sent l'opportunisme.
   Ne coche ce défaut QUE si le post invoque réellement une actualité. Un post intemporel n'est pas concerné.

7. FORCE DE L'ACCROCHE
   La PREMIÈRE ligne décide de tout : sur Instagram elle est seule visible avant « plus », sur TikTok elle joue dans les 3 premières secondes.
   ✅ Une accroche forte pose une tension, une surprise, un chiffre concret, une question qui pique, ou nomme le problème du lecteur.
   ⛔ Une accroche faible commence par une généralité (« Le marketing digital est essentiel »), se présente (« Chez nous, nous... »), ou annonce ce que le post va dire au lieu de le dire.
   Note-la à part, sur 10.

NOTE GLOBALE sur 10 (cohérence image ↔ légende ↔ hashtags, force de l'accroche, justesse du lien avec l'actualité) :
  9-10 : image forte et parfaitement raccord, on publie sans hésiter
  7-8  : cohérent et propre, ça peut partir
  5-6  : le lien existe mais reste faible, ça sent le remplissage
  3-4  : hors-sujet ou image sans contenu
  0-2  : aucun rapport entre l'image et le texte
  Un lien à l'actualité forcé plafonne la note à 5. Une accroche molle coûte 2 points.

NOTE DE L'IMAGE SEULE, indépendamment de la légende :
  Cette image mérite-t-elle d'être publiée avec une AUTRE légende, mieux écrite ?
  Réponds oui si elle est nette, concrète, montre un sujet identifiable et donne envie de s'arrêter.
  Réponds non si elle est vide (pictogramme abstrait), floue, ratée, ou porte du texte illisible.
  Cette question est INDÉPENDANTE de la légende actuelle : une belle photo de boulangerie sous une légende hors-sujet reçoit oui.

Réponds UNIQUEMENT via l'outil.`;

const TOOL = {
  name: 'verdict',
  description: 'Verdict éditorial sur le post',
  input_schema: {
    type: 'object' as const,
    properties: {
      image_description: { type: 'string', description: "Ce que montre l'image, factuellement, en une à deux phrases" },
      score: { type: 'number', description: 'Cohérence globale sur 10' },
      invented_client: { type: 'boolean', description: 'Un client identifiable (prénom, nom de commerce, ville) est présenté comme réel alors qu\'il est inventé' },
      implausible_claim: { type: 'boolean', description: 'Un chiffre ou une affirmation aberrante, hors de toute proportion' },
      image_usable: { type: 'boolean', description: "L'image mérite d'être publiée avec une autre légende" },
      off_topic: { type: 'boolean', description: "L'image n'illustre pas le propos" },
      empty_visual: { type: 'boolean', description: 'Pictogramme ou symbole abstrait isolé, sans contenu' },
      hashtag_mismatch: { type: 'boolean', description: 'Les hashtags annoncent un sujet absent' },
      forced_news_link: { type: 'boolean', description: "Le post s'accroche à une actualité ou un événement sans lien réel avec le métier" },
      hook_score: { type: 'number', description: "Force de la première ligne sur 10 : retient-elle le lecteur ?" },
      reasons: { type: 'array', items: { type: 'string' }, description: 'Motifs de rejet en français, du plus grave au moins grave. Vide si le post est bon.' },
    },
    required: ['image_description', 'score', 'invented_client', 'implausible_claim', 'image_usable', 'off_topic', 'empty_visual', 'hashtag_mismatch', 'forced_news_link', 'hook_score', 'reasons'],
  },
};

async function fetchImageBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    // Un fichier minuscule n'est pas une vraie image : inutile de payer un appel.
    if (buf.length < 2000) return null;
    // On se fie aux octets, pas à l'extension : le parc contient des JPEG
    // nommés .png, et Anthropic refuse un media_type qui ne correspond pas.
    const isPng = buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG';
    const isWebp = buf.subarray(8, 12).toString('latin1') === 'WEBP';
    const mediaType = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    return { data: buf.toString('base64'), mediaType };
  } catch {
    return null;
  }
}

/**
 * Juge un post. Renvoie `null` si le contrôle n'a PAS pu s'exécuter (clé
 * absente, image illisible, API en erreur) — à distinguer d'un rejet. Un
 * contrôle qui échoue ne doit jamais faire passer un post pour validé, ni
 * bloquer tout un calendrier parce qu'une image a disparu.
 */
export async function assessPostCoherence(input: {
  visualUrl: string;
  caption: string;
  hashtags?: string[] | null;
  platform?: string;
  format?: string;
}): Promise<CoherenceVerdict | CoherenceUnavailable | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.visualUrl) return null;

  const img = await fetchImageBase64(input.visualUrl);
  if (!img) return null;

  const tags = (input.hashtags || []).join(' ') || '(aucun)';
  const contexte = [
    `Réseau : ${input.platform || 'instagram'} · format : ${input.format || 'post'}`,
    '',
    'LÉGENDE :',
    (input.caption || '(vide)').slice(0, 2000),
    '',
    `HASHTAGS : ${tags}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'verdict' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
            { type: 'text', text: contexte },
          ],
        }],
      }),
    });
    if (!res.ok) {
      // Un contrôle muet ressemble à un contrôle qui passe : on trace la
      // cause. Un 429 en rafale doit se voir, sinon on croit à tort que les
      // images sont illisibles et on laisse filer des posts non vérifiés.
      const corps = await res.text().catch(() => '');
      console.warn(`[QC] contrôle refusé (${res.status}) : ${corps.slice(0, 200)}`);
      // Panne de FACTURATION : ce n'est pas un incident passager, ça dure tant
      // que personne ne recharge. Publier à l'aveugle pendant ce temps
      // reviendrait à désactiver le contrôle sans que personne s'en aperçoive.
      // On le signale explicitement pour que l'appelant retienne le post.
      if (res.status === 400 && /credit balance|billing/i.test(corps)) {
        return { unavailableReason: 'billing' } as any;
      }
      return null;
    }
    const j = await res.json();
    const use = (j.content || []).find((c: any) => c.type === 'tool_use');
    if (!use?.input) return null;
    const v = use.input;

    const flags = {
      inventedClient: !!v.invented_client,
      implausibleClaim: !!v.implausible_claim,
      offTopic: !!v.off_topic,
      emptyVisual: !!v.empty_visual,
      hashtagMismatch: !!v.hashtag_mismatch,
      forcedNewsLink: !!v.forced_news_link,
      weakHook: (Number(v.hook_score) || 0) < 6,
    };
    const hookScore = Math.max(0, Math.min(10, Number(v.hook_score) || 0));
    const score = Math.max(0, Math.min(10, Number(v.score) || 0));

    // Ce qui bloque la publication EN L'ÉTAT.
    // Un client inventé et nommé bloque toujours ; un ordre de grandeur
    // illustratif ne bloque plus (arbitrage fondateur du 31/07 : « les %
    // inventés ne sont pas le plus grave, ça doit juste pas être aberrant »).
    // Un lien à l'actualité forcé bloque au même titre qu'un hors-sujet :
    // dans les deux cas le post affirme une connexion qui n'existe pas, et le
    // lecteur le sent immédiatement. Une accroche molle ne bloque pas seule —
    // elle pèse déjà sur la note globale.
    const pass = !flags.inventedClient
      && !flags.implausibleClaim
      && !flags.offTopic
      && !flags.emptyVisual
      && !flags.forcedNewsLink
      && score >= COHERENCE_PASS_SCORE;

    return {
      pass,
      // Une image vide n'est jamais récupérable ; tout le reste des défauts
      // (hors-sujet, hashtags, texte) se corrige en réécrivant la légende.
      imageUsable: !!v.image_usable && !flags.emptyVisual,
      score,
      hookScore,
      imageDescription: String(v.image_description || '').slice(0, 400),
      reasons: Array.isArray(v.reasons) ? v.reasons.map((r: any) => String(r).slice(0, 240)) : [],
      flags,
    };
  } catch {
    return null;
  }
}
