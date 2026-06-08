/**
 * Poll Brevo for managed-email domain verification. When the client
 * has pasted the DNS records and Brevo confirms ownership + DKIM/SPF
 * pass, flip profiles.managed_email_status from 'pending_dns' to
 * 'connected' so the rest of the platform stops nagging them.
 *
 * Schedule: every 30 min (verification is async on Brevo's side and
 * DNS propagation takes minutes-hours).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

async function brevoDomainStatus(domain: string): Promise<{ verified: boolean; dkim_status?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { verified: false, error: 'BREVO_API_KEY missing' };
  try {
    const r = await fetch(`https://api.brevo.com/v3/senders/domains/${encodeURIComponent(domain)}`, {
      headers: { 'accept': 'application/json', 'api-key': apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { verified: false, error: `HTTP ${r.status}` };
    const data = await r.json();
    // Brevo returns `verified: true` once DNS is validated.
    const verified = data?.verified === true || data?.authenticated === true || data?.dkim_status === 'enabled';
    return { verified, dkim_status: data?.dkim_status };
  } catch (e: any) {
    return { verified: false, error: e?.message };
  }
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = sb();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id, managed_email_domain, managed_email_status')
    .eq('managed_email_status', 'pending_dns')
    .not('managed_email_domain', 'is', null)
    .limit(50);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, verified: 0 });
  }

  let verifiedCount = 0;
  for (const row of pending as any[]) {
    const status = await brevoDomainStatus(row.managed_email_domain);
    if (status.verified) {
      verifiedCount++;
      await supabase.from('profiles').update({ managed_email_status: 'connected' } as any).eq('id', row.id);
      // Notify the client via in-app banner — done by the chat UI when
      // it reads the status next time. Skip email for now.
    }
  }

  return NextResponse.json({ ok: true, checked: pending.length, verified: verifiedCount });
}
