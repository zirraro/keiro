/**
 * GET /api/meta-review/agent-checks
 *
 * Functional smoke test for the agents that make autonomous decisions
 * on inbound signals (Hugo on emails, Théo on Google reviews). For each
 * canonical input we know the expected verdict — if the agent stops
 * agreeing, this endpoint flags it.
 *
 * Read-only. No prospect rows are touched, no emails are sent. We just
 * call the same Claude classification + decision logic with synthetic
 * payloads and compare to expected outputs.
 *
 * Surfaced in /meta-review under "Agent health checks" so the founder
 * can verify in 10 seconds that Hugo still flips unsubscribes to dead,
 * still pauses out-of-office prospects, and Théo still escalates legal
 * threats — without staring at production data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { generateReviewReply } from '@/lib/agents/theo-review-reply';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface CheckResult {
  agent: string;
  scenario: string;
  pass: boolean;
  expected: string;
  actual: string;
  detail?: string;
}

async function classifyEmailReply(replyContent: string): Promise<{
  intent: string;
  newStatus: string;
  newTemp: string;
  stopSequence: boolean;
}> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { intent: 'unknown', newStatus: 'repondu', newTemp: 'warm', stopSequence: false };
  }

  // Mirror the exact prompt the Brevo webhook uses, so we test the real
  // production behaviour rather than a reduced version.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `Tu es un analyste commercial expert. Tu analyses les reponses email de prospects pour KeiroAI.
Reponds UNIQUEMENT en JSON valide sans markdown:
{
  "intent": "interested" | "question" | "closed_business" | "unsubscribe" | "negative" | "positive" | "out_of_office" | "other",
  "new_status": "repondu" | "demo" | "interesse" | "perdu",
  "new_temperature": "hot" | "warm" | "dead",
  "stop_sequence": true | false
}
Regles:
- "je suis ferme", "on a ferme", "plus en activite" → intent=closed_business, status=perdu, temp=dead, stop_sequence=true
- "desabonnez-moi", "stop", "arretez", "plus de mail" → intent=unsubscribe, status=perdu, temp=dead, stop_sequence=true
- "pas interesse", "non merci" → intent=negative, status=perdu, temp=dead, stop_sequence=true
- "combien ca coute", "c'est quoi", question → intent=question, status=repondu, temp=hot
- "oui", "interesse", "ok" → intent=positive/interested, status=interesse, temp=hot
- "absence", "vacances", "out of office" → intent=out_of_office, status=repondu, temp=warm, stop_sequence=false`,
      messages: [{ role: 'user', content: `Reponse:\n"""${replyContent}"""` }],
    }),
  });

  if (!res.ok) {
    return { intent: 'unknown', newStatus: 'repondu', newTemp: 'warm', stopSequence: false };
  }
  const data = await res.json();
  let txt = (data.content?.[0]?.text || '').trim();
  // Claude Haiku sometimes wraps JSON in ```json ... ``` fences despite
  // the "no markdown" instruction. Strip them before parsing.
  txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  // If the response contains prose before/after the JSON, extract the
  // outermost {...} block.
  const firstBrace = txt.indexOf('{');
  const lastBrace = txt.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    txt = txt.slice(firstBrace, lastBrace + 1);
  }
  try {
    const parsed = JSON.parse(txt);
    return {
      intent: parsed.intent || 'unknown',
      newStatus: parsed.new_status || 'repondu',
      newTemp: parsed.new_temperature || 'warm',
      stopSequence: parsed.stop_sequence === true,
    };
  } catch {
    return { intent: 'unknown', newStatus: 'repondu', newTemp: 'warm', stopSequence: false };
  }
}

export async function GET(req: NextRequest) {
  // Auth: either logged-in user OR CRON_SECRET. The endpoint costs
  // Claude tokens per call (10 scenarios × Haiku/Sonnet), so we don't
  // want it open to the public web.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const { user, error } = await getAuthUser();
    if (error || !user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }
  }

  const results: CheckResult[] = [];

  // ─────────────────────────────────────────────────────────
  // HUGO — email reply classification
  // ─────────────────────────────────────────────────────────
  const hugoScenarios: Array<{ name: string; reply: string; expectedIntent: string; expectedStatus: string; expectedTemp: string; expectedStop: boolean }> = [
    {
      name: 'Unsubscribe — explicit',
      reply: 'Désabonnez-moi de votre liste, je ne veux plus recevoir aucun message.',
      expectedIntent: 'unsubscribe',
      expectedStatus: 'perdu',
      expectedTemp: 'dead',
      expectedStop: true,
    },
    {
      name: 'Closed business',
      reply: 'Bonjour, on a fermé le restaurant en janvier, plus en activité.',
      expectedIntent: 'closed_business',
      expectedStatus: 'perdu',
      expectedTemp: 'dead',
      expectedStop: true,
    },
    {
      name: 'Negative — not interested',
      reply: 'Non merci, pas intéressé.',
      expectedIntent: 'negative',
      expectedStatus: 'perdu',
      expectedTemp: 'dead',
      expectedStop: true,
    },
    {
      name: 'Out of office',
      reply: 'Je suis actuellement en congés jusqu\'au 25 mai. Je reviendrai vers vous à mon retour.',
      expectedIntent: 'out_of_office',
      expectedStatus: 'repondu',
      expectedTemp: 'warm',
      expectedStop: false,
    },
    {
      name: 'Positive — interested',
      reply: 'Oui ça m\'intéresse, on peut prévoir un appel cette semaine ?',
      expectedIntent: 'positive',  // model may answer 'interested' too — we accept both below
      expectedStatus: 'interesse',
      expectedTemp: 'hot',
      expectedStop: false,
    },
    {
      name: 'Pricing question',
      reply: 'Bonjour, combien coûte votre solution ?',
      expectedIntent: 'question',
      expectedStatus: 'repondu',
      expectedTemp: 'hot',
      expectedStop: false,
    },
    {
      name: 'Vague single-word reply ("ok") — should not over-classify',
      reply: 'ok',
      // "ok" alone is too ambiguous to be treated as a hot lead — Hugo
      // should NOT flip the prospect to interesse+hot, but also NOT
      // stop the sequence. Other/neutral is the safe default.
      expectedIntent: 'other',
      expectedStatus: 'repondu',
      expectedTemp: 'warm',
      expectedStop: false,
    },
  ];

  for (const sc of hugoScenarios) {
    try {
      const got = await classifyEmailReply(sc.reply);
      const intentOk = sc.name === 'Positive — interested'
        ? (got.intent === 'positive' || got.intent === 'interested')
        : sc.name === 'Vague single-word reply ("ok") — should not over-classify'
          // Accept any non-stopping classification — Hugo can label it
          // "other", "neutral", "question", whatever — as long as it
          // doesn't aggressively act on the ambiguous input.
          ? (got.intent !== 'unsubscribe' && got.intent !== 'closed_business' && got.intent !== 'negative')
          : got.intent === sc.expectedIntent;
      // For the positive-interested case, accept either "interesse" or
      // "demo" — both are valid progression statuses depending on
      // whether the prospect mentions a meeting/call. The point of the
      // test is that the prospect is NOT marked perdu/dead.
      const statusOk = sc.name === 'Positive — interested'
        ? (got.newStatus === 'interesse' || got.newStatus === 'demo')
        : sc.name === 'Vague single-word reply ("ok") — should not over-classify'
          // Accept anything that's not perdu — vague "ok" must not flip
          // the prospect into a dead state.
          ? (got.newStatus !== 'perdu')
          : got.newStatus === sc.expectedStatus;
      // Vague "ok" — accept any non-dead temp (Hugo's prompt is set
      // to err on the side of warmth, which is fine since no destructive
      // action flows from "hot"). The important assertion already
      // covered above is that the prospect is NOT flipped to perdu.
      const tempOk = sc.name === 'Vague single-word reply ("ok") — should not over-classify'
        ? (got.newTemp !== 'dead')
        : got.newTemp === sc.expectedTemp;
      const stopOk = got.stopSequence === sc.expectedStop;
      const pass = intentOk && statusOk && tempOk && stopOk;
      results.push({
        agent: 'Hugo',
        scenario: sc.name,
        pass,
        expected: `intent=${sc.expectedIntent} · status=${sc.expectedStatus} · temp=${sc.expectedTemp} · stop=${sc.expectedStop}`,
        actual: `intent=${got.intent} · status=${got.newStatus} · temp=${got.newTemp} · stop=${got.stopSequence}`,
        detail: pass ? undefined : 'Mismatch — Hugo would mishandle this reply in production.',
      });
    } catch (e: any) {
      results.push({
        agent: 'Hugo',
        scenario: sc.name,
        pass: false,
        expected: sc.expectedIntent,
        actual: 'error',
        detail: e?.message?.substring(0, 200) || 'unknown error',
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // THÉO — Google review reply / escalation
  // ─────────────────────────────────────────────────────────
  const theoScenarios: Array<{ name: string; review: { rating: number; text: string; author: string; created_at: string }; expectAction: 'reply' | 'escalate' }> = [
    {
      name: '5★ positive — should reply',
      review: {
        rating: 5,
        text: 'Incroyable, le tiramisu était une tuerie et le service au top !',
        author: 'Sophie',
        created_at: new Date().toISOString(),
      },
      expectAction: 'reply',
    },
    {
      name: '1★ legal threat — should escalate',
      review: {
        rating: 1,
        text: 'Service catastrophique, j\'ai contacté mon avocat, on se reverra au tribunal.',
        author: 'Anonyme',
        created_at: new Date().toISOString(),
      },
      expectAction: 'escalate',
    },
    {
      name: '1★ health claim — should escalate',
      review: {
        rating: 1,
        text: 'Intoxication alimentaire après leur plat, j\'ai été à l\'hôpital.',
        author: 'Marc',
        created_at: new Date().toISOString(),
      },
      expectAction: 'escalate',
    },
    {
      name: '2★ short negative — should escalate (too short, risky)',
      review: {
        rating: 2,
        text: 'Bof.',
        author: 'JeanP',
        created_at: new Date().toISOString(),
      },
      expectAction: 'escalate',
    },
    {
      name: '3★ mitigated with specific complaint — reply with action OR escalate',
      review: {
        rating: 3,
        text: 'Plats excellents mais service très long, on a attendu 40 min entre l\'entrée et le plat.',
        author: 'Léa',
        created_at: new Date().toISOString(),
      },
      // A 3-star with a concrete service complaint is the textbook case
      // for a thoughtful reply that acknowledges the issue and proposes
      // a concrete next step. Théo MAY also escalate if he judges the
      // dossier doesn't give him enough to commit to an action — both
      // outcomes are acceptable, what's not acceptable is silence or a
      // generic "merci" reply (which falls outside this test scope).
      expectAction: 'reply',
    },
  ];

  for (const sc of theoScenarios) {
    try {
      const verdict = await generateReviewReply(sc.review, {
        company_name: 'Test Restaurant',
        business_type: 'restaurant',
        brand_tone: 'friendly',
        city: 'Paris',
      });
      // For the 3⭐ mitigated case, accept either reply OR escalate —
      // both are defensible. Hard fail only if Théo silently does
      // neither.
      const pass = sc.name.startsWith('3★ mitigated')
        ? (verdict.action === 'reply' || verdict.action === 'escalate')
        : verdict.action === sc.expectAction;
      results.push({
        agent: 'Théo',
        scenario: sc.name,
        pass,
        expected: sc.expectAction,
        actual: verdict.action,
        detail: pass ? undefined : (verdict.action === 'escalate' ? `Escalated: ${verdict.reason}` : `Replied: ${verdict.body.substring(0, 120)}`),
      });
    } catch (e: any) {
      results.push({
        agent: 'Théo',
        scenario: sc.name,
        pass: false,
        expected: sc.expectAction,
        actual: 'error',
        detail: e?.message?.substring(0, 200) || 'unknown error',
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // LÉNA — content quality: visual link news↔business when pillar=trends
  // ─────────────────────────────────────────────────────────
  // We ask Sonnet to produce one P0 post (news/trend pillar) and check
  // that the generated visual_description anchors BOTH the news context
  // AND a business element in the same scene. This is the rule we just
  // added to content-prompt.ts — drift would mean Léna's visuals stop
  // showing the news↔business connection users explicitly asked for.
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      const { getContentSystemPrompt } = await import('@/lib/agents/content-prompt');
      const lenaRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          system: getContentSystemPrompt(),
          messages: [{
            role: 'user',
            content: `Génère UN post P0 (pillar=trends) pour Instagram.
Cible : restaurant à Paris. Tendance à exploiter : vague de froid annoncée cette semaine en France.
Retourne UNIQUEMENT le JSON strict défini dans le system prompt, sans markdown.`,
          }],
        }),
      });

      let raw = '';
      let parsed: any = null;
      if (lenaRes.ok) {
        const data = await lenaRes.json();
        raw = (data.content?.[0]?.text || '').trim();
        const stripped = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const fb = stripped.indexOf('{');
        const lb = stripped.lastIndexOf('}');
        try { parsed = JSON.parse(fb >= 0 && lb > fb ? stripped.slice(fb, lb + 1) : stripped); } catch {}
      }

      const visual = (parsed?.visual_description || '').toLowerCase();
      const newsLink = (parsed?.news_visual_link || '').toLowerCase();
      // Anchored news cue: any word that signals the cold-snap context
      const hasNewsCue = ['cold', 'froid', 'foggy', 'embuée', 'embuee', 'snow', 'neige', 'frost', 'winter', 'hiver', 'steam', 'fumant', 'fume', 'breath', 'condensation', 'window'].some(k => visual.includes(k));
      // Anchored business cue: restaurant scene element
      const hasBusinessCue = ['soup', 'soupe', 'broth', 'bowl', 'bol', 'table', 'plate', 'plat', 'dish', 'kitchen', 'cuisine', 'restaurant', 'meal', 'food', 'tea', 'thé', 'coffee', 'café', 'cup', 'tasse', 'wine', 'bistrot', 'tableware'].some(k => visual.includes(k));
      const hasNewsLinkField = newsLink.length > 10; // sentence that summarises the bridge
      const pass = !!parsed && hasNewsCue && hasBusinessCue && hasNewsLinkField;

      results.push({
        agent: 'Léna',
        scenario: 'P0 trends — news↔business visual anchoring',
        pass,
        expected: 'visual_description contains BOTH a news cue (cold/steam/foggy window) AND a business cue (soup/bowl/restaurant scene), plus news_visual_link sentence',
        actual: parsed
          ? `news_cue=${hasNewsCue} · business_cue=${hasBusinessCue} · news_visual_link="${(parsed.news_visual_link || '').substring(0, 80)}"`
          : `Could not parse JSON: ${raw.substring(0, 160)}`,
        detail: pass ? undefined : 'Léna generated a P0 trends post without the double anchoring required — visual would not show the news connection.',
      });
    } else {
      results.push({ agent: 'Léna', scenario: 'P0 trends — news↔business visual anchoring', pass: false, expected: 'visual_description double-anchored', actual: 'no_anthropic_key', detail: 'ANTHROPIC_API_KEY missing' });
    }
  } catch (e: any) {
    results.push({
      agent: 'Léna',
      scenario: 'P0 trends — news↔business visual anchoring',
      pass: false,
      expected: 'visual_description double-anchored',
      actual: 'error',
      detail: e?.message?.substring(0, 200) || 'unknown error',
    });
  }

  // ─────────────────────────────────────────────────────────
  // JADE — TikTok DM quality: pre_comments + creator-tone hook
  // ─────────────────────────────────────────────────────────
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      const { getDMSystemPrompt } = await import('@/lib/agents/dm-prompt');
      const jadeTtRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          system: getDMSystemPrompt('tiktok'),
          messages: [{
            role: 'user',
            content: `Génère un DM TikTok pour ce créateur :
Compte : @studio_kbarber — barber shop Marseille, 3 vidéos virales sur le dégradé fade
Dernière vidéo : transition before/after sur fade très net, son trending
Bio : "barber · sneakers · vibes — booking link"

Réponds UNIQUEMENT en JSON strict.`,
          }],
        }),
      });

      let raw = '';
      let parsed: any = null;
      if (jadeTtRes.ok) {
        const data = await jadeTtRes.json();
        raw = (data.content?.[0]?.text || '').trim();
        const stripped = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const fb = stripped.indexOf('{');
        const lb = stripped.lastIndexOf('}');
        try { parsed = JSON.parse(fb >= 0 && lb > fb ? stripped.slice(fb, lb + 1) : stripped); } catch {}
      }

      const dmText = (parsed?.dm_text || '').toLowerCase();
      const preComments = parsed?.pre_comments;
      // TikTok ask: a specific video reference + 2-3 distinct pre-comments
      const hasVideoHook = ['fade', 'dégradé', 'degrade', 'before', 'after', 'transition', 'vidéo', 'video', 'reel'].some(k => dmText.includes(k));
      const hasPreCommentsArr = Array.isArray(preComments) && preComments.length >= 2;
      const distinctPreComments = hasPreCommentsArr
        ? new Set(preComments.map((p: any) => String(p).trim().toLowerCase())).size >= 2
        : false;
      const hasIaWord = ['intelligence artificielle', ' ia ', 'automatisé', 'généré par'].some(p => dmText.includes(p));
      // TikTok DMs should be even tighter than IG — 30 to 500 chars
      const lengthOk = dmText.length > 20 && dmText.length < 600;

      const pass = !!parsed && hasVideoHook && hasPreCommentsArr && distinctPreComments && !hasIaWord && lengthOk;

      results.push({
        agent: 'Jade',
        scenario: 'TikTok DM — video hook + 2+ distinct pre_comments',
        pass,
        expected: 'DM references a specific video, pre_comments array has ≥2 distinct entries, no IA mention, tight TikTok length',
        actual: parsed
          ? `video_hook=${hasVideoHook} · pre_comments_count=${preComments?.length ?? 0} · distinct=${distinctPreComments} · IA_word=${hasIaWord} · len=${dmText.length}`
          : `Could not parse JSON: ${raw.substring(0, 160)}`,
        detail: pass ? undefined : 'Jade TikTok DM failed the quality bar — missing video hook or pre_comments diversity.',
      });
    } else {
      results.push({ agent: 'Jade', scenario: 'TikTok DM — video hook + 2+ distinct pre_comments', pass: false, expected: 'creator-tone DM', actual: 'no_anthropic_key' });
    }
  } catch (e: any) {
    results.push({
      agent: 'Jade',
      scenario: 'TikTok DM — video hook + 2+ distinct pre_comments',
      pass: false,
      expected: 'creator-tone DM',
      actual: 'error',
      detail: e?.message?.substring(0, 200) || 'unknown error',
    });
  }

  // ─────────────────────────────────────────────────────────
  // JADE — Instagram DM quality: concrete personalization_detail
  // ─────────────────────────────────────────────────────────
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      const { getDMSystemPrompt } = await import('@/lib/agents/dm-prompt');
      const jadeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: getDMSystemPrompt('instagram'),
          messages: [{
            role: 'user',
            content: `Génère un premier DM pour ce prospect :
Compte : @bistrot_dumarais — restaurant bistronomique, Paris 4e
Dernier post : photo du tartare de bœuf de la maison avec frites maison
Story récente : équipe en cuisine pendant le service du soir
Bio : "Bistrot du Marais · cuisine de produit · réservation en DM"

Réponds UNIQUEMENT en JSON strict comme défini dans le system prompt.`,
          }],
        }),
      });

      let raw = '';
      let parsed: any = null;
      if (jadeRes.ok) {
        const data = await jadeRes.json();
        raw = (data.content?.[0]?.text || '').trim();
        const stripped = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const fb = stripped.indexOf('{');
        const lb = stripped.lastIndexOf('}');
        try { parsed = JSON.parse(fb >= 0 && lb > fb ? stripped.slice(fb, lb + 1) : stripped); } catch {}
      }

      const dmText = (parsed?.dm_text || '').toLowerCase();
      const persoDetail = (parsed?.personalization_detail || '').toLowerCase();
      // Specific markers we'd expect Jade to hook on
      const hasSpecificHook = ['tartare', 'frites', 'marais', '4e', 'bistrot', 'cuisine', 'soir', 'équipe', 'equipe', 'service'].some(k => dmText.includes(k) || persoDetail.includes(k));
      // Ban list — generic compliments that would fail the quality bar
      const bannedPhrases = ['j\'adore votre page', 'j\'aime votre profil', 'votre compte est super', 'nice page', 'love your page'];
      const hasBannedPhrase = bannedPhrases.some(p => dmText.includes(p));
      // Anti-IA markers
      const hasIaWord = ['intelligence artificielle', ' ia ', 'automatisé', 'généré par'].some(p => dmText.includes(p));
      // Length sanity (DM, not email)
      const dmLength = dmText.length;
      const lengthOk = dmLength > 30 && dmLength < 800;

      const pass = !!parsed && hasSpecificHook && !hasBannedPhrase && !hasIaWord && lengthOk;

      results.push({
        agent: 'Jade',
        scenario: 'IG DM — concrete personalization_detail',
        pass,
        expected: 'DM references a concrete profile detail (tartare/frites/marais/équipe…), no generic "j\'adore votre page", no IA mention, sensible length',
        actual: parsed
          ? `specific_hook=${hasSpecificHook} · banned=${hasBannedPhrase} · IA_word=${hasIaWord} · len=${dmLength} · detail="${(parsed.personalization_detail || '').substring(0, 80)}"`
          : `Could not parse JSON: ${raw.substring(0, 160)}`,
        detail: pass ? undefined : 'Jade DM failed the quality bar — generic, AI-flavoured, or off-length.',
      });
    } else {
      results.push({ agent: 'Jade', scenario: 'IG DM — concrete personalization_detail', pass: false, expected: 'specific DM', actual: 'no_anthropic_key', detail: 'ANTHROPIC_API_KEY missing' });
    }
  } catch (e: any) {
    results.push({
      agent: 'Jade',
      scenario: 'IG DM — concrete personalization_detail',
      pass: false,
      expected: 'specific DM',
      actual: 'error',
      detail: e?.message?.substring(0, 200) || 'unknown error',
    });
  }

  const failures = results.filter(r => !r.pass).length;
  const byAgent: Record<string, { pass: number; total: number }> = {};
  for (const r of results) {
    if (!byAgent[r.agent]) byAgent[r.agent] = { pass: 0, total: 0 };
    byAgent[r.agent].total++;
    if (r.pass) byAgent[r.agent].pass++;
  }

  return NextResponse.json({
    ok: failures === 0,
    summary: {
      total: results.length,
      pass: results.length - failures,
      fail: failures,
      by_agent: byAgent,
    },
    results,
    when: new Date().toISOString(),
  });
}
