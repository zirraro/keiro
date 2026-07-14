import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * ATTRIBUTION INSCRIPTION → PROSPECT (founder 14/07 : « traquer si un prospecté
 * s'est inscrit, MÊME avec un autre email, pour arrêter de le relancer »).
 *
 * Un prospecté qui devient client ne doit plus JAMAIS recevoir de démarchage
 * (Hugo email, Jade DM). On rapproche les nouveaux comptes des fiches CRM :
 *   1. email exact (insensible à la casse)
 *   2. MÊME DOMAINE (email pro non-générique) → capte « contact@resto.fr
 *      prospecté, le patron s'inscrit avec jean@resto.fr »
 * Sur match : status='client', séquence STOPPÉE, no_outbound=true, canal libéré,
 * + commentaire lu par tous les agents. Jamais de suppression (règle CRM).
 * Quotidien, idempotent (on saute les fiches déjà 'client').
 */
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr',
  'yahoo.com', 'yahoo.fr', 'icloud.com', 'live.fr', 'live.com', 'orange.fr', 'wanadoo.fr',
  'free.fr', 'sfr.fr', 'laposte.net', 'gmx.com', 'proton.me', 'protonmail.com', 'me.com',
]);

function domainOf(email: string | null | undefined): string | null {
  const m = String(email || '').toLowerCase().trim().match(/@([^@\s]+)$/);
  return m ? m[1] : null;
}

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // Comptes créés récemment (fenêtre large pour rattraper les manqués).
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, created_at')
    .gte('created_at', since)
    .limit(500);

  const results: any[] = [];
  for (const prof of profiles || []) {
    const email = String(prof.email || '').toLowerCase().trim();
    if (!email) continue;
    const dom = domainOf(email);

    // 1) Match email exact.
    let matches: any[] = [];
    const { data: exact } = await supabase
      .from('crm_prospects')
      .select('id, status, email, website, company, user_id, notes')
      .ilike('email', email)
      .neq('status', 'client')
      .limit(10);
    if (exact?.length) matches = exact;

    // 2) Match par domaine pro (pas générique) : email prospect @domaine OU site web contient le domaine.
    if (!matches.length && dom && !GENERIC_DOMAINS.has(dom)) {
      const { data: byDomain } = await supabase
        .from('crm_prospects')
        .select('id, status, email, website, company, user_id, notes')
        .neq('status', 'client')
        .or(`email.ilike.%@${dom},website.ilike.%${dom}%`)
        .limit(10);
      if (byDomain?.length) matches = byDomain;
    }

    for (const m of matches) {
      // Idempotence : déjà signalé converti ?
      const already = typeof m.notes === 'string' && m.notes.includes('[converti→client]');
      if (already) continue;
      const now = new Date().toISOString();
      const stamp = now.slice(0, 10);
      const note = `[converti→client] Ce prospect s'est INSCRIT le ${stamp}${email !== String(m.email || '').toLowerCase() ? ` (autre email : ${email})` : ''} → ne plus démarcher.`;
      const prevNotes = typeof m.notes === 'string' ? m.notes.trim() : '';
      await supabase.from('crm_prospects').update({
        status: 'client',
        email_sequence_status: 'converted',
        no_outbound: true,          // stoppe Hugo (email) ET Jade (DM)
        active_channel: null,
        temperature: 'hot',
        notes: (prevNotes ? `${prevNotes}\n` : '') + note,
        updated_at: now,
      }).eq('id', m.id);
      await supabase.from('crm_activities').insert({
        prospect_id: m.id, user_id: m.user_id || null, type: 'signup_converted',
        description: `🎉 Inscription détectée${email !== String(m.email || '').toLowerCase() ? ` (email ${email})` : ''} — démarchage stoppé`,
        data: { profile_id: prof.id, signup_email: email, match: matches === exact ? 'email' : 'domain' },
        date_activite: now, created_at: now,
      }).then(() => {}, () => {});
      results.push({ prospect: m.id, company: m.company, via: email === String(m.email || '').toLowerCase() ? 'email' : 'domain' });
    }
  }
  return NextResponse.json({ ok: true, converted: results.length, results });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
