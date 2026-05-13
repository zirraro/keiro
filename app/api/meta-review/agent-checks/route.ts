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
  ];

  for (const sc of hugoScenarios) {
    try {
      const got = await classifyEmailReply(sc.reply);
      const intentOk = sc.name === 'Positive — interested'
        ? (got.intent === 'positive' || got.intent === 'interested')
        : got.intent === sc.expectedIntent;
      const statusOk = got.newStatus === sc.expectedStatus;
      const tempOk = got.newTemp === sc.expectedTemp;
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
  ];

  for (const sc of theoScenarios) {
    try {
      const verdict = await generateReviewReply(sc.review, {
        company_name: 'Test Restaurant',
        business_type: 'restaurant',
        brand_tone: 'friendly',
        city: 'Paris',
      });
      const pass = verdict.action === sc.expectAction;
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
