#!/usr/bin/env node
/**
 * Fix existing content_calendar captions to use the new airy format.
 * Regenerates captions for draft/approved posts that have tassé formatting.
 *
 * Usage: SUPABASE_URL=... SUPABASE_KEY=... ANTHROPIC_API_KEY=... node scripts/fix-captions.mjs
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

if (!supabaseUrl || !supabaseKey || !anthropicKey) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

async function fixCaption(oldCaption, platform, hook, visualDescription) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: `Tu reformates des captions de réseaux sociaux pour qu'elles soient VISUELLEMENT AGRÉABLES sur mobile.

RÈGLES DE REFORMATAGE :
1. Hook punch sur la première ligne (5-10 mots) avec 1 emoji
2. Ligne vide après le hook
3. Corps : 2-4 lignes courtes (max 10 mots/ligne) avec emoji en début de ligne
4. Ligne vide
5. CTA clair sur sa propre ligne
6. NE PAS inclure de hashtags (ils sont ajoutés automatiquement après)
7. Max 3-5 emojis au total (pas de spam)
8. La caption DOIT être cohérente avec le hook et la description visuelle fournis
9. Garde le MÊME MESSAGE et la MÊME IDÉE que l'original
10. Max 800 chars Instagram, 500 chars TikTok

IMPORTANT : Retire les hashtags si présents dans la caption originale.

Output UNIQUEMENT la nouvelle caption, rien d'autre.`,
    messages: [{
      role: 'user',
      content: `Plateforme: ${platform}
Hook: ${hook || 'N/A'}
Description visuelle: ${(visualDescription || '').substring(0, 200)}
Caption originale à reformater:
${oldCaption}`
    }]
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

async function main() {
  // Get all draft/approved posts with captions
  const { data: posts, error } = await supabase
    .from('content_calendar')
    .select('id, caption, platform, hook, visual_description, status, hashtags')
    .in('status', ['draft', 'approved'])
    .not('caption', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching posts:', error);
    process.exit(1);
  }

  console.log(`Found ${posts?.length || 0} posts to fix`);

  let fixed = 0;
  for (const post of posts || []) {
    if (!post.caption || post.caption.trim().length < 20) continue;

    // Check if caption already has good formatting (multiple newlines)
    const newlineCount = (post.caption.match(/\n\n/g) || []).length;
    if (newlineCount >= 2) {
      console.log(`  ✓ Post ${post.id} already well-formatted (${newlineCount} sections)`);
      continue;
    }

    console.log(`  🔧 Fixing post ${post.id} (${post.platform}, ${post.status})...`);

    try {
      // Remove hashtags from caption if they're also in the hashtags field
      let cleanCaption = post.caption;
      if (post.hashtags && Array.isArray(post.hashtags)) {
        // Remove hashtag section at the end
        cleanCaption = cleanCaption.replace(/\n*#[\w\u00C0-\u024F]+(\s+#[\w\u00C0-\u024F]+)*/g, '').trim();
      }

      const newCaption = await fixCaption(
        cleanCaption,
        post.platform || 'instagram',
        post.hook,
        post.visual_description
      );

      if (newCaption && newCaption.trim().length > 20) {
        // Remove any hashtags that Claude might have added
        const finalCaption = newCaption.replace(/\n*#[\w\u00C0-\u024F]+(\s+#[\w\u00C0-\u024F]+)*/g, '').trim();

        await supabase
          .from('content_calendar')
          .update({ caption: finalCaption, updated_at: new Date().toISOString() })
          .eq('id', post.id);

        console.log(`    ✅ Updated: "${finalCaption.substring(0, 60)}..."`);
        fixed++;
      }
    } catch (err) {
      console.error(`    ❌ Error fixing post ${post.id}:`, err.message);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone! Fixed ${fixed}/${posts?.length || 0} posts.`);
}

main().catch(console.error);
