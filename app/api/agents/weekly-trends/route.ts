import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/agents/weekly-trends
 * Cron job: runs every Monday at 7h UTC
 * Sends "Lena detected 3 trends this week" email to active users
 * Builds publishing habit + engagement
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !request.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results: { userId: string; status: string }[] = [];

  try {
    // Get all active users (including free plan — engagement hook)
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, email, subscription_plan, business_type, company_name')
      .not('email', 'is', null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No users' });
    }

    // Load shared context
    const { prompt: sharedPrompt } = await loadContextWithAvatar(supabase, 'weekly_trends', undefined);

    // Group users by business_type for batch trend generation
    const businessTypes = new Set(users.map(u => u.business_type || 'general').filter(Boolean));

    // Generate trends per business type
    const trendsByType: Record<string, string> = {};

    for (const bizType of businessTypes) {
      if (!process.env.ANTHROPIC_API_KEY) {
        trendsByType[bizType] = '<p>3 tendances detectees cette semaine.</p>';
        continue;
      }

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: sharedPrompt,
        messages: [{
          role: 'user',
          content: `Tu es Lena, agent Publication & Contenu chez KeiroAI.
Genere un email court et percutant pour un ${bizType || 'petit commercant'} francais.

OBJECTIF: Donner 3 tendances/idees de contenu de la semaine pour les motiver a publier.

FORMAT HTML inline styles:
- Sujet: court, accrocheur avec emoji
- 3 idees concretes de posts (avec format: Reel/Carousel/Story)
- Pour chaque idee: une phrase + le format ideal
- CTA: "Pret a creer ? → keiroai.com/generate"
- Ton: tutoiement, energique, motivant

STYLE: Couleurs KeiroAI (#0c1a3a, #7c3aed), max 200 mots, responsive.
Date: semaine du ${new Date().toLocaleDateString('fr-FR')}.`,
        }],
      });

      trendsByType[bizType] = response.content[0].type === 'text' ? response.content[0].text : '';
      await new Promise(r => setTimeout(r, 500));
    }

    // Send emails
    for (const user of users) {
      if (!user.email) continue;

      const bizType = user.business_type || 'general';
      const html = trendsByType[bizType] || trendsByType['general'] || '<p>3 tendances cette semaine!</p>';

      try {
        if (process.env.RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'Lena - KeiroAI <contact@keiroai.com>',
              to: [user.email],
              subject: `🔥 3 tendances detectees cette semaine pour toi`,
              html,
            }),
          });
        }

        results.push({ userId: user.id, status: 'sent' });
      } catch {
        results.push({ userId: user.id, status: 'error' });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({
      ok: true,
      sent: results.filter(r => r.status === 'sent').length,
      total: results.length,
    });
  } catch (error: any) {
    console.error('[WeeklyTrends] Error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
