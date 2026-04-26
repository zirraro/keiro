/**
 * Dissatisfaction signals from client behaviour.
 *
 * When a client SKIPS or DELETES a post Léna drafted, that's a strong
 * signal: she generated something the client didn't want to publish.
 * The same client behaviour over time forms a pattern — "client always
 * skips reels", "client always deletes overlay-heavy posts", "client
 * never publishes posts about competitors", etc.
 *
 * This module aggregates those signals for ONE user and returns:
 *   - a structured summary (counts per dimension)
 *   - a directive block to inject into Léna's prompt so the next
 *     generation avoids the patterns the client has been killing
 *
 * It only reads — never modifies. Cheap (one query, no LLM).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type DissatisfactionSummary = {
  totalSkipped: number;
  totalGenerated: number;
  skipRate: number;
  byPillar: Record<string, number>;
  byFormat: Record<string, number>;
  bySubject: Record<string, number>;
  withOverlay: number;
  withoutOverlay: number;
};

const SUBJECT_PATTERNS: Array<[string, RegExp]> = [
  ['product_hero',     /(plat|dish|bouquet|soin|product|produit|item|pi.ce|montre|robe|sac)/],
  ['venue_atmosphere', /(int.rieur|interior|salle|devanture|fa.ade|room|venue|terrasse|comptoir|atelier)/],
  ['people_team',      /(.quipe|team|chef|artisan|barbier|coiffeur|fleuriste|esth.ticien|barista)/],
  ['people_customer',  /(client|customer|consumer|cliente|guest|visiteur)/],
  ['process_craft',    /(main|hand|geste|gesture|making|fabrication|cooking|knead|cut|d.coupe)/],
  ['detail_texture',   /(d.tail|detail|texture|gros plan|close-up|macro)/],
  ['behind_scenes',    /(coulisse|backstage|behind|prepa|setup|installation)/],
  ['news_tie',         /(actu|news|trend|breaking|today|aujourd|tendance)/],
  ['social_proof',     /(testimonial|t.moignage|avant.apr.s|before.after|r.sultat)/],
];

function categorize(visual: string): string {
  const v = (visual || '').toLowerCase();
  for (const [cat, re] of SUBJECT_PATTERNS) if (re.test(v)) return cat;
  return 'lifestyle';
}

export async function loadDissatisfactionSummary(
  supabase: SupabaseClient,
  userId: string,
  windowDays = 30,
): Promise<DissatisfactionSummary | null> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();

  // Pull every row Léna generated for this user in the window — we
  // need both the killed ones and the kept ones to compute a rate.
  const { data: rows, error } = await supabase
    .from('content_calendar')
    .select('status, pillar, format, visual_description, overlay_text')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(200);
  if (error || !rows) return null;

  const killed = rows.filter(r => r.status === 'skipped' || r.status === 'deleted' || r.status === 'rejected');
  const summary: DissatisfactionSummary = {
    totalSkipped: killed.length,
    totalGenerated: rows.length,
    skipRate: rows.length > 0 ? killed.length / rows.length : 0,
    byPillar: {},
    byFormat: {},
    bySubject: {},
    withOverlay: 0,
    withoutOverlay: 0,
  };

  for (const r of killed) {
    if (r.pillar) summary.byPillar[r.pillar] = (summary.byPillar[r.pillar] || 0) + 1;
    if (r.format) summary.byFormat[r.format] = (summary.byFormat[r.format] || 0) + 1;
    const cat = categorize(r.visual_description || '');
    summary.bySubject[cat] = (summary.bySubject[cat] || 0) + 1;
    if (r.overlay_text && (r.overlay_text as any).text) summary.withOverlay++;
    else summary.withoutOverlay++;
  }

  return summary;
}

/**
 * Turn the raw summary into a directive block for Léna's prompt.
 * Returns empty string when there's no meaningful signal yet (too
 * few kills, or skip rate below 20%).
 */
export function dissatisfactionPromptBlock(s: DissatisfactionSummary | null): string {
  if (!s) return '';
  if (s.totalSkipped < 3) return '';                    // not enough signal yet
  if (s.skipRate < 0.20) return '';                     // client is mostly happy

  const lines: string[] = [];
  // Most-killed pillar
  const pillarTop = Object.entries(s.byPillar).sort((a, b) => b[1] - a[1])[0];
  if (pillarTop && pillarTop[1] >= 2) {
    lines.push(`- Pilier "${pillarTop[0]}" : ${pillarTop[1]} suppressions sur ${s.totalSkipped} → réduire ou changer de traitement`);
  }
  // Most-killed format
  const formatTop = Object.entries(s.byFormat).sort((a, b) => b[1] - a[1])[0];
  if (formatTop && formatTop[1] >= 2) {
    lines.push(`- Format "${formatTop[0]}" : ${formatTop[1]} suppressions → le client semble moins aimer ce format, baisse sa fréquence`);
  }
  // Most-killed subject
  const subjectTop = Object.entries(s.bySubject).sort((a, b) => b[1] - a[1])[0];
  if (subjectTop && subjectTop[1] >= 2) {
    lines.push(`- Sujet "${subjectTop[0]}" : ${subjectTop[1]} suppressions → à éviter pour le prochain post sauf raison forte`);
  }
  // Overlay verdict
  if (s.withOverlay >= 3 && s.withOverlay > s.withoutOverlay) {
    lines.push(`- ${s.withOverlay} posts AVEC overlay supprimés (vs ${s.withoutOverlay} sans) → le client préfère SANS texte sur l'image, sois plus strict sur l'overlay`);
  }
  if (s.withoutOverlay >= 3 && s.withoutOverlay > s.withOverlay * 1.5) {
    lines.push(`- ${s.withoutOverlay} posts SANS overlay supprimés (vs ${s.withOverlay} avec) → le client semble vouloir plus de texte stratégique sur les visuels`);
  }

  if (lines.length === 0) return '';

  return `\n━━━ SIGNAUX CLIENT (à intégrer à la stratégie) ━━━
Le client a supprimé ou ignoré ${s.totalSkipped} de tes ${s.totalGenerated} derniers posts (${Math.round(s.skipRate * 100)}%). Patterns observés :
${lines.join('\n')}

→ Pour ce post, ajuste en conséquence. Évite de reproduire ce qui a été supprimé sauf si tu as une vraie nouvelle raison de le faire.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
