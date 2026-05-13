#!/usr/bin/env node
/**
 * Validate that Léna's news↔business visual rule actually produces
 * images where the connection is OBVIOUS at thumbnail size. Runs 3
 * end-to-end generations (Claude content brief → Seedream image)
 * on canonical P0 scenarios:
 *   - Vague de froid + restaurant
 *   - Saint-Valentin + fleuriste
 *   - Rentrée scolaire + coiffeur
 *
 * Run from /opt/keiro on the VPS — needs ANTHROPIC_API_KEY,
 * SEEDREAM_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in the environment (or a .env.production file in cwd).
 *
 * Output: prints a report to stdout and uploads each generated image to
 * Supabase Storage at validation/lena-news/<timestamp>-<scenario>.jpeg
 * so the founder can open them and judge whether the news anchor is
 * visible in the actual render.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);

// Manually load .env.production if the env isn't already populated
// (helps when invoked via `node` instead of `npm run`).
try {
  if (!process.env.ANTHROPIC_API_KEY) {
    const raw = readFileSync('.env.production', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)="?([^"\n]+)"?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
} catch {}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SEEDREAM_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANTHROPIC_KEY) {
  console.error('ANTHROPIC_API_KEY missing — set it and retry');
  process.exit(1);
}

const SCENARIOS = [
  {
    id: 'cold_snap_restaurant',
    business: 'restaurant bistronomique à Paris (cuisine de marché, plats du jour, ambiance chaleureuse)',
    news: 'Vague de froid annoncée cette semaine en France (températures négatives, neige possible en Île-de-France)',
    expectedNewsCues: ['steam', 'fumant', 'fume', 'foggy', 'embuée', 'embuee', 'cold', 'froid', 'window', 'snow', 'breath', 'condensation'],
    expectedBizCues: ['soup', 'soupe', 'broth', 'bowl', 'plate', 'plat', 'kitchen', 'cuisine', 'tartare', 'wine', 'restaurant'],
  },
  {
    id: 'valentines_florist',
    business: 'fleuriste indépendant à Lyon (compositions sur-mesure, mariages, bouquets atelier)',
    news: 'Saint-Valentin dans 2 semaines (le 14 février), pic de demande pour les bouquets de roses rouges',
    expectedNewsCues: ['rose', 'red', 'pink', 'heart', 'coeur', 'valentin', 'ribbon', 'ruban', 'petal', 'pétal', 'love'],
    expectedBizCues: ['bouquet', 'flower', 'fleur', 'arrangement', 'atelier', 'hands', 'main', 'workshop', 'composition', 'stem'],
  },
  {
    id: 'back_to_school_barber',
    business: 'coiffeur barber pour enfants et ados à Marseille (coupes fade, dégradés, ambiance moderne)',
    news: 'Rentrée scolaire la semaine prochaine, beaucoup de parents amènent leurs enfants pour une coupe fraîche',
    expectedNewsCues: ['school', 'rentrée', 'rentree', 'back-to-school', 'september', 'septembre', 'student', 'kid', 'enfant', 'pencil', 'cartable', 'backpack', 'autumn', 'morning light'],
    expectedBizCues: ['hair', 'cheveux', 'cut', 'coupe', 'fade', 'barber', 'salon', 'chair', 'mirror', 'clipper'],
  },
];

// Lazy-load the content prompt by reading the TS file and crudely
// extracting the system prompt body. Importing TS from .mjs would need
// a transpiler pass, so we cheat: the prompt is a template literal
// returned by a single function, so we grep for the template body.
function loadContentSystemPrompt() {
  const raw = readFileSync('lib/agents/content-prompt.ts', 'utf8');
  const startIdx = raw.indexOf('return `');
  if (startIdx < 0) throw new Error('Could not locate content prompt');
  // Find the matching closing backtick: we know it's followed by ';\n}'
  const endMarker = '`;\n}';
  const endIdx = raw.indexOf(endMarker, startIdx);
  if (endIdx < 0) throw new Error('Could not find end of content prompt');
  let body = raw.slice(startIdx + 'return `'.length, endIdx);
  // Resolve the template-literal date placeholders to today (matches
  // what the production function does at runtime).
  const now = new Date();
  const jour = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const isoDate = now.toISOString().split('T')[0];
  const dayIndex = now.getDay();
  const dowFR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][dayIndex];
  body = body
    .replace(/\$\{jour\}/g, jour)
    .replace(/\$\{isoDate\}/g, isoDate)
    .replace(/\$\{dowFR\}/g, dowFR);
  return body;
}

async function callClaudeForPost(systemPrompt, scenario) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Génère UN post P0 (pillar=trends) pour Instagram en format "post".

Business cible : ${scenario.business}
Actualité / tendance à exploiter : ${scenario.news}

Rappel critique : le visual_description DOIT contenir explicitement à la fois (a) un ou plusieurs éléments contextuels qui signalent l'actu (saison, événement, ambiance, objet symbolique) ET (b) un ou plusieurs éléments business du commerçant cible (produit, geste, espace) dans la même scène. Tu DOIS aussi remplir le champ news_visual_link avec une phrase qui résume le pont visuel.

Réponds UNIQUEMENT en JSON strict, sans markdown.`,
      }],
    }),
  });
  if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  let txt = (data.content?.[0]?.text || '').trim();
  txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const fb = txt.indexOf('{');
  const lb = txt.lastIndexOf('}');
  if (fb >= 0 && lb > fb) txt = txt.slice(fb, lb + 1);
  return JSON.parse(txt);
}

async function generateSeedreamImage(prompt) {
  const NO_TEXT_SUFFIX = '\nCRITICAL: Absolutely NO text, NO letters, NO words anywhere in the image.';
  const NEGATIVE = 'text, words, letters, numbers, signs, watermarks, logos';
  const r = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SEEDREAM_KEY}` },
    body: JSON.stringify({
      model: 'seedream-4-5-251128',
      prompt: (prompt + NO_TEXT_SUFFIX).slice(0, 2000),
      negative_prompt: NEGATIVE,
      size: '1920x1920',
      response_format: 'url',
      seed: -1,
      watermark: false,
    }),
  });
  if (!r.ok) return { ok: false, status: r.status, body: (await r.text()).slice(0, 200) };
  const data = await r.json();
  return { ok: true, url: data.data?.[0]?.url };
}

async function uploadToSupabase(sourceUrl, key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(SB_URL, SB_KEY);
    const path = `validation/lena-news/${key}.jpeg`;
    const { error } = await sb.storage.from('business-assets').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    return sb.storage.from('business-assets').getPublicUrl(path).data?.publicUrl || null;
  } catch (e) {
    console.error('upload error:', e.message);
    return null;
  }
}

function detectCues(text, cues) {
  const t = String(text || '').toLowerCase();
  return cues.filter(c => t.includes(c.toLowerCase()));
}

async function main() {
  console.log('Loading Léna content system prompt…');
  const systemPrompt = loadContentSystemPrompt();
  console.log(`  ${systemPrompt.length} chars · ${systemPrompt.split('\n').length} lines\n`);

  const ts = Date.now();
  const report = [];

  for (const sc of SCENARIOS) {
    console.log(`\n━━━ ${sc.id} ━━━`);
    console.log(`Business : ${sc.business}`);
    console.log(`News     : ${sc.news}`);

    let post;
    try {
      post = await callClaudeForPost(systemPrompt, sc);
    } catch (e) {
      console.log(`❌ Claude failed: ${e.message}`);
      report.push({ scenario: sc.id, ok: false, error: e.message });
      continue;
    }

    const visual = post.visual_description || '';
    const newsLink = post.news_visual_link || '';
    const foundNews = detectCues(visual, sc.expectedNewsCues);
    const foundBiz = detectCues(visual, sc.expectedBizCues);
    const briefOk = foundNews.length > 0 && foundBiz.length > 0 && newsLink.length > 10;

    console.log(`\n• Hook            : ${(post.hook || '').slice(0, 120)}`);
    console.log(`• news_visual_link: ${newsLink || '<empty>'}`);
    console.log(`• Visual desc     : ${visual.slice(0, 280)}${visual.length > 280 ? '…' : ''}`);
    console.log(`• News cues found : ${foundNews.join(', ') || '<NONE — fail>'}`);
    console.log(`• Biz cues found  : ${foundBiz.join(', ') || '<NONE — fail>'}`);
    console.log(`• Brief check     : ${briefOk ? '✓ PASS' : '✗ FAIL — brief is missing one anchor'}`);

    console.log(`\nGenerating Seedream image…`);
    const img = await generateSeedreamImage(visual);
    if (!img.ok) {
      console.log(`❌ Seedream failed: HTTP ${img.status} — ${img.body}`);
      report.push({ scenario: sc.id, briefOk, foundNews, foundBiz, ok: false, error: img.body });
      continue;
    }

    console.log(`✓ Temp URL: ${img.url}`);
    const permanent = await uploadToSupabase(img.url, `${ts}-${sc.id}`);
    if (permanent) console.log(`✓ Permanent: ${permanent}`);

    report.push({
      scenario: sc.id,
      briefOk,
      foundNews,
      foundBiz,
      newsLink,
      hook: post.hook,
      visualPreview: visual.slice(0, 240),
      url: permanent || img.url,
    });
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUMMARY (judge images visually):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of report) {
    console.log(`\n${r.scenario}: ${r.briefOk ? '✓' : '✗'} brief · cues: news=[${(r.foundNews || []).join(',')}] biz=[${(r.foundBiz || []).join(',')}]`);
    console.log(`  → ${r.url || '(no image)'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
