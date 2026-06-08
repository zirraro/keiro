/**
 * Managed email provisioning — backend-caché path.
 *
 * Founder ask 2026-06-08: instead of asking the client to set up a
 * Brevo / Resend account themselves (which exposes them to "free"
 * tiers and reduces our perceived value), KeiroAI takes care of
 * provisioning the sender + domain authentication on its master
 * Brevo account. The client only sees "Email professionnel
 * @theirdomain.com — connecté ✓".
 *
 * Brevo branding is never mentioned in the UI. The client provides:
 *   - legal_name
 *   - contact_email  (where the confirmation lands)
 *   - domain         (e.g. theirsite.com)
 *   - from_email     (e.g. contact@theirsite.com)
 *
 * We:
 *   1. Create a sender for from_email on our master Brevo account.
 *   2. Add the domain to Brevo's domain authentication.
 *   3. Return the SPF + DKIM + DMARC records the client must paste at
 *      their registrar (Cloudflare, OVH, Gandi, ...).
 *   4. Persist the managed-sender config in `profiles.smtp_*` so the
 *      rest of the pipeline can use it transparently.
 *
 * Cost model: ~1-2€ per client per month at typical Hugo volume
 * (2-5k emails/month). KeiroAI absorbs this — covered by the plan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function brevoCreateSender(email: string, name: string): Promise<{ ok: boolean; senderId?: number; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY missing' };
  try {
    const r = await fetch('https://api.brevo.com/v3/senders', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ name, email }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      // 400 with code 'duplicate_parameter' means the sender already
      // exists — treat as success and look it up.
      if (data?.code === 'duplicate_parameter' || /already exists/i.test(data?.message || '')) {
        return { ok: true };
      }
      return { ok: false, error: `Brevo sender HTTP ${r.status}: ${(data?.message || '').substring(0, 200)}` };
    }
    return { ok: true, senderId: data.id };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

async function brevoCreateDomain(domain: string): Promise<{ ok: boolean; dnsRecords?: any[]; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY missing' };
  try {
    const r = await fetch('https://api.brevo.com/v3/senders/domains', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ name: domain }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok && data?.code !== 'duplicate_parameter') {
      return { ok: false, error: `Brevo domain HTTP ${r.status}: ${(data?.message || '').substring(0, 200)}` };
    }
    // Fetch the DNS records (works for both new and existing domain).
    const g = await fetch(`https://api.brevo.com/v3/senders/domains/${encodeURIComponent(domain)}`, {
      headers: { 'accept': 'application/json', 'api-key': apiKey },
    });
    const gdata = await g.json().catch(() => ({}));
    if (!g.ok) return { ok: false, error: `Brevo domain GET HTTP ${g.status}` };
    const records: any[] = [];
    if (gdata?.dns_records?.dkim_record?.value) {
      records.push({ type: 'TXT', host: gdata.dns_records.dkim_record.host_name, value: gdata.dns_records.dkim_record.value, label: 'DKIM' });
    }
    if (gdata?.dns_records?.brevo_code?.value) {
      records.push({ type: 'TXT', host: gdata.dns_records.brevo_code.host_name, value: gdata.dns_records.brevo_code.value, label: 'Vérification' });
    }
    if (gdata?.dns_records?.dmarc_record?.value) {
      records.push({ type: 'TXT', host: gdata.dns_records.dmarc_record.host_name, value: gdata.dns_records.dmarc_record.value, label: 'DMARC' });
    }
    return { ok: true, dnsRecords: records };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const legalName: string = (body.legal_name || '').trim();
  const contactEmail: string = (body.contact_email || '').trim().toLowerCase();
  const domain: string = (body.domain || '').trim().toLowerCase();
  const fromEmail: string = (body.from_email || '').trim().toLowerCase();

  if (!legalName || !contactEmail || !domain || !fromEmail) {
    return NextResponse.json({ ok: false, error: 'legal_name, contact_email, domain, from_email requis' }, { status: 400 });
  }
  if (!fromEmail.endsWith('@' + domain)) {
    return NextResponse.json({ ok: false, error: 'from_email must belong to the declared domain' }, { status: 400 });
  }

  const supabase = sb();

  // 1) Provision the sender on our master Brevo account
  const senderRes = await brevoCreateSender(fromEmail, legalName);
  if (!senderRes.ok) {
    return NextResponse.json({ ok: false, step: 'sender', error: senderRes.error }, { status: 502 });
  }

  // 2) Provision the domain auth + collect DNS records
  const domainRes = await brevoCreateDomain(domain);
  if (!domainRes.ok) {
    return NextResponse.json({ ok: false, step: 'domain', error: domainRes.error }, { status: 502 });
  }

  // 3) Persist the managed-sender state on the client's profile so
  //    Hugo / send-with-fallback / status banners read it uniformly.
  await supabase.from('profiles').update({
    managed_email_provisioned_at: new Date().toISOString(),
    managed_email_from: fromEmail,
    managed_email_legal_name: legalName,
    managed_email_contact: contactEmail,
    managed_email_domain: domain,
    managed_email_status: 'pending_dns', // turns 'connected' once verified
  } as any).eq('id', user.id);

  return NextResponse.json({
    ok: true,
    from_email: fromEmail,
    domain,
    dns_records: domainRes.dnsRecords,
    next_step: 'Coller les enregistrements DNS chez ton registrar — la vérification est automatique sous 24h.',
  });
}

/**
 * GET — return current managed-email status for the authed user.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const supabase = sb();
  const { data: profile } = await supabase
    .from('profiles')
    .select('managed_email_from, managed_email_legal_name, managed_email_domain, managed_email_status, managed_email_provisioned_at')
    .eq('id', user.id)
    .maybeSingle();
  return NextResponse.json({ ok: true, profile: profile || null });
}
