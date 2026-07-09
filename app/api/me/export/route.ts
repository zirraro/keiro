import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * EXPORT DE DONNÉES (C4 / RGPD portabilité + argument confiance anti-lock-in).
 * « Exporter tout » : le client télécharge ses données en JSON. Lecture via le
 * client authentifié (RLS = il ne lit que SES lignes). Best-effort par table.
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const safe = async (fn: () => Promise<any>) => { try { const { data } = await fn(); return data || []; } catch { return []; } };

  const [profile, content, prospects, brandKit] = await Promise.all([
    safe(() => supabase.from('profiles').select('id, email, full_name, company_name, business_type, city, brand_tone, content_themes, subscription_plan, created_at').eq('id', user.id).single().then((r: any) => ({ data: r.data ? [r.data] : [] }))),
    safe(() => supabase.from('content_calendar').select('id, platform, status, caption, format, scheduled_time, published_at, engagement_data, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(2000)),
    safe(() => supabase.from('crm_prospects').select('id, name, business_type, city, status, temperature, email, phone, website, instagram, created_at').eq('user_id', user.id).limit(5000)),
    safe(() => supabase.from('brand_kits').select('*').eq('org_id', user.id).limit(1)),
  ]);

  const bundle = {
    export_meta: { user_id: user.id, email: user.email, exported_at: new Date().toISOString(), format: 'keiroai-data-export-v1' },
    profile: profile[0] || null,
    brand_kit: brandKit[0] || null,
    content_calendar: content,
    crm_prospects: prospects,
    counts: { content: content.length, prospects: prospects.length },
    note: 'Tes données t\'appartiennent. Contenu généré : voir §7 des CGU (licence large et perpétuelle).',
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="keiroai-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
