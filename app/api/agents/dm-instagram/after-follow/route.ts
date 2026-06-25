import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/agents/dm-instagram/after-follow
 *
 * After-follow auto-DM pipeline. Founder ask 2026-05-24: once Jade has
 * followed an account (and the prospect has had time to notice), send
 * them a personalised DM with a Seedream visual that previews what
 * KeiroAI would produce for THEIR business specifically.
 *
 * Eligibility for each prospect:
 *   - dm_followed_at IS NOT NULL (client tapped "fait" on the manual queue)
 *   - dm_followed_at older than 24h, newer than 96h (sweet spot for
 *     reciprocity without feeling pushy)
 *   - dm_status = 'followed_by_user' (not yet queued for DM)
 *   - has instagram handle
 *
 * Auth: CRON_SECRET only.
 * Body: { user_id?: string } — scope to one client (passed by per-client cron)
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  return !!cronSecret && auth === `Bearer ${cronSecret}`;
}

const MAX_PER_RUN = 25; // matches dm warmup pace — IG anti-spam friendly

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const clientUserId: string | null = body?.user_id || null;
  if (!clientUserId) {
    return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 });
  }

  const supabase = sb();
  const now = new Date().toISOString();
  const since96h = new Date(Date.now() - 96 * 3600 * 1000).toISOString();
  const before24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Pick eligible prospects
  const { data: candidates } = await supabase
    .from('crm_prospects')
    .select('id, company, type, instagram, score, angle_approche, dm_followed_at, quartier, notes, user_id, verified')
    .eq('user_id', clientUserId)
    .eq('dm_status', 'followed_by_user')
    .gte('dm_followed_at', since96h)
    .lte('dm_followed_at', before24h)
    .not('instagram', 'is', null)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(MAX_PER_RUN);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, message: 'No follow-backs ready for DM yet.' });
  }

  // Brand context for personalisation
  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('company_name, business_type, brand_tone, main_products, ai_summary')
    .eq('user_id', clientUserId)
    .maybeSingle();

  const brandLine = dossier
    ? `Commerce: ${dossier.company_name || ''}. Type: ${dossier.business_type || ''}. Ton: ${dossier.brand_tone || 'chaleureux'}.`
    : 'Commerce local français.';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

  const { generateJadeImage } = await import('@/lib/visuals/jade-prompter');

  let queued = 0;
  let failed = 0;

  for (const p of candidates) {
    const handle = String(p.instagram || '').replace(/^@/, '').trim();
    if (!handle) continue;

    try {
      // 1. Compose the message (Haiku — cheap + fast, conversational tone)
      let message = `Salut ! Vu que tu nous as suivi récemment, je voulais te montrer un visuel qu'on a fait pour des commerces comme le tien. Tu me dis ce que tu en penses ?`;
      if (anthropic) {
        try {
          const r = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 220,
            system: `Tu es ${dossier?.company_name || 'le propriétaire'} qui DM un prospect Instagram. Le prospect t'a follow back — tu le remercies et tu enchaînes naturellement. Pas commercial, pas robotique. Tutoiement. Une vraie discussion.

QUALITY BAR:
- 2 phrases max, super naturel.
- Mentionne le visuel qu'on lui envoie (un aperçu de ce qu'on ferait pour son business).
- Termine par une question ouverte courte (ex: "ton avis ?", "ça te parle ?").
- PAS de "merci pour le follow", PAS de "bonjour" formel, PAS d'emoji spam (1 max), PAS de "DM-moi".`,
            messages: [{ role: 'user', content:
`Brand owner context: ${brandLine}
Prospect cible: @${handle} — ${p.company || ''} (${p.type || 'commerce'})${p.quartier ? `, ${p.quartier}` : ''}.
${p.angle_approche ? `Angle déjà identifié: ${p.angle_approche}` : ''}

Tu lui envoies un DM pour engager la conversation après son follow. Tu lui annonces un visuel personnalisé en pièce jointe. Réponds UNIQUEMENT avec le texte du DM (pas de guillemets, pas de "DM:" préfixe).`
            }],
          });
          message = r.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('')
            .trim()
            .slice(0, 600) || message;
        } catch { /* fall back to template */ }
      }

      // 2. Generate the visual — same quality bar as Hugo's email
      // visuals. Type-specific cues so each visual reads as "for this
      // niche" instead of generic stock. Founder bar: zero tolerance
      // for low-quality personalised content.
      const TYPE_CUES: Record<string, string> = {
        restaurant: 'Hero plate shot, warm tungsten lighting, dark wood table, herb garnish, shallow depth of field. Editorial food photography.',
        brasserie: 'Hero plate shot, warm tungsten lighting, dark wood table, herb garnish, shallow depth of field. Editorial food photography.',
        bar: 'Cocktail close-up, condensation on glass, moody backlight with bokeh, deep blacks. Editorial drink photography.',
        hotel: 'Suite interior, golden hour light through large windows, layered textiles, cinematic warm tones.',
        boutique: 'Curated product flat-lay on neutral background, soft daylight, premium materials in focus.',
        coach: 'Action shot of a coach mid-session, soft afternoon light, athletic but warm aesthetic.',
        coiffeur: 'Salon interior detail, mirror reflection, soft daylight, premium scissors close-up.',
        barbier: 'Vintage barbershop interior, leather chair detail, warm tungsten light, craftsman aesthetic.',
        fleuriste: 'Seasonal bouquet on linen table, soft morning light, watercolor palette, slightly out-of-focus background.',
        caviste: 'Bottle on dark wood with subtle backlight, focused label visible but abstract.',
        salon_beaute: 'Spa detail shot, white linen, eucalyptus branch, candle, soft morning light.',
        salon_de_beaute: 'Spa detail shot, white linen, eucalyptus branch, candle, soft morning light.',
        traiteur: 'Plated catering tableau, candlelight, layered textures, elegant lighting.',
        photographe: 'Behind-the-camera lifestyle shot, camera body close-up, soft window light.',
        patisserie: 'Pastry display close-up, soft pink and gold tones, mouth-watering hero shot.',
        boulangerie: 'Bread loaves on dark slate, golden crust catching light, flour dust in beam.',
        fromagerie: 'Cheese board flat-lay on slate, dramatic side-lighting, varied textures.',
      };
      const typeKey = (p.type || '').toString().toLowerCase().replace(/[\s-]/g, '_');
      const typeCue = TYPE_CUES[typeKey] || null;

      // Only generate when the type is concrete enough — same quality
      // gate as Hugo. Skips silently if generic / unknown type.
      let visualUrl: string | null = null;
      if (typeCue) {
        const visualBrief = `${typeCue} Magazine-quality, scroll-stopping Instagram post the brand owner of ${p.company || handle} would actually share. Format: 4:5 portrait.`;
        visualUrl = await Promise.race<string | null>([
          generateJadeImage(visualBrief, 'post', clientUserId),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 20000)),
        ]);
      }

      // 3. Insert into dm_queue (the existing send-queue cron picks it up)
      const { error: qErr } = await supabase.from('dm_queue').insert({
        prospect_id: p.id,
        channel: 'instagram',
        handle,
        message,
        personalization: JSON.stringify({
          source: 'after_follow',
          visual_url: visualUrl,
          followed_at: p.dm_followed_at,
          angle: p.angle_approche || null,
        }),
        priority: (p.score || 50) + 20, // bonus priority for warm follow-back leads
        status: 'pending',
        created_at: now,
      });

      if (qErr) { failed++; continue; }

      // 4. Mark dm_status so we don't re-pick this prospect
      await supabase.from('crm_prospects').update({
        dm_status: 'queued',
        dm_queued_at: now,
        dm_message: message,
        active_channel: 'dm', // coordination multi-canal (audit 2026-06-25)
        updated_at: now,
      }).eq('id', p.id);

      // 5. CRM activity
      await supabase.from('crm_activities').insert({
        prospect_id: p.id,
        type: 'dm_after_follow_queued',
        description: `DM after-follow préparé pour @${handle}${visualUrl ? ' avec visuel personnalisé' : ''}`,
        data: {
          channel: 'instagram',
          handle,
          visual_url: visualUrl,
          source: 'after_follow_pipeline',
        },
        created_at: now,
      });

      queued++;
    } catch (e: any) {
      failed++;
    }
  }

  // Run summary
  await supabase.from('agent_logs').insert({
    agent: 'dm_instagram',
    action: 'after_follow_run',
    status: 'success',
    user_id: clientUserId,
    data: { candidates: candidates.length, queued, failed },
    created_at: now,
  });

  return NextResponse.json({ ok: true, candidates: candidates.length, queued, failed });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
