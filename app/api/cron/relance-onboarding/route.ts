import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Le mail des premières 24 heures — celui qui décide de l'essai.
 *
 * ── Pourquoi il existe ──
 *
 * Fondateur, 19 août : « tu peux envoyer un mail dans les 24 h à un client qui
 * ne s'est pas connecté alors qu'il a ouvert un compte. Faut lui dire de
 * remplir les infos et connecter son Insta ou TikTok pour commencer à avoir de
 * la présence. Ça permet de rattraper les clients qui s'inscrivent mais
 * n'actionnent rien et laissent filer la période d'essai de 7 jours. »
 *
 * Cas qui l'a déclenché : une cliente s'inscrit le 18 août, ne connecte rien,
 * et se retrouve avec quatre publications hors sujet et invisibles. Personne ne
 * lui a dit qu'il manquait deux clics. Elle aurait laissé filer son essai en
 * pensant que le produit ne fait rien.
 *
 * ── Ce qui fait qu'un mail de relance marche ou finit en corbeille ──
 *
 * Il ne réclame pas, il constate. « Vos agents sont prêts mais ils attendent »
 * dit la même chose que « vous n'avez pas fini votre inscription », sans mettre
 * le lecteur en faute. Personne n'agit parce qu'on lui reproche quelque chose.
 *
 * Il donne UNE action, pas trois. Connecter un réseau — un seul suffit à
 * démarrer, et c'est le geste qui débloque tout le reste.
 *
 * Il dit ce qui se passe après, concrètement. « Léna publie à votre place dès
 * demain matin » se visualise ; « profitez de toutes nos fonctionnalités » ne
 * se visualise pas.
 *
 * Et il part UNE fois. Une relance qui insiste transforme un client tiède en
 * désabonnement.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function corpsHtml(prenom: string): string {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px">
  <p>${bonjour}</p>

  <p>Votre compte KeiroAI est ouvert, et vos agents sont prêts — mais ils attendent une chose pour démarrer&nbsp;: <strong>un réseau connecté</strong>.</p>

  <p>Sans ça, Léna peut écrire, mais elle n'a nulle part où publier. C'est le seul geste qui manque, et il prend deux minutes.</p>

  <p style="margin:28px 0">
    <a href="https://keiroai.com/assistant/agent/content"
       style="background:#0c1a3a;color:#fff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:600;display:inline-block">
      Connecter mon Instagram ou TikTok
    </a>
  </p>

  <p><strong>Ce qui se passe juste après&nbsp;:</strong><br>
  Léna lit votre activité, prépare vos premières publications et les programme aux heures où vos clients sont là. Vous les voyez avant qu'elles partent, et vous gardez la main sur tout.</p>

  <p>Un seul réseau suffit pour commencer. Vous en ajouterez d'autres quand vous voudrez.</p>

  <p style="color:#666;font-size:13px;margin-top:28px">
    Si vous préférez d'abord nous dire ce que vous vendez et à qui, c'est ici&nbsp;:
    <a href="https://keiroai.com/assistant" style="color:#0c1a3a">compléter mon profil</a>. Ça rend vos publications nettement plus justes.
  </p>

  <p style="margin-top:24px">Bonne journée,<br><strong>L'équipe KeiroAI</strong></p>
</div>`.trim();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  // La fenêtre : inscrits entre 24 et 72 h. Avant 24 h on laisse le temps de
  // faire les choses ; après 72 h, un premier mail arrive trop tard pour peser
  // sur un essai de sept jours.
  const il24h = new Date(Date.now() - 24 * 3600000).toISOString();
  const il72h = new Date(Date.now() - 72 * 3600000).toISOString();

  const { data: comptes, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, instagram_business_account_id, instagram_igaa_token, instagram_access_token, facebook_page_access_token, tiktok_access_token, linkedin_access_token, created_at')
    .gte('created_at', il72h)
    .lte('created_at', il24h)
    .limit(100);

  if (error) {
    console.error('[RelanceOnboarding] lecture impossible :', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let envoyes = 0;
  const ignores: string[] = [];

  for (const c of (comptes || []) as any[]) {
    // Les trois formes de connexion Instagram, comme partout ailleurs : relancer
    // quelqu'un qui a déjà connecté est la meilleure façon de perdre sa
    // confiance.
    const instagram = !!(c.instagram_business_account_id
      && (c.instagram_igaa_token || c.facebook_page_access_token || c.instagram_access_token));
    if (instagram || c.tiktok_access_token || c.linkedin_access_token) { ignores.push('déjà connecté'); continue; }
    if (!c.email) { ignores.push('sans email'); continue; }

    // Une seule relance par compte, jamais deux.
    const { data: deja } = await supabase
      .from('agent_logs')
      .select('id')
      .eq('action', 'relance_onboarding_envoyee')
      .eq('user_id', c.id)
      .limit(1);
    if (deja?.length) { ignores.push('déjà relancé'); continue; }

    try {
      const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
      await sendEmailWithFallback({
        to: c.email,
        subject: 'Vos agents sont prêts — il manque un réseau connecté',
        html: corpsHtml(String(c.first_name || '').trim()),
      });
      await supabase.from('agent_logs').insert({
        agent: 'onboarding', action: 'relance_onboarding_envoyee', status: 'ok',
        user_id: c.id,
        data: { email: c.email, inscrit_le: c.created_at },
        created_at: new Date().toISOString(),
      });
      envoyes++;
    } catch (e: any) {
      console.warn(`[RelanceOnboarding] envoi raté pour ${c.email} : ${e?.message}`);
    }
  }

  if (envoyes > 0) console.log(`[RelanceOnboarding] ${envoyes} relance(s) envoyée(s)`);
  return NextResponse.json({ ok: true, examines: (comptes || []).length, envoyes, ignores: ignores.length });
}
