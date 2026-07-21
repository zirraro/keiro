/**
 * WhatsApp Embedded Signup (Coexistence) — client-side launcher.
 *
 * Founder 2026-07-20/21 : « le moins de friction possible — le client connecte
 * son numéro et ça part ». Ce helper lance le flux officiel Meta Embedded Signup
 * (popup Facebook), récupère le `phone_number_id` + `waba_id` via l'événement
 * `WA_EMBEDDED_SIGNUP` et les POST à /api/agents/whatsapp/connect (mapping multi-
 * tenant + abonnement de notre app à la WABA du client).
 *
 * Gating : nécessite le Configuration ID (obtenu après l'Advanced Access Meta).
 * Tant qu'il n'est pas dispo (`NEXT_PUBLIC_WA_CONFIG_ID` absent), on retombe sur
 * l'activation Stella (checkout add-on) pour que le bouton ne soit JAMAIS mort.
 */

const FB_APP_ID = process.env.NEXT_PUBLIC_FB_APP_ID || '1240886857588819';
const WA_CONFIG_ID = process.env.NEXT_PUBLIC_WA_CONFIG_ID || '';
const GRAPH_VERSION = 'v21.0';

let sdkLoading: Promise<void> | null = null;

function loadFbSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as any).FB) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<void>((resolve, reject) => {
    (window as any).fbAsyncInit = function () {
      try {
        (window as any).FB.init({ appId: FB_APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
        resolve();
      } catch (e) { reject(e as Error); }
    };
    const id = 'facebook-jssdk';
    if (document.getElementById(id)) { resolve(); return; }
    const js = document.createElement('script');
    js.id = id;
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    js.async = true; js.defer = true; js.crossOrigin = 'anonymous';
    js.onerror = () => reject(new Error('FB SDK failed to load'));
    document.body.appendChild(js);
  });
  return sdkLoading;
}

export interface EmbeddedSignupOptions {
  /** Called with the mapping once Meta returns it (before our /connect POST resolves). */
  onIds?: (ids: { phone_number_id: string; waba_id: string }) => void;
  /** Called when connect succeeds (our API responded ok). */
  onSuccess?: () => void;
  /** Called on any failure (SDK, user cancel, API). */
  onError?: (msg: string) => void;
  /** Fallback when no Configuration ID is set yet (e.g. open the Stella checkout). */
  onUnavailable?: () => void;
}

/** True once the founder has set the Configuration ID (post Advanced Access). */
export function embeddedSignupReady(): boolean {
  return !!WA_CONFIG_ID;
}

export async function launchWhatsAppEmbeddedSignup(opts: EmbeddedSignupOptions = {}): Promise<void> {
  if (!WA_CONFIG_ID) { opts.onUnavailable?.(); return; }
  try {
    await loadFbSdk();
  } catch {
    opts.onError?.('Facebook SDK indisponible'); return;
  }
  const FB = (window as any).FB;
  if (!FB) { opts.onError?.('Facebook SDK indisponible'); return; }

  let captured: { phone_number_id?: string; waba_id?: string } = {};
  const messageListener = (event: MessageEvent) => {
    let host = '';
    try { host = new URL(event.origin).hostname; } catch { return; }
    if (!/(^|\.)facebook\.com$/.test(host)) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data?.type === 'WA_EMBEDDED_SIGNUP') {
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
          captured = { phone_number_id: data.data?.phone_number_id, waba_id: data.data?.waba_id };
        } else if (data.event === 'CANCEL') {
          opts.onError?.('Connexion annulée');
        }
      }
    } catch { /* not our message */ }
  };
  window.addEventListener('message', messageListener);

  const finish = async () => {
    window.removeEventListener('message', messageListener);
    if (!captured.phone_number_id || !captured.waba_id) {
      opts.onError?.('Numéro non récupéré — réessaie'); return;
    }
    opts.onIds?.({ phone_number_id: captured.phone_number_id, waba_id: captured.waba_id });
    try {
      const r = await fetch('/api/agents/whatsapp/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(captured),
      });
      const d = await r.json();
      if (d?.ok) opts.onSuccess?.();
      else opts.onError?.(d?.error || 'Échec de la connexion');
    } catch (e: any) {
      opts.onError?.(e?.message || 'Échec de la connexion');
    }
  };

  FB.login(
    (_response: any) => { void finish(); },
    {
      config_id: WA_CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    },
  );
}
