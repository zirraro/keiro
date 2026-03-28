import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Widget-Key',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin') || '*') });
}

/**
 * POST /api/widget/track
 * Track visitor behavior on client website.
 * Collects: page views, time on site, device, referrer, cart events.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';

  try {
    const { widget_key, session_id, event, data } = await req.json();
    if (!widget_key || !session_id || !event) {
      return NextResponse.json({ ok: false }, { status: 400, headers: corsHeaders(origin) });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Validate widget key
    const { data: config } = await supabase
      .from('widget_configs')
      .select('org_id')
      .eq('widget_key', widget_key)
      .eq('is_active', true)
      .single();

    if (!config) {
      return NextResponse.json({ ok: false }, { status: 403, headers: corsHeaders(origin) });
    }

    // Geo info from Vercel headers
    const geo = {
      city: req.headers.get('x-vercel-ip-city') || null,
      country: req.headers.get('x-vercel-ip-country') || null,
      region: req.headers.get('x-vercel-ip-country-region') || null,
    };

    // Update visitor profile in widget_conversations
    const { data: existing } = await supabase
      .from('widget_conversations')
      .select('visitor_profile')
      .eq('session_id', session_id)
      .single();

    const currentProfile = existing?.visitor_profile || {};
    const updatedProfile = { ...currentProfile };

    // Enrich profile based on event
    if (geo.city) updatedProfile.city = geo.city;
    if (geo.country) updatedProfile.country = geo.country;
    updatedProfile.device = data?.device || currentProfile.device || 'desktop';
    updatedProfile.referrer = data?.referrer || currentProfile.referrer;

    if (event === 'page_view') {
      const pages = currentProfile.pages_viewed || [];
      if (data?.url && !pages.includes(data.url)) pages.push(data.url);
      updatedProfile.pages_viewed = pages.slice(-20); // Keep last 20
      updatedProfile.page_count = pages.length;
    }

    if (event === 'time_update') {
      updatedProfile.time_on_site = data?.seconds || 0;
    }

    if (event === 'cart_update') {
      updatedProfile.cart_items = data?.items || '';
      updatedProfile.cart_value = data?.value || 0;
    }

    if (event === 'returning_visitor') {
      updatedProfile.returning = true;
      updatedProfile.visit_count = (currentProfile.visit_count || 0) + 1;
    }

    if (event === 'product_view') {
      const products = currentProfile.products_viewed || [];
      if (data?.product && !products.includes(data.product)) products.push(data.product);
      updatedProfile.products_viewed = products.slice(-10);
    }

    // Purchase tracking — feeds Louis (comptable) agent
    if (event === 'purchase') {
      updatedProfile.total_purchases = (currentProfile.total_purchases || 0) + 1;
      updatedProfile.total_revenue = (currentProfile.total_revenue || 0) + (data?.amount || 0);
      updatedProfile.last_purchase_at = new Date().toISOString();

      // Log purchase for comptable agent
      await supabase.from('agent_logs').insert({
        agent: 'comptable',
        action: 'purchase_tracked',
        status: 'success',
        data: {
          amount: data?.amount || 0,
          currency: data?.currency || 'EUR',
          product: data?.product || null,
          order_id: data?.order_id || null,
          session_id,
          source: 'widget_tracking',
        },
        created_at: new Date().toISOString(),
        ...(config.org_id ? { org_id: config.org_id } : {}),
      });

      // Also log for marketing analytics
      await supabase.from('agent_logs').insert({
        agent: 'marketing',
        action: 'conversion_tracked',
        status: 'success',
        data: {
          amount: data?.amount,
          product: data?.product,
          source: 'widget',
          visitor_pages: currentProfile.pages_viewed?.length || 0,
          visitor_time: currentProfile.time_on_site || 0,
        },
        created_at: new Date().toISOString(),
        ...(config.org_id ? { org_id: config.org_id } : {}),
      });
    }

    // Upsert
    await supabase.from('widget_conversations').upsert({
      session_id,
      org_id: config.org_id,
      visitor_profile: updatedProfile,
      last_message_at: new Date().toISOString(),
    }, { onConflict: 'session_id' });

    return NextResponse.json({ ok: true }, { headers: corsHeaders(origin) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: corsHeaders(origin) });
  }
}
