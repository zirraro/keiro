import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { detectSector, SECTORS } from '@/lib/agents/sales-playbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Brouillons LinkedIn de Jade — messages type DM + commentaires de posts
 * (founder 03/07 : « pour LinkedIn on doit pouvoir générer en auto les DM et
 * les commentaires des posts »). L'API LinkedIn interdit l'envoi/commentaire
 * programmatique → on GÉNÈRE des brouillons prêts à copier-coller, le client
 * envoie/commente lui-même (comme la prep DM Instagram).
 *
 * Déterministe (zéro coût, instantané) : les brouillons sont dérivés du secteur
 * du client (brand kit) + nom d'entreprise, avec un ton pro adapté à LinkedIn.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();

  // Secteur + nom d'entreprise (brand kit puis profil).
  let sectorLabel = 'ton activité';
  let company = '';
  let vocab: string[] = ['ton activité', 'tes clients'];
  try {
    const { data: kit } = await supabase.from('brand_kits').select('vertical, company_name').eq('org_id', user.id).maybeSingle();
    const sector = detectSector(kit?.vertical || '');
    const fiche = (SECTORS as any)[sector];
    if (fiche) { sectorLabel = fiche.label; if (Array.isArray(fiche.vocabUse) && fiche.vocabUse.length) vocab = fiche.vocabUse; }
    company = String(kit?.company_name || '').trim();
    if (!company) {
      const { data: prof } = await supabase.from('profiles').select('company_name, full_name').eq('id', user.id).maybeSingle();
      company = String(prof?.company_name || prof?.full_name || '').trim();
    }
  } catch { /* best-effort */ }

  const me = company || 'nous';
  const sl = sectorLabel.toLowerCase();
  const v0 = vocab[0] || 'ton activité';

  // Brouillons DM (mise en relation / prise de contact pro).
  const dmDrafts = [
    {
      title: 'Mise en relation ciblée',
      text: `Bonjour {{prenom}}, je suis ${me} — on travaille sur ${sl} et je suis vos publications avec intérêt. Ravi de rejoindre votre réseau, au plaisir d'échanger sur nos univers respectifs 🙌`,
    },
    {
      title: 'Suite à une interaction',
      text: `Bonjour {{prenom}}, merci pour votre réaction sur mon dernier post ! Si le sujet ${v0} vous parle, je serais ravi d'en discuter — n'hésitez pas si je peux vous être utile.`,
    },
    {
      title: 'Partenariat / synergie locale',
      text: `Bonjour {{prenom}}, nos activités semblent complémentaires. Chez ${me}, on croit beaucoup aux synergies locales — seriez-vous ouvert à un échange rapide pour voir ce qu'on pourrait faire ensemble ?`,
    },
  ];

  // Brouillons de commentaires (à poster sous les publications pertinentes).
  const commentDrafts = [
    { title: 'Apport de valeur', text: `Très juste 👏 On observe exactement la même chose de notre côté sur ${sl}. Merci pour le partage, ça mérite d'être vu plus largement !` },
    { title: 'Question engageante', text: `Super post ! Curieux de votre avis : comment vous adaptez ça concrètement au quotidien ? On teste des approches similaires et le retour d'expérience m'intéresse.` },
    { title: 'Encouragement + expertise', text: `Bravo pour cette prise de parole 🙌 Sur ${sl}, ce point fait vraiment la différence. On en parle souvent avec ${v0} — au plaisir d'échanger davantage.` },
  ];

  return NextResponse.json({
    ok: true,
    sector: sectorLabel,
    company: company || null,
    dmDrafts,
    commentDrafts,
    note: 'LinkedIn n\'autorise pas l\'envoi automatique — copie le brouillon, personnalise {{prenom}} et poste-le toi-même. Jade prépare, tu valides.',
  });
}
