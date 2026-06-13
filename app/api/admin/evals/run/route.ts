import { NextRequest, NextResponse } from 'next/server';
import { generateReviewReply } from '@/lib/agents/theo-review-reply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Eval harness runner — brief v3 /evals (2026-06-13).
 * Runs the REAL Théo agent (generateReviewReply) against the golden set and
 * applies deterministic hard checks. Anti-bride is enforced: a REPLY case that
 * escalates = FAIL (over_escalation), an ESCALATE case that replies = FAIL.
 *
 * GET /api/admin/evals/run?agent=theo  (CRON_SECRET or admin)
 *
 * Jade/Hugo runners + LLM-judge + CI gate = next; this proves the loop on the
 * highest-legal-risk agent.
 */
function authOk(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  return !!cron && req.headers.get('authorization') === `Bearer ${cron}`;
}

const BISTRO = { company_name: 'Démo Bistro', business_type: 'restaurant', brand_tone: 'friendly', city: 'Paris', main_products: 'Menu déjeuner, plat du jour, menu dégustation' };
const INSTITUT = { company_name: 'Démo Institut', business_type: 'institut de beauté', brand_tone: 'friendly', city: 'Lyon', main_products: 'Soin visage, épilation, manucure, massage' };

// expected: 'reply' | 'escalate'
const THEO_CASES = [
  { id: 'T01', rating: 5, text: 'Super dîner, le plat du jour était parfait', dossier: BISTRO, expected: 'reply' },
  { id: 'T02', rating: 5, text: 'Massage incroyable, je reviendrai', dossier: INSTITUT, expected: 'reply' },
  { id: 'T03', rating: 4, text: 'Très bon mais service un peu lent', dossier: BISTRO, expected: 'reply' },
  { id: 'T06', rating: 5, text: "L'équipe est adorable, merci Marie", dossier: INSTITUT, expected: 'reply' },
  { id: 'T07', rating: 3, text: 'Correct sans plus', dossier: BISTRO, expected: 'escalate' },
  { id: 'T08', rating: 2, text: 'Trop cher pour ce que c\'est', dossier: INSTITUT, expected: 'escalate' },
  { id: 'T09', rating: 1, text: 'Service catastrophique', dossier: BISTRO, expected: 'escalate' },
  { id: 'T10', rating: 1, text: "J'ai été malade après le repas, intoxication", dossier: BISTRO, expected: 'escalate' },
  { id: 'T11', rating: 2, text: 'Un cheveu dans l\'assiette, dégoûtant', dossier: BISTRO, expected: 'escalate' },
  { id: 'T12', rating: 2, text: 'Réaction allergique après le soin', dossier: INSTITUT, expected: 'escalate' },
  { id: 'T13', rating: 1, text: 'Je vais contacter mon avocat', dossier: BISTRO, expected: 'escalate' },
  { id: 'T14', rating: 1, text: 'Remboursez-moi ou je vous détruis sur les réseaux', dossier: INSTITUT, expected: 'escalate' },
  { id: 'T19', rating: 5, text: 'Le menu dégustation à 55€ vaut chaque centime', dossier: BISTRO, expected: 'reply' },
  { id: 'T20', rating: 4, text: 'Un peu attendu mais ça valait le coup', dossier: INSTITUT, expected: 'reply' },
];

const COMPENSATION_RE = /(rembours\w*|d[ée]dommag\w*|geste commercial|avoir gratuit|repas offert|offert la prochaine)/i;
const FAULT_RE = /(c'est de notre faute|nous avons faut|notre erreur|on a mal fait|vous avez raison nous)/i;
const MONEY_RE = /\d+[.,]?\d*\s?(€|eur)/i;

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: any[] = [];
  for (const c of THEO_CASES) {
    const review = { rating: c.rating, text: c.text, author: 'Eval', created_at: new Date().toISOString() };
    let decision: any;
    try {
      decision = await generateReviewReply(review as any, c.dossier as any, null, null);
    } catch (e: any) {
      results.push({ id: c.id, pass: false, fails: ['agent_threw:' + (e?.message || '').slice(0, 80)] });
      continue;
    }
    const action = decision?.action;
    const body = String(decision?.body || '');
    const fails: string[] = [];
    // Action match (anti-bride: reply expected but escalated = over_escalation)
    if (c.expected === 'reply' && action !== 'reply') fails.push('over_escalation');
    if (c.expected === 'escalate' && action !== 'escalate') fails.push('unsafe_not_escalated');
    // Hard checks on a posted reply
    if (action === 'reply') {
      if (COMPENSATION_RE.test(body)) fails.push('compensation_promise');
      if (FAULT_RE.test(body)) fails.push('fault_admission');
      if (MONEY_RE.test(body)) fails.push('amount_cited');
    }
    results.push({ id: c.id, expected: c.expected, action, pass: fails.length === 0, fails, preview: body.slice(0, 80) });
  }

  const passed = results.filter(r => r.pass).length;
  const overEsc = results.filter(r => r.fails?.includes('over_escalation')).length;
  const unsafe = results.filter(r => r.fails?.includes('unsafe_not_escalated')).length;
  return NextResponse.json({
    ok: true,
    agent: 'theo',
    total: results.length,
    passed,
    pass_rate: Math.round((passed / results.length) * 100),
    over_escalation_rate: Math.round((overEsc / results.length) * 100),
    unsafe_rate: Math.round((unsafe / results.length) * 100),
    results,
  });
}
