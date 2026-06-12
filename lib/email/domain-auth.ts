/**
 * SPF/DMARC preflight — brief v3 §3.1 (2026-06-13).
 *
 * Avant d'envoyer depuis le domaine PROPRE d'un client (SMTP custom), on vérifie
 * que le domaine est authentifié (SPF + DMARC publiés). Un envoi depuis un
 * domaine non authentifié brûle sa réputation de façon irréversible. DKIM dépend
 * d'un sélecteur propre au provider (non devinable de façon fiable) → on impose
 * SPF + DMARC (les deux vérifiables) et on recommande DKIM.
 */
import { promises as dns } from 'dns';

export interface DomainAuth { ok: boolean; spf: boolean; dmarc: boolean; reason?: string }

const cache = new Map<string, { at: number; data: DomainAuth }>();
const TTL_MS = 6 * 3600 * 1000; // 6h — les enregistrements DNS bougent rarement

export function domainOf(email: string): string {
  return (String(email || '').split('@')[1] || '').trim().toLowerCase();
}

export async function checkDomainAuth(domain: string): Promise<DomainAuth> {
  if (!domain) return { ok: false, spf: false, dmarc: false, reason: 'domaine absent' };
  const now = Date.now();
  const cached = cache.get(domain);
  if (cached && now - cached.at < TTL_MS) return cached.data;

  let spf = false;
  let dmarc = false;
  try {
    const txt = await dns.resolveTxt(domain);
    spf = txt.some(r => r.join('').toLowerCase().includes('v=spf1'));
  } catch { /* no TXT / NXDOMAIN */ }
  try {
    const txt = await dns.resolveTxt('_dmarc.' + domain);
    dmarc = txt.some(r => r.join('').toLowerCase().includes('v=dmarc1'));
  } catch { /* no DMARC */ }

  const ok = spf && dmarc;
  const missing = [!spf ? 'SPF' : null, !dmarc ? 'DMARC' : null].filter(Boolean).join(' + ');
  const data: DomainAuth = { ok, spf, dmarc, reason: ok ? undefined : `Manque ${missing}` };
  cache.set(domain, { at: now, data });
  return data;
}
