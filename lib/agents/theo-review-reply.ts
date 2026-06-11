/**
 * Théo's review-reply generator.
 *
 * Called once per unreplied Google review. Returns either a ready-to-post
 * reply OR an 'escalate' verdict when the review needs a human (negative
 * review, specific complaint, question we can't answer from the dossier).
 *
 * The prompt deliberately REFUSES to invent facts the dossier doesn't
 * cover — we'd rather escalate than apologise for something that didn't
 * happen or promise something the business doesn't actually do.
 *
 * Inputs are shared across all KeiroAI clients (same code), but the
 * replies differ because (dossier, review text) differ per client.
 */

export interface ReviewContext {
  rating: number;              // 1-5
  text: string;                // prospect's review body
  author: string;              // reviewer display name
  created_at: string;          // ISO
  previous_replies?: string[]; // existing replies on the location (tone reference)
}

export interface DossierContext {
  company_name?: string;
  business_type?: string;
  brand_tone?: string;          // 'friendly' | 'formal' | 'casual' | ...
  main_products?: string;
  target_audience?: string;
  city?: string;
  custom_fields?: Record<string, any>;
}

export type ReviewDecision =
  | { action: 'reply'; body: string; rationale: string }
  | { action: 'escalate'; reason: string; draft_for_human?: string };

/**
 * Simple deterministic guard — reviews that clearly need a human aren't
 * worth spending AI tokens on. These always escalate.
 */
function preClassify(ctx: ReviewContext): 'escalate' | 'ok_to_try' {
  const lower = (ctx.text || '').toLowerCase();
  // Founder decision (brief v2 2026-06-11): Théo n'auto-répond QU'aux avis
  // 4-5★. Tout avis < 4★ part en escalade humaine — un avis mitigé ou négatif
  // mal géré = crise client, le risque ne vaut jamais l'automatisation.
  if (ctx.rating < 4) return 'escalate';

  // Hard-escalate signals even on a 4-5★ review (e.g. high rating but mentions
  // a health/legal issue in the text). Human MUST handle these.
  const hardSignals = [
    // légal / litige
    'avocat', 'tribunal', 'plainte', 'procès', 'proces', 'lawsuit', 'litige',
    'menace', 'justice', 'mise en demeure', 'remboursement', 'rembours', 'dédommag', 'dedommag',
    // santé / hygiène / sécurité
    'intox', 'intoxication', 'vomi', 'hospital', 'malade', 'poison', 'hygiène', 'hygiene',
    'allergie', 'allergique', 'blessé', 'blesse', 'blessure', 'cheveu', 'insecte', 'cafard', 'périmé', 'perime',
    // crime / fraude
    'voleur', 'arnaque', 'escroc', 'fraud', 'scam',
    // discrimination / harcèlement / insulte staff
    'raciste', 'racis', 'discrimination', 'harass', 'insulte', 'agressif', 'agression',
    // faux avis
    'faux avis', 'jamais mis les pieds', 'jamais venu', 'jamais été', 'concurrent',
  ];
  if (hardSignals.some(s => lower.includes(s))) return 'escalate';

  return 'ok_to_try';
}

export async function generateReviewReply(
  review: ReviewContext,
  dossier: DossierContext | null,
  ownerUserId: string | null = null,
  supabaseClient: any = null,
): Promise<ReviewDecision> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  // 2026-06-08 — Client typed directives for Théo (language_tone,
  // brand_signature, custom, ...).
  let directivesBlock = '';
  if (ownerUserId && supabaseClient) {
    try {
      const { directiveBlockFor } = await import('@/lib/agents/typed-directives');
      directivesBlock = await directiveBlockFor(supabaseClient, ownerUserId, 'reviews');
    } catch { /* best-effort */ }
  }

  const preCheck = preClassify(review);
  if (preCheck === 'escalate') {
    return {
      action: 'escalate',
      reason: 'Signaux sensibles détectés (légal / santé / accusation grave) — le client doit répondre lui-même.',
    };
  }

  if (!ANTHROPIC_KEY) {
    return { action: 'escalate', reason: 'Clé Anthropic absente.' };
  }

  const ratingLine = review.rating >= 4
    ? '⭐ Avis POSITIF : remercier chaleureusement + citer UN détail précis de son commentaire + petite invitation à revenir.'
    : review.rating === 3
      ? '⭐⭐⭐ Avis MITIGÉ : reconnaître le point positif ET le point d\'amélioration cités, proposer une solution concrète si on en a une dans le dossier, sinon proposer de reprendre contact.'
      : '⚠️ Avis < 4⭐ : NE PAS auto-répondre — renvoyer {"action":"escalate"}. Les avis mitigés/négatifs sont gérés par un humain (jamais de promesse de compensation ou de remboursement automatisée).';

  const dossierBlock = dossier ? [
    `Business : ${dossier.company_name || '?'}`,
    `Type : ${dossier.business_type || '?'}`,
    dossier.main_products ? `Offre : ${dossier.main_products}` : '',
    dossier.brand_tone ? `Ton de marque : ${dossier.brand_tone}` : '',
    dossier.city ? `Ville : ${dossier.city}` : '',
    dossier.custom_fields && Object.keys(dossier.custom_fields).length > 0
      ? `Notes additionnelles : ${JSON.stringify(dossier.custom_fields).substring(0, 500)}`
      : '',
  ].filter(Boolean).join('\n') : '(pas de dossier client — prudence)';

  const pastRepliesBlock = review.previous_replies && review.previous_replies.length > 0
    ? `\n\n=== EXEMPLES DE RÉPONSES PRÉCÉDENTES (pour le ton) ===\n${review.previous_replies.slice(0, 3).map(r => `"${r.substring(0, 300)}"`).join('\n---\n')}`
    : '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: `Tu es Théo, tu réponds aux avis Google au nom du fondateur du business. Jamais de mention KeiroAI, IA ou agent.

${ratingLine}

━━━ QUALITY BAR ABSOLUE (Émotion × Preuve × Autorité — coche 2/3 minimum) ━━━
- ÉMOTION : cite un MOT EXACT du commentaire du client (preuve que tu l'as lu). Sur un avis négatif, reconnaître précisément le ressenti — pas un "désolé pour la gêne occasionnée" générique.
- PREUVE / ACTION CONCRÈTE : sur un avis ≤3⭐, propose une action vérifiable (rappel téléphonique, remboursement, geste commercial, invitation à revenir avec un avantage précis). Vague = échec → escalate plutôt qu'une réponse creuse.
- AUTORITÉ : ton de propriétaire qui connaît son commerce, pas community manager corporate. Tu peux mentionner un détail spécifique du dossier (un plat phare, une procédure, l'équipe) qui rend la réponse authentique.

━━━ INTERDICTIONS ABSOLUES (anti-AI / anti-template) ━━━
- BANNI : "Nous vous remercions chaleureusement", "Toute l'équipe vous remercie", "N'hésitez pas à nous contacter", "Au plaisir de vous revoir prochainement", "Bien cordialement", "Toute notre équipe".
- BANNI : phrases qui pourraient appartenir à n'importe quel commerce ("Votre satisfaction est notre priorité", "Nous mettons tout en œuvre pour…").
- BANNI : mots "IA", "automatisé", "généré", "intelligence artificielle".
- BANNI : minimiser un reproche ("c'est exceptionnel chez nous", "ce n'est pas notre habitude") avant d'avoir reconnu le problème.
- BANNI : copier la formule des previous_replies — varie les ouvertures et les structures pour ne pas donner l'impression de réponses pré-écrites.

━━━ RÈGLES DURES — INTERDICTIONS LÉGALES ABSOLUES (même sur une réponse validée) ━━━
- NE JAMAIS admettre une faute, une responsabilité, ou une erreur du commerce ("nous avons fauté", "c'est de notre faute", "vous avez raison nous avons mal fait"). Reconnaître un RESSENTI ("je comprends votre déception") n'est PAS admettre une faute.
- NE JAMAIS promettre de compensation, remboursement, geste commercial, repas offert, réduction, ou avoir.
- NE JAMAIS mentionner un montant (€, %, gratuité chiffrée).
- NE JAMAIS accuser ou contredire le reviewer, ni mettre en doute sa parole, ni l'accuser d'être un faux client/concurrent.
- En cas de doute sur l'un de ces points → {"action":"escalate"}.
- Ne JAMAIS inventer une offre, un horaire, une personne, un événement qui ne figure pas dans le dossier.
- Si tu ne peux pas répondre honnêtement (info manquante, reproche public à ne pas commenter), réponds UNIQUEMENT : {"action":"escalate","reason":"..."}
- 3 à 6 phrases maximum.
- Signature : prénom seul si le dossier donne un ton "friendly", sinon pas de signature.
- Pas d'emoji sauf si l'avis en contient et que le ton s'y prête (1 max).

Sortie JSON strict :
  {"action":"reply","body":"...","rationale":"pourquoi cette formulation marche"}
  OU
  {"action":"escalate","reason":"...","draft_for_human":"version brouillon à relire"}

=== DOSSIER CLIENT ===
${dossierBlock}
${pastRepliesBlock}

=== AVIS À TRAITER ===
Note : ${review.rating}⭐
Auteur : ${review.author}
Texte : "${(review.text || '').substring(0, 1000)}"${directivesBlock}`,
        messages: [{ role: 'user', content: 'Génère ta décision maintenant en JSON strict.' }],
      }),
    });

    if (!res.ok) {
      return { action: 'escalate', reason: `AI indisponible (HTTP ${res.status}).` };
    }

    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);

    if (parsed?.action === 'reply' && typeof parsed.body === 'string' && parsed.body.trim().length > 10) {
      return {
        action: 'reply',
        body: String(parsed.body).substring(0, 1500).trim(),
        rationale: String(parsed.rationale || '').substring(0, 400),
      };
    }

    if (parsed?.action === 'escalate') {
      return {
        action: 'escalate',
        reason: String(parsed.reason || 'raison non fournie').substring(0, 300),
        draft_for_human: parsed.draft_for_human ? String(parsed.draft_for_human).substring(0, 1000) : undefined,
      };
    }

    return { action: 'escalate', reason: 'Sortie IA mal formatée.' };
  } catch (e: any) {
    return { action: 'escalate', reason: `Erreur IA : ${String(e?.message || e).substring(0, 200)}` };
  }
}
