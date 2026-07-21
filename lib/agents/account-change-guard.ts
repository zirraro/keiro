/**
 * Garde-fou CHANGEMENT DE COMPTE SOCIAL.
 *
 * 2026-06-24 — Incident : un nouveau compte TikTok connecté a déclenché la
 * publication IMMÉDIATE de ~60 posts programmés pour l'ANCIEN compte (burst =
 * tueur de compte neuf). Founder : « si un client change de compte TikTok/Insta,
 * on ne publie PAS tout le backlog direct ; on détecte le compte différent, on
 * ARCHIVE les posts déjà planifiés (sans publier) et on PROPOSE de maintenir ou
 * changer la programmation. »
 *
 * Mécanique (sans DDL) : on mémorise le dernier compte publié par réseau dans
 * org_agent_configs.config (agent_id='content') → `last_publish_account_<net>`.
 * À chaque tentative de publication, si le compte connecté DIFFÈRE du dernier
 * mémorisé : on archive le backlog publiable de ce réseau, on notifie le client,
 * on enregistre le nouveau compte, et on ABORTE la publication en cours (le post
 * faisait partie du backlog de l'ancien compte). Les prochains posts (créés
 * après) repartiront proprement, au rythme warming.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Net = 'tiktok' | 'instagram' | 'linkedin';

export async function guardAccountChange(
  supabase: SupabaseClient,
  userId: string | null,
  platform: Net,
  currentAccountId: string | null | undefined,
): Promise<{ changed: boolean; archived: number; firstTime: boolean }> {
  if (!userId || !currentAccountId) return { changed: false, archived: 0, firstTime: false };
  const key = `last_publish_account_${platform}`;
  try {
    const { data: cfgRow } = await supabase.from('org_agent_configs')
      .select('id, config').eq('user_id', userId).eq('agent_id', 'content')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const cfg = (cfgRow?.config as any) || {};
    const last = cfg[key];
    const writeCfg = async (val: string) => {
      const next = { ...cfg, [key]: val };
      if (cfgRow?.id) await supabase.from('org_agent_configs').update({ config: next }).eq('id', cfgRow.id);
      else await supabase.from('org_agent_configs').insert({ user_id: userId, agent_id: 'content', config: next });
    };

    const same = !!last && String(last) === String(currentAccountId);
    if (same) return { changed: false, archived: 0, firstTime: false };

    // Backlog "dû MAINTENANT" (≤ aujourd'hui) = ce qui partirait en rafale.
    const today = new Date().toISOString().split('T')[0];
    const { data: queued } = await supabase.from('content_calendar')
      .select('id').eq('user_id', userId).eq('platform', platform)
      .in('status', ['approved', 'draft', 'publish_failed', 'retry_pending'])
      .lte('scheduled_date', today);
    const backlogDueNow = queued?.length || 0;

    // 2026-06-24 (fix audit BUG#1) — un compte SAIN ne publie jamais un gros
    // backlog d'un coup. On archive (= anti-burst) DANS 2 cas :
    //  - changement de compte (last défini et différent), OU
    //  - PREMIÈRE connexion (last absent) avec un gros backlog dû maintenant
    //    (= exactement l'incident : nouveau compte + 60 posts en attente).
    // Sinon (1ère fois, backlog normal ≤ seuil) : on enregistre et on laisse.
    // Founder 2026-07-21 : à TOUTE connexion (nouveau compte OU reconnexion),
    // JAMAIS de rafale — on publie AU PLUS 1 post (le prochain dû, s'il entre dans
    // le planning), le reste du backlog dû est archivé (le planning FUTUR reste
    // intact). Seuil ramené à 1.
    const BURST_THRESHOLD = 1;
    const isChange = !!last; // last défini + différent (same déjà géré)
    const firstTimeBurst = !last && backlogDueNow > BURST_THRESHOLD;

    if (!isChange && !firstTimeBurst) {
      await writeCfg(String(currentAccountId));
      return { changed: false, archived: 0, firstTime: true };
    }

    let archived = 0;
    if (queued && queued.length) {
      // Changement de compte → on archive TOUT (les posts étaient pour l'ancien
      // compte). Première connexion → on GARDE 1 post (le premier dû) et on
      // archive le reste = « 1 seule publication à la connexion ».
      const allIds = queued.map((q: any) => q.id);
      const ids = isChange ? allIds : allIds.slice(1);
      if (ids.length) {
        await supabase.from('content_calendar')
          .update({ status: 'archived', publish_diagnostic: 'account_connect_anti_burst', updated_at: new Date().toISOString() })
          .in('id', ids);
      }
      archived = ids.length;
    }
    await writeCfg(String(currentAccountId));
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'account_changed_archived', status: 'warning', user_id: userId,
      data: { platform, archived, new_account: String(currentAccountId), prev_account: String(last), note: 'compte changé → backlog archivé (pas publié). Proposer keep/change au client.' },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});
    try {
      const { notifyClient } = await import('@/lib/agents/notify-client');
      await notifyClient(supabase, {
        userId, agent: 'content', type: 'action',
        title: `Nouveau compte ${platform} détecté`,
        message: `On a détecté un changement de compte ${platform}. Tes ${archived} publication(s) programmée(s) pour l'ancien compte ont été ARCHIVÉES (pas publiées d'un coup). Dis-nous si tu veux les republier sur le nouveau compte (au rythme warming) ou repartir d'une nouvelle programmation.`,
        data: { platform, archived, action: 'account_changed' },
      });
    } catch { /* notif best-effort */ }
    return { changed: true, archived, firstTime: false };
  } catch {
    return { changed: false, archived: 0, firstTime: false };
  }
}
