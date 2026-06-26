/**
 * POST /api/agents/orchestrate-directive
 *
 * AMI's autonomous orchestration channel. Receives a recommendation
 * text (typically AMI's strategic analysis from the marketing panel)
 * and converts it into actionable directives stored on
 * org_agent_configs.config so each agent reads them on next run.
 *
 * Workflow:
 *   1. Sonnet analyses the recommendation
 *   2. For each potentially-impacted agent (content, dm, email, etc.)
 *      Sonnet extracts a concrete directive — or null if not relevant
 *   3. Each non-null directive is appended to the per-agent
 *      directive list on org_agent_configs
 *
 * This works the same way as chat-driven directives (lib/agents/
 * extract-directive.ts) — the only difference is the trigger: a
 * recommendation pushed from the AMI panel instead of a user
 * message. The chat path remains fully functional in parallel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CANDIDATE_AGENTS = ['content', 'dm_instagram', 'email', 'commercial', 'gmaps'];

async function callSonnet(system: string, message: string, maxTokens = 500): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!r.ok) throw new Error(`Sonnet ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return (data.content?.[0]?.text || '').trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Two auth paths: normal user session OR CRON_SECRET + x-user-id
  // header. The latter is how AMI's chat handler triggers
  // orchestration server-side without needing the cookie.
  let userId: string | null = null;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const xUserId = req.headers.get('x-user-id') || body.user_id;
  if (cronSecret && authHeader === `Bearer ${cronSecret}` && xUserId) {
    userId = String(xUserId);
  } else {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Auth required' }, { status: 401 });
    }
    userId = user.id;
  }

  const user = { id: userId };
  const directive = (body.directive || '').toString().trim();
  if (!directive || directive.length < 20) {
    return NextResponse.json({ ok: false, error: 'directive too short' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Ask Sonnet which agents the directive applies to, and for each
  // applicable agent, extract a CONCRETE directive in 1-2 sentences.
  let plan: Array<{ agent: string; directive: string }> = [];
  try {
    const out = await callSonnet(
      `You are AMI, the marketing strategy orchestrator at KeiroAI. You receive a strategic recommendation and decide which of the operational agents need to adjust their behavior to implement it.

Agents you can give orders to (with their domain):
- content (Léna) — content creation, publishing, post strategy (IG/TT/LI)
- dm_instagram (Jade) — DMs, comments, engagement on prospects (IG/TT/LI)
- email (Hugo) — email marketing, prospection sequences
- commercial (Léo) — CRM, prospection, lead qualification
- gmaps (Théo) — Google reputation, review replies, local + online SEO

OUTPUT: STRICT JSON array (no markdown):
[
  { "agent": "content", "directive": "<concrete 1-2 sentence instruction>" },
  { "agent": "dm_instagram", "directive": "<…>" }
]

Only include agents that are actually impacted. If the recommendation only affects one agent, return a 1-item array. If it's too vague to translate to a directive, return [].

Each directive must be:
- A clear durable rule (not a question, not an action like "publish now")
- Specific enough that the agent can apply it on its next run
- Aligned with KeiroAI's quality bar (no spam, no fake numbers, human-in-the-loop)`,
      `Recommendation:\n"${directive.slice(0, 800)}"\n\nReturn the JSON array.`,
      600,
    );
    const cleaned = out.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) plan = JSON.parse(arrMatch[0]);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Sonnet analysis failed: ${e?.message}` }, { status: 500 });
  }

  plan = plan.filter(p => p && typeof p.agent === 'string' && typeof p.directive === 'string' && CANDIDATE_AGENTS.includes(p.agent) && p.directive.length > 10);

  if (plan.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, agents: [], message: 'Aucune directive concrète à dériver de cette recommandation.' });
  }

  // Load or create org_agent_configs row for the user.
  const { data: existing } = await supabase
    .from('org_agent_configs')
    .select('id, config')
    .eq('user_id', user.id)
    .maybeSingle();

  const newConfig: any = existing?.config || {};
  const applied: string[] = [];

  for (const p of plan) {
    const key = `${p.agent}_directives`;
    const arr: Array<{ text: string; source: string; created_at: string }> = Array.isArray(newConfig[key]) ? newConfig[key] : [];
    // Dedup by text
    if (!arr.some(d => d.text === p.directive)) {
      arr.push({
        text: p.directive,
        source: 'ami_orchestration',
        created_at: new Date().toISOString(),
      });
      newConfig[key] = arr.slice(-20); // keep last 20 per agent
      applied.push(p.agent);
    }
  }

  if (existing) {
    await supabase
      .from('org_agent_configs')
      .update({ config: newConfig, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('org_agent_configs')
      .insert({ user_id: user.id, config: newConfig });
  }

  // Audit log so the orchestration trail is visible
  try {
    await supabase.from('agent_logs').insert({
      agent: 'marketing',
      action: 'ami_orchestration',
      status: 'success',
      user_id: user.id,
      data: {
        source: body.source || 'panel',
        directive: directive.slice(0, 200),
        agents_targeted: applied,
        plan: plan.map(p => ({ agent: p.agent, directive_preview: p.directive.slice(0, 100) })),
      },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    applied: applied.length,
    agents: applied,
    plan,
  });
}
