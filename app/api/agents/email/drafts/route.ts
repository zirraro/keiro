import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import {
  getValidGmailToken,
  listGmailDrafts,
  getGmailDraft,
  updateGmailDraft,
  sendGmailDraft,
} from '@/lib/gmail-oauth';
import {
  hasImap,
  listImapDrafts,
  getImapDraft,
  updateImapDraft,
  sendImapDraft,
} from '@/lib/agents/imap-drafts';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Hugo — mailbox drafts. Works on BOTH:
 *   - Gmail / Workspace via OAuth (scope gmail.compose)
 *   - any custom-domain mailbox via IMAP (OVH, Gandi, Zoho, 365…) — no Google
 *
 * GET  → lists recent drafts (provider auto-detected) so the UI shows
 *        "drafts Hugo prepared / you started".
 * POST { action:'improve', provider, draftId, instruction? }
 *        → Hugo rewrites the draft (clean, pro, on-brand) and replaces it.
 *      { action:'send', provider, draftId }
 *        → sends the draft.
 *
 * Auth: the logged-in client. Drafts are always the caller's own mailbox.
 */

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  // Gmail first (best UX), then IMAP custom domain.
  const token = await getValidGmailToken(user.id);
  if (token) {
    let stubs;
    try { stubs = await listGmailDrafts(token.accessToken, 15); }
    catch (e: any) { return NextResponse.json({ ok: false, error: e?.message?.substring?.(0, 200) || 'list_failed' }, { status: 502 }); }
    const drafts = [];
    for (const s of stubs.slice(0, 15)) {
      const full = await getGmailDraft(token.accessToken, s.id).catch(() => null);
      drafts.push({
        id: s.id,
        provider: 'gmail',
        to: full?.to || '',
        subject: full?.subject || '(sans objet)',
        preview: (full?.body || '').substring(0, 160),
      });
    }
    return NextResponse.json({ ok: true, connected: true, provider: 'gmail', email: token.email, drafts });
  }

  if (await hasImap(user.id)) {
    const stubs = await listImapDrafts(user.id, 15);
    const drafts = [];
    for (const s of stubs.slice(0, 12)) {
      const full = await getImapDraft(user.id, s.uid).catch(() => null);
      drafts.push({
        id: String(s.uid),
        provider: 'imap',
        to: full?.to || s.to || '',
        subject: full?.subject || s.subject || '(sans objet)',
        preview: (full?.body || '').substring(0, 160),
      });
    }
    return NextResponse.json({ ok: true, connected: true, provider: 'imap', drafts });
  }

  return NextResponse.json({ ok: true, connected: false, drafts: [] });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action as 'improve' | 'send' | undefined;
  const draftId = body?.draftId as string | undefined;
  const provider = (body?.provider as 'gmail' | 'imap' | undefined) || 'gmail';
  if (!action || !draftId) {
    return NextResponse.json({ ok: false, error: 'action et draftId requis' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('company_name, business_type, main_products, brand_tone, city')
    .eq('user_id', user.id)
    .maybeSingle();

  // ── IMAP (custom domain) ───────────────────────────────────────────
  if (provider === 'imap') {
    const uid = Number(draftId);
    if (!Number.isFinite(uid)) return NextResponse.json({ ok: false, error: 'draftId invalide' }, { status: 400 });

    if (action === 'send') {
      const r = await sendImapDraft(user.id, uid);
      return r.sent
        ? NextResponse.json({ ok: true, sent: true })
        : NextResponse.json({ ok: false, error: r.reason || 'send_failed' }, { status: 502 });
    }

    const existing = await getImapDraft(user.id, uid);
    if (!existing) return NextResponse.json({ ok: false, error: 'Brouillon introuvable' }, { status: 404 });
    const improved = await improveDraft({ current: { subject: existing.subject || '', body: existing.body || '' }, instruction: body?.instruction, dossier });
    if (!improved) return NextResponse.json({ ok: false, error: 'Réécriture impossible (LLM indisponible)' }, { status: 502 });

    const r = await updateImapDraft(user.id, uid, {
      to: existing.to || '',
      subject: improved.subject,
      body: improved.body,
    });
    if (!r.updated) return NextResponse.json({ ok: false, error: r.reason || 'update_failed' }, { status: 502 });
    await logImproved(supabase, user.id, draftId, improved.subject);
    return NextResponse.json({ ok: true, improved, newId: r.uid != null ? String(r.uid) : undefined });
  }

  // ── Gmail ──────────────────────────────────────────────────────────
  const token = await getValidGmailToken(user.id);
  if (!token) return NextResponse.json({ ok: false, error: 'Aucune boîte connectée' }, { status: 400 });

  if (action === 'send') {
    try {
      const r = await sendGmailDraft(token.accessToken, draftId);
      return NextResponse.json({ ok: true, sent: r.sent, messageId: r.id });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message?.substring?.(0, 200) || 'send_failed' }, { status: 502 });
    }
  }

  const existing = await getGmailDraft(token.accessToken, draftId);
  if (!existing) return NextResponse.json({ ok: false, error: 'Brouillon introuvable' }, { status: 404 });
  const improved = await improveDraft({ current: { subject: existing.subject || '', body: existing.body || '' }, instruction: body?.instruction, dossier });
  if (!improved) return NextResponse.json({ ok: false, error: 'Réécriture impossible (LLM indisponible)' }, { status: 502 });

  const bodyHtml = improved.body
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 10px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const htmlWrapped = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;">${bodyHtml}</div>`;

  try {
    await updateGmailDraft(token.accessToken, draftId, {
      to: existing.to || '',
      subject: improved.subject,
      htmlBody: htmlWrapped,
      fromName: dossier?.company_name || undefined,
      fromEmail: token.email,
      threadId: existing.threadId,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message?.substring?.(0, 200) || 'update_failed' }, { status: 502 });
  }

  await logImproved(supabase, user.id, draftId, improved.subject);
  return NextResponse.json({ ok: true, improved });
}

async function logImproved(supabase: any, userId: string, draftId: string, subject: string) {
  await supabase.from('agent_logs').insert({
    agent: 'email', action: 'draft_improved', status: 'ok', user_id: userId,
    data: { draft_id: draftId, subject }, created_at: new Date().toISOString(),
  });
}

/**
 * Rewrite a draft with Claude (Sonnet) — clean, professional, faultless,
 * matching the client's brand tone. Returns null if the key is absent.
 */
async function improveDraft(params: {
  current: { subject: string; body: string };
  instruction?: string;
  dossier: any | null;
}): Promise<{ subject: string; body: string } | null> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return null;
  const { current, instruction, dossier } = params;

  const brand = dossier
    ? `Business : ${dossier.company_name || '?'} — ${dossier.business_type || ''}. Offre : ${dossier.main_products || '?'}. Ton de marque : ${dossier.brand_tone || 'pro et chaleureux'}. Ville : ${dossier.city || ''}.`
    : 'Aucun dossier — ton pro et neutre.';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `Tu es HUGO, l'assistant email du business. On te donne un BROUILLON que le client a commencé. Tu le RÉÉCRIS pour qu'il soit clair, professionnel, sans faute, bien structuré, prêt à envoyer — en gardant l'intention et les infos du client. Tu écris au nom du business (jamais "IA", jamais KeiroAI).

${brand}

RÈGLES :
- Garde le SENS et les faits du brouillon ; n'invente rien.
- Corrige orthographe/grammaire/ponctuation, améliore la formulation.
- Pas de jargon marketing, pas de "n'hésitez pas", pas de "je reste à disposition".
- Respecte le ton de marque (tutoiement si "friendly", vouvoiement si "formal").
${instruction ? `- Consigne supplémentaire du client : ${instruction}` : ''}
- Sortie en JSON strict : {"subject":"...","body":"..."}.`,
        messages: [{ role: 'user', content: `Objet actuel : "${current.subject}"\n\nCorps actuel :\n"""\n${current.body.substring(0, 3000)}\n"""\n\nRéécris-le maintenant.` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let txt = (data.content?.[0]?.text || '').trim();
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(txt);
    if (!parsed?.subject || !parsed?.body) return null;
    return { subject: String(parsed.subject).substring(0, 200), body: String(parsed.body).substring(0, 3000) };
  } catch {
    return null;
  }
}
