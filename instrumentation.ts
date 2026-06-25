/**
 * Next.js instrumentation — exécuté UNE fois au démarrage du serveur.
 *
 * 2026-06-25 — Digest : timeout 'fetch failed' ~300s sur l'agent content
 * (cron_pre_recap_catchup). Cause = le timeout PAR DÉFAUT d'undici (headers/
 * bodyTimeout 300s) sur les fetch INTERNES de l'app (génération, montage,
 * appels LLM longs). Le worker avait déjà son dispatcher relevé ; ici on fait
 * pareil côté APP Next (runtime nodejs). Le VPS auto-hébergé n'a aucun cap
 * serverless → on autorise 10 min.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { setGlobalDispatcher, Agent } = await import('undici');
      setGlobalDispatcher(new Agent({ headersTimeout: 600000, bodyTimeout: 600000, connectTimeout: 30000 }));
      console.log('[instrumentation] undici timeout relevé à 600s (fetch content/montage longs)');
    } catch (e: any) {
      console.log('[instrumentation] undici dispatcher non posé:', e?.message);
    }
  }
}
