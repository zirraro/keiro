import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { peutGenererApercu, briefApercu, messageApercu } from '@/lib/prospects/apercu';
import crypto from 'crypto';
import { valider, champs, z } from '@/lib/security/validation';

const SchemaApercu = z.object({
  prospect_id: champs.uuid,
  regenerer: z.boolean().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Génère un aperçu personnalisé pour un prospect, et le lien à lui envoyer.
 *
 * Le lien pointe vers une page publique dont l'aperçu se déplie en grand sur
 * WhatsApp et dans les messages Instagram : c'est ce qui transforme un envoi
 * de prospection en démonstration. On montre avant de demander.
 *
 * ── Le refus est un résultat ──
 *
 * Si la fiche ne permet pas d'être juste — nom manquant, ville manquante,
 * activité non reconnue — on ne génère pas, et on dit ce qu'il manque. Un
 * visuel qui se trompe de métier détruit la démonstration ET la crédibilité,
 * bien plus qu'un message sans visuel n'aurait coûté.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Jeton du lien public.
 *
 * Dérivé de l'identifiant du prospect, donc stable : regénérer un aperçu ne
 * change pas le lien déjà envoyé. Haché avec le secret serveur pour qu'on ne
 * puisse pas énumérer les fiches en devinant des identifiants.
 */
function jetonPour(prospectId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${prospectId}:${process.env.CRON_SECRET || 'keiro'}`)
    .digest('base64url')
    .slice(0, 22);
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const v = await valider(req, SchemaApercu);
  if (!v.ok) return v.reponse;
  const body = v.donnees;
  const prospectId = body.prospect_id;

  const supabase = sb();
  const { data: p } = await supabase
    .from('crm_prospects')
    .select('id, company, ville, type, google_rating, google_reviews, instagram, ig_status, created_by, user_id, apercu_url')
    .eq('id', prospectId)
    .maybeSingle();

  if (!p) return NextResponse.json({ ok: false, error: 'Prospect introuvable' }, { status: 404 });

  const donnees = {
    nom: (p as any).company, ville: (p as any).ville, typeActivite: (p as any).type,
    note: (p as any).google_rating, avis: (p as any).google_reviews,
    instagram: (p as any).instagram, igStatut: (p as any).ig_status,
  };

  const verdict = peutGenererApercu(donnees);
  if (!verdict.possible) {
    return NextResponse.json({ ok: false, refuse: true, raison: verdict.raison, manquant: verdict.manquant }, { status: 422 });
  }

  const jeton = jetonPour(prospectId);
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://keiroai.com';
  const lien = `${base}/apercu/${jeton}`;

  // Un aperçu déjà produit se réutilise : le regénérer coûterait une image
  // pour un résultat équivalent, et changerait ce que le prospect a peut-être
  // déjà vu.
  let visuelUrl: string | null = (p as any).apercu_url || null;
  if (!visuelUrl || body?.regenerer === true) {
    const { generateImage } = await import('@/lib/visuals/image-provider');
    const img = await generateImage({ prompt: briefApercu(donnees), size: '1024x1024', complexity: 'standard' });
    if (!img?.url) {
      return NextResponse.json({ ok: false, error: "Génération d'image indisponible pour le moment" }, { status: 503 });
    }

    // On rapatrie l'image chez nous : les URL des fournisseurs expirent, et un
    // lien de prospection doit rester valide plusieurs semaines après l'envoi.
    const bin = await fetch(img.url).then(r => r.arrayBuffer()).catch(() => null);
    if (!bin) return NextResponse.json({ ok: false, error: 'Image non téléchargeable' }, { status: 502 });

    const chemin = `apercus/${jeton}.jpg`;
    const { error: upErr } = await supabase.storage
      .from('generated-images')
      .upload(chemin, Buffer.from(bin), { contentType: 'image/jpeg', upsert: true });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    visuelUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-images/${chemin}`;
    await supabase.from('crm_prospects')
      .update({ apercu_url: visuelUrl, apercu_genere_le: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', prospectId);
  }

  const messages = messageApercu(donnees, lien);

  await supabase.from('agent_logs').insert({
    agent: 'commercial', action: 'apercu_prospect', status: 'ok', user_id: user.id,
    data: { prospect_id: prospectId, entreprise: donnees.nom, lien, regenere: body?.regenerer === true },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, visuel: visuelUrl, lien, messages });
}
