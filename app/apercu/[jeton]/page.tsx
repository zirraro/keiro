import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

/**
 * La page qu'un prospect ouvre depuis le lien reçu en message.
 *
 * Son vrai rôle se joue AVANT le clic : les balises Open Graph font que le lien
 * se déplie en grande image dans WhatsApp et dans les messages Instagram. Le
 * destinataire voit donc le visuel sans rien ouvrir — c'est là que se gagne
 * l'attention, pas sur la page.
 *
 * ── Ce qu'on n'écrit pas ──
 *
 * Aucun chiffre de résultat, aucune promesse. La page ne fait qu'une chose :
 * montrer un visuel et proposer d'en parler. Une page de démonstration qui
 * sur-promet transforme un bon premier contact en méfiance, et le visuel perd
 * exactement ce qui le rendait crédible — le fait qu'il soit déjà fait.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Retrouve le prospect à partir du jeton.
 *
 * Le jeton étant un condensé, on ne peut pas l'inverser : on cherche donc sur
 * l'URL du visuel, qui le contient. C'est volontaire — un identifiant en clair
 * dans l'URL laisserait deviner les autres fiches.
 */
async function prospectDepuisJeton(jeton: string) {
  const propre = String(jeton || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (!propre) return null;
  const { data } = await sb()
    .from('crm_prospects')
    .select('company, ville, type, apercu_url')
    .like('apercu_url', `%/apercus/${propre}.jpg`)
    .maybeSingle();
  return data as any;
}

export async function generateMetadata(
  { params }: { params: Promise<{ jeton: string }> },
): Promise<Metadata> {
  const { jeton } = await params;
  const p = await prospectDepuisJeton(jeton);
  if (!p) return { title: 'Aperçu', robots: { index: false, follow: false } };

  const titre = `Un visuel préparé pour ${p.company}`;
  const description = "Voici ce que ça donnerait sur vos réseaux. Le visuel est à vous, sans engagement.";

  return {
    title: titre,
    description,
    // La page ne doit jamais être indexée : elle est destinée à une personne.
    robots: { index: false, follow: false },
    openGraph: {
      title: titre, description, type: 'website',
      images: p.apercu_url ? [{ url: p.apercu_url, width: 1024, height: 1024, alt: titre }] : [],
    },
    twitter: {
      card: 'summary_large_image', title: titre, description,
      images: p.apercu_url ? [p.apercu_url] : [],
    },
  };
}

export default async function PageApercu({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const p = await prospectDepuisJeton(jeton);

  if (!p?.apercu_url) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-[#0c1a3a] text-white">
        <p className="text-white/60 text-sm">Ce lien n&apos;est plus valide.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0c1a3a] text-white px-5 py-10">
      <div className="max-w-lg mx-auto">
        <p className="text-white/50 text-xs mb-2">Préparé pour</p>
        <h1 className="text-2xl font-bold mb-6 leading-tight">{p.company}</h1>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.apercu_url}
          alt={`Visuel préparé pour ${p.company}`}
          className="w-full rounded-2xl shadow-2xl"
        />

        <p className="text-white/70 text-sm mt-6 leading-relaxed">
          Voilà le genre de visuel qu&apos;on peut publier sur votre compte, à votre place et à votre rythme.
          Celui-ci est à vous, que la suite vous intéresse ou non.
        </p>

        <a
          href="https://keiroai.com/essai"
          className="mt-6 inline-block w-full text-center px-5 py-3.5 rounded-xl bg-white text-[#0c1a3a] font-semibold"
        >
          Voir comment ça marche
        </a>

        <p className="text-white/35 text-[11px] mt-5 leading-relaxed">
          Visuel généré à partir d&apos;informations publiques sur votre établissement.
          Il illustre un rendu possible et ne représente pas votre commerce.
        </p>
      </div>
    </main>
  );
}
