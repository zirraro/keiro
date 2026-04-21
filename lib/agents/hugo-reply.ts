/**
 * Hugo's inbound-reply pipeline.
 *
 * When a prospect actually replies to one of Hugo's sequence emails we
 * want him to answer back — personally, accurately, referencing Léo's
 * enrichment data — not just park a draft and wait.
 *
 * Flow:
 *   1. Load the prospect's full CRM record (everything Léo stored during
 *      enrichment: google_rating, reviews, website, bio, sector, notes,
 *      personalization hints, etc.).
 *   2. Load the CLIENT's business_dossier (who they are, what they sell,
 *      brand tone) so Hugo pitches the right service.
 *   3. Classify the incoming email (needs_reply vs auto_notification vs
 *      unsubscribe) — this is a separate gate BEFORE sentiment analysis.
 *      Auto-notifications (out-of-office, bounces, autoresponders) get
 *      swallowed silently; nothing should be sent back.
 *   4. Generate a contextual reply with Claude Sonnet.
 *   5. Send via Brevo using the right client sender, threaded with
 *      In-Reply-To when we have the original message-id.
 *
 * Everything here is shared codebase — per-client behaviour comes from
 * the dossier + CRM data, not from conditional branches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type InboundClassification =
  | 'needs_reply'       // real human reply requiring an answer + CTA
  | 'auto_notification' // out-of-office, autoresponder, system bounce — ignore
  | 'unsubscribe'       // "unsubscribe me" / "stop"
  | 'meeting_request'   // wants to book a call — escalate, don't auto-reply
  | 'negative';         // explicit refusal — stop the sequence

export interface InboundEmail {
  from_email: string;
  from_name?: string;
  subject?: string;
  body: string;             // plain text
  message_id?: string;      // Message-ID header of the inbound (for threading)
  in_reply_to?: string;     // In-Reply-To header (points to Hugo's outbound)
}

/**
 * Fast classifier: one tight Claude Haiku call. Returns a label we can
 * route on. Kept separate from the full sentiment analysis so that
 * auto-notifications are dropped in <1s before we burn a bigger model.
 */
export async function classifyInbound(
  body: string,
  subject: string | undefined,
): Promise<InboundClassification> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY || !body) return 'auto_notification';

  // Deterministic shortcuts before the AI — a ton of autoresponders use
  // these exact strings in French / English, and we want to skip them
  // for free.
  const lower = `${subject || ''}\n${body}`.toLowerCase();
  const autoPatterns = [
    'out of office', 'je suis absent', 'absent du bureau',
    'automatic reply', 'réponse automatique', 'reponse automatique',
    'mailer-daemon', 'postmaster', 'delivery status',
    'noreply', 'no-reply', 'donotreply',
    'votre message a bien été reçu', 'votre demande a bien été enregistrée',
  ];
  for (const p of autoPatterns) {
    if (lower.includes(p)) return 'auto_notification';
  }

  const unsubPatterns = ['unsubscribe', 'désabonner', 'desabonner', 'retirez-moi', 'stop', 'plus d\'emails'];
  if (unsubPatterns.some(p => lower.includes(p)) && body.length < 400) {
    // Short messages asking to stop — confident classification without AI.
    return 'unsubscribe';
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 30,
        system: `Tu classes un email entrant en UNE catégorie. Réponds UNIQUEMENT par l'un de ces labels, sans ponctuation, sans explication :
- needs_reply     (humain qui répond, demande des infos ou exprime de l'intérêt → besoin de répondre)
- auto_notification (réponse automatique, out-of-office, accusé réception, notif système, newsletter)
- unsubscribe     (demande explicite d'arrêt / désabonnement)
- meeting_request (veut un RDV, un créneau, un appel)
- negative        (refus ferme, "pas intéressé", agressif)`,
        messages: [{ role: 'user', content: `Objet: ${subject || '(aucun)'}\n\n${body.substring(0, 1500)}` }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const label = String(data.content?.[0]?.text || '').trim().toLowerCase();
      if (['needs_reply', 'auto_notification', 'unsubscribe', 'meeting_request', 'negative'].includes(label)) {
        return label as InboundClassification;
      }
    }
  } catch { /* fall through */ }

  return 'needs_reply'; // when in doubt, err on "needs reply" so no human signal is dropped
}

/**
 * Look up the prospect + the KeiroAI client (owner) + the client's
 * business dossier in one shot. Returns everything Hugo needs to write a
 * reply that cites Léo's enrichment.
 */
export async function loadReplyContext(
  supabase: SupabaseClient,
  fromEmail: string,
) {
  const clean = fromEmail.toLowerCase().trim();

  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('*')
    .eq('email', clean)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prospect) return null;

  const ownerId: string | null = prospect.user_id || prospect.created_by || null;
  if (!ownerId) return { prospect, client: null, dossier: null };

  const [{ data: client }, { data: dossier }] = await Promise.all([
    supabase.from('profiles').select('id, email, first_name, last_name, subscription_plan').eq('id', ownerId).maybeSingle(),
    supabase.from('business_dossiers')
      .select('company_name, company_description, business_type, target_audience, business_goals, marketing_goals, brand_tone, main_products, city, custom_fields')
      .eq('user_id', ownerId).maybeSingle(),
  ]);

  return { prospect, client, dossier };
}

/**
 * Render a compact context block that gets injected into the reply
 * system prompt. Includes only the fields that are actually populated —
 * an empty "Site: null" line wastes tokens and confuses the model.
 */
export function buildReplyPromptContext(params: {
  prospect: any;
  dossier: any | null;
  inbound: InboundEmail;
}): string {
  const { prospect, dossier, inbound } = params;
  const lines: string[] = [];

  // 1. Who are we writing for (KeiroAI client)
  if (dossier) {
    lines.push('=== NOTRE CLIENT (celui pour qui tu écris) ===');
    if (dossier.company_name) lines.push(`Business : ${dossier.company_name}`);
    if (dossier.business_type) lines.push(`Type : ${dossier.business_type}`);
    if (dossier.main_products) lines.push(`Offre : ${dossier.main_products}`);
    if (dossier.brand_tone) lines.push(`Ton : ${dossier.brand_tone}`);
    if (dossier.target_audience) lines.push(`Cible : ${dossier.target_audience}`);
    if (dossier.business_goals) lines.push(`Objectifs business : ${dossier.business_goals}`);
  } else {
    lines.push('=== NOTRE CLIENT ===\n(pas de dossier — utilise un ton neutre)');
  }

  // 2. Who the prospect is (Léo's enrichment data)
  lines.push('\n=== LE PROSPECT (infos Léo a collectées) ===');
  if (prospect.first_name || prospect.last_name) lines.push(`Nom : ${prospect.first_name || ''} ${prospect.last_name || ''}`.trim());
  if (prospect.company) lines.push(`Entreprise : ${prospect.company}`);
  if (prospect.type) lines.push(`Secteur : ${prospect.type}`);
  if (prospect.specialite || prospect.specialty) lines.push(`Spécialité : ${prospect.specialite || prospect.specialty}`);
  if (prospect.quartier) lines.push(`Quartier : ${prospect.quartier}`);
  if (prospect.address) lines.push(`Adresse : ${prospect.address}`);
  if (prospect.website) lines.push(`Site : ${prospect.website}`);
  if (prospect.instagram) lines.push(`Instagram : ${prospect.instagram}`);
  if (prospect.google_rating || prospect.note_google) lines.push(`Note Google : ${prospect.google_rating || prospect.note_google}⭐ (${prospect.google_reviews || prospect.avis_google || '?'} avis)`);
  if (prospect.abonnes) lines.push(`Abonnés IG : ${prospect.abonnes}`);
  if (prospect.score !== undefined && prospect.score !== null) lines.push(`Score qualif : ${prospect.score}/100`);
  if (prospect.temperature) lines.push(`Température : ${prospect.temperature}`);
  if (prospect.angle_approche) lines.push(`Angle d'approche Léo : ${prospect.angle_approche}`);
  if (prospect.personalization) lines.push(`Note perso Léo : ${prospect.personalization}`);
  if (prospect.notes) lines.push(`Notes : ${String(prospect.notes).substring(0, 300)}`);

  // 3. Previous email context
  if (prospect.email_sequence_step !== null && prospect.email_sequence_step !== undefined) {
    lines.push(`\nÉtape séquence où il est : ${prospect.email_sequence_step}`);
  }
  if (prospect.last_email_subject_variant) {
    lines.push(`Dernier objet envoyé : "${prospect.last_email_subject_variant}"`);
  }

  // 4. What they just wrote back
  lines.push('\n=== LE MESSAGE QU\'IL VIENT D\'ÉCRIRE ===');
  if (inbound.subject) lines.push(`Objet : ${inbound.subject}`);
  lines.push(`Corps :\n"""\n${inbound.body.substring(0, 2000)}\n"""`);

  return lines.join('\n');
}

/**
 * Generate a reply with rich context. The system prompt is tight and
 * the rules are strict so Hugo doesn't hallucinate features or pitch
 * something the client doesn't actually offer.
 */
export async function generateReply(params: {
  prospect: any;
  dossier: any | null;
  inbound: InboundEmail;
  classification: InboundClassification;
}): Promise<{ subject: string; body: string } | null> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return null;

  const context = buildReplyPromptContext(params);
  const { inbound, classification } = params;

  const replyGuide = classification === 'needs_reply'
    ? `Le prospect a répondu humainement. Réponds à sa question/remarque précisément, cite les infos du prospect (Léo les a mises en bas) pour prouver que tu connais son business, et termine par un CTA léger (question ouverte OU proposition d'envoi de plus d'infos OU de rendez-vous). 4 à 8 lignes. Pas de formule toute faite.`
    : classification === 'meeting_request'
      ? `Le prospect veut un RDV. Confirme ton intérêt en 2-3 lignes, propose d'envoyer un lien Calendly ou demande 2 créneaux. Le client humain prendra le relais après, donc reste simple.`
      : `Réponds brièvement, honnêtement, sans agressivité.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        system: `Tu es HUGO, l'agent email de KeiroAI qui écrit AU NOM du client. Tu ne parles JAMAIS de KeiroAI, IA, agents ou automatisation — tu signes comme si c'était le fondateur du business client qui tapait à la main.

${replyGuide}

RÈGLES DURES :
- Une seule personne écrit : le fondateur du business client.
- Cite UN élément concret du profil prospect pour montrer que tu l'as regardé (son secteur, sa note Google, son quartier, son site...).
- Pas de jargon marketing ("synergies", "leverage", "ROI" → interdits).
- Pas de "n'hésitez pas", pas de "je reste à disposition".
- Pas de puces, pas de gras, pas d'emoji sauf un seul à la fin si le ton le mérite.
- Si tu ne peux pas répondre précisément à une question technique parce que le dossier client ne couvre pas le sujet, NE PAS INVENTER — dis simplement que tu reviens vite avec la réponse précise.
- Sortie en JSON strict : {"subject":"Re: ...","body":"..."}.

${context}`,
        messages: [{ role: 'user', content: `Rédige la réponse maintenant. Objet = "Re: " + objet du prospect (ou un objet court si absent). Corps : prêt à envoyer, tutoiement si dossier dit "friendly", vouvoiement si "formal".` }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);
    if (!parsed?.subject || !parsed?.body) return null;
    return { subject: String(parsed.subject).substring(0, 200), body: String(parsed.body).substring(0, 3000) };
  } catch { return null; }
}

/**
 * Send a reply via Brevo. Threads with In-Reply-To / References when we
 * have the original message-id so the reply lands in the same thread
 * in the prospect's inbox.
 */
export async function sendReplyViaBrevo(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  senderEmail?: string;
  senderName?: string;
}): Promise<boolean> {
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return false;

  const senderEmail = params.senderEmail || 'contact@keiroai.com';
  const senderName = params.senderName || 'KeiroAI';

  const headers: Record<string, string> = {};
  if (params.inReplyTo) {
    headers['In-Reply-To'] = params.inReplyTo;
    headers['References'] = params.inReplyTo;
  }

  const bodyHtml = params.body
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 10px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: params.toEmail, name: params.toName }],
        subject: params.subject,
        htmlContent: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;">${bodyHtml}</div>`,
        textContent: params.body,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
