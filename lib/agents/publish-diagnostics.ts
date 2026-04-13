/**
 * Publication failure diagnostics + alerts for content agent
 * Detects expired tokens, disconnected accounts, permission issues
 * Sends Resend email alerts to founder for critical failures
 */

export type PubDiagnostic = {
  severity: 'critical' | 'warning' | 'info';
  reason: string;
  platform: string;
  detail: string;
};

export function diagnosePublishFailure(platform: string, error: string): PubDiagnostic {
  const e = (error || '').toLowerCase();

  // Token / auth issues → CRITICAL
  if (e.includes('token') && (e.includes('expir') || e.includes('invalid') || e.includes('refresh failed'))) {
    return { severity: 'critical', reason: 'token_expired', platform, detail: `Token ${platform} expiré ou invalide. Reconnectez le compte.` };
  }
  if (e.includes('not configured') || e.includes('no admin profile')) {
    return { severity: 'critical', reason: 'account_disconnected', platform, detail: `${platform} non connecté. Configurez les tokens dans les paramètres.` };
  }
  if (e.includes('permission') || e.includes('unauthorized') || e.includes('403') || e.includes('oauth')) {
    return { severity: 'critical', reason: 'permissions_revoked', platform, detail: `Permissions ${platform} révoquées. Reconnectez le compte.` };
  }
  if (e.includes('unaudited_client') || e.includes('app review')) {
    return { severity: 'critical', reason: 'app_not_approved', platform, detail: `App ${platform} non auditée. Soumettez App Review sur developers.tiktok.com.` };
  }
  if (e.includes('session') && e.includes('invalid')) {
    return { severity: 'critical', reason: 'session_expired', platform, detail: `Session ${platform} invalide. Reconnectez le compte.` };
  }

  // Rate limiting → warning
  if (e.includes('rate limit') || e.includes('too many') || e.includes('429')) {
    return { severity: 'warning', reason: 'rate_limited', platform, detail: `Rate limit ${platform} atteint. Réessayez plus tard.` };
  }
  // Media errors → warning
  if (e.includes('media') || e.includes('image') || e.includes('video') && (e.includes('invalid') || e.includes('format'))) {
    return { severity: 'warning', reason: 'media_invalid', platform, detail: `Format média rejeté par ${platform}: ${error}` };
  }

  // Unknown → info
  return { severity: 'info', reason: 'unknown', platform, detail: error };
}

/**
 * Detect if a publish error is transient (worth retrying) vs permanent.
 * Transient: network timeouts, rate limits, 5xx server errors, async media still processing.
 * Permanent: token expired, account disconnected, duplicate, invalid media format.
 */
export function isTransientPublishError(error: string): boolean {
  const e = (error || '').toLowerCase();
  if (!e) return false;

  // Explicit permanent signals — never retry these
  if (e.includes('duplicate') || e.includes('non connecte') || e.includes('not configured')
      || e.includes('token invalid') || e.includes('permissions') || e.includes('unaudited')
      || (e.includes('media') && (e.includes('invalid') || e.includes('format')))) {
    return false;
  }

  // Transient signals
  return e.includes('timeout') || e.includes('timed out') || e.includes('etimedout')
      || e.includes('econnreset') || e.includes('econnrefused') || e.includes('enotfound')
      || e.includes('network') || e.includes('fetch failed')
      || e.includes('rate limit') || e.includes('too many') || e.includes('429')
      || e.includes('500') || e.includes('502') || e.includes('503') || e.includes('504')
      || e.includes('server error') || e.includes('temporarily')
      || e.includes('still processing') || e.includes('media not ready');
}

export const MAX_PUBLISH_RETRIES = 3;

/**
 * Exponential backoff for publish retries.
 * Attempt 1 → +15 min, Attempt 2 → +1h, Attempt 3 → +4h.
 */
export function nextRetryDelayMs(retryCount: number): number {
  const schedule = [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000];
  return schedule[Math.min(retryCount, schedule.length - 1)];
}

export async function sendPublishAlert(diagnostic: PubDiagnostic, postInfo: string, supabase: any) {
  // Always log diagnostic to agent_logs
  await supabase.from('agent_logs').insert({
    agent: 'content',
    action: 'publish_diagnostic',
    status: diagnostic.severity === 'critical' ? 'error' : 'warning',
    data: {
      platform: diagnostic.platform,
      reason: diagnostic.reason,
      detail: diagnostic.detail,
      post: postInfo,
      severity: diagnostic.severity,
    },
    created_at: new Date().toISOString(),
  });

  // Critical = send Resend alert to founder
  if (diagnostic.severity === 'critical') {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      try {
        const emoji = diagnostic.reason === 'token_expired' ? '\u{1F6A8}'
          : diagnostic.reason === 'account_disconnected' ? '\u{1F50C}'
          : diagnostic.reason === 'permissions_revoked' ? '\u{1F512}'
          : '\u{26A0}\u{FE0F}';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'KeiroAI Agents <contact@keiroai.com>',
            to: ['contact@keiroai.com'],
            subject: `${emoji} ALERTE Publication ${diagnostic.platform.toUpperCase()} — ${diagnostic.reason.replace(/_/g, ' ')}`,
            html: `
              <h2>${emoji} Agent Content — Échec de publication</h2>
              <p><strong>Plateforme :</strong> ${diagnostic.platform}</p>
              <p><strong>Diagnostic :</strong> ${diagnostic.detail}</p>
              <p><strong>Post concerné :</strong> ${postInfo}</p>
              <p><strong>Action requise :</strong> ${
                diagnostic.reason === 'token_expired' ? 'Reconnectez votre compte ' + diagnostic.platform + ' dans les paramètres KeiroAI.'
                : diagnostic.reason === 'account_disconnected' ? 'Configurez les tokens ' + diagnostic.platform + ' dans votre profil admin.'
                : diagnostic.reason === 'permissions_revoked' ? 'Réautorisez l\'app KeiroAI sur ' + diagnostic.platform + '.'
                : diagnostic.reason === 'app_not_approved' ? 'Soumettez App Review sur developers.tiktok.com.'
                : 'Vérifiez la connexion ' + diagnostic.platform + '.'
              }</p>
              <hr/>
              <p style="color:#888;font-size:12px">Agent Content KeiroAI — alerte automatique</p>
            `,
          }),
        });
        console.log(`[Content] ALERT sent to founder: ${diagnostic.reason} on ${diagnostic.platform}`);
      } catch (alertErr: any) {
        console.error(`[Content] Failed to send alert email:`, alertErr.message);
      }
    }
  }
}
