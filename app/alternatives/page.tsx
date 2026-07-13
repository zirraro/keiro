import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-static';
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'KeiroAI vs Limova vs Zaturn — la meilleure alternative IA pour les commerces locaux',
  description:
    'Comparatif 2026 des plateformes d\'IA marketing pour commerces de proximité : KeiroAI, Limova, Zaturn et l\'agence/community manager. Fonctionnalités, autonomie, visuels, prix et essai gratuit.',
  alternates: { canonical: '/alternatives' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://www.keiroai.com/alternatives',
    title: 'KeiroAI vs Limova vs Zaturn — comparatif IA marketing commerce local',
    description:
      'Quelle IA choisir pour automatiser le marketing de ton commerce local ? Comparatif honnête : fonctionnalités, visuels générés, publication auto, prospection locale, prix.',
    siteName: 'KeiroAI',
  },
};

// Comparatif établi à partir d'informations publiques (juillet 2026).
// ✓ = inclus/natif · ◐ = partiel/selon offre · — = non / hors périmètre.
type Cell = 'yes' | 'partial' | 'no' | string;
const ROWS: Array<{ label: string; keiro: Cell; limova: Cell; zaturn: Cell; agence: Cell }> = [
  { label: 'Spécialisé commerce local (resto, institut, coiffeur, boutique…)', keiro: 'yes', limova: 'no', zaturn: 'partial', agence: 'partial' },
  { label: 'Visuels & vidéos photo-réalistes générés à ton image', keiro: 'yes', limova: 'no', zaturn: 'partial', agence: 'yes' },
  { label: 'Publication automatique Instagram / TikTok / LinkedIn', keiro: 'yes', limova: 'partial', zaturn: 'yes', agence: 'yes' },
  { label: 'Réponses DM & commentaires automatiques', keiro: 'yes', limova: 'partial', zaturn: 'partial', agence: 'partial' },
  { label: 'Réponse aux avis Google', keiro: 'yes', limova: 'partial', zaturn: 'no', agence: 'partial' },
  { label: 'Prospection locale (Google Maps, DM, email)', keiro: 'yes', limova: 'partial', zaturn: 'partial', agence: 'no' },
  { label: 'Périmètre généraliste (juridique, RH, compta, téléphonie)', keiro: 'partial', limova: 'yes', zaturn: 'no', agence: 'no' },
  { label: '100% français, support humain', keiro: 'yes', limova: 'yes', zaturn: 'yes', agence: 'yes' },
  { label: 'Essai gratuit 7 jours', keiro: 'yes', limova: 'yes', zaturn: 'partial', agence: 'no' },
  { label: 'Prix de départ', keiro: '49 €/mois', limova: '69,90 € HT/mois', zaturn: 'variable', agence: '500–1500 €/mois' },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'KeiroAI, Limova ou Zaturn : quelle différence ?',
    a: "Limova et Zaturn sont des plateformes d'agents IA généralistes pour PME (marketing, mais aussi juridique, RH, comptabilité, téléphonie). KeiroAI est concentré sur une seule mission : faire tout le marketing d'un commerce de proximité — créer des visuels et vidéos photo-réalistes à ton image, publier sur Instagram/TikTok/LinkedIn, répondre aux messages et aux avis, et prospecter localement. Cette spécialisation donne un contenu vraiment adapté à ton métier plutôt qu'un outil qui fait un peu de tout.",
  },
  {
    q: 'Quelle est la meilleure alternative à Limova pour un restaurant ou un institut de beauté ?',
    a: "Pour un commerce local, l'enjeu n'est pas d'avoir 9 agents dans tous les domaines, mais d'avoir un contenu visuel qui donne envie et une présence régulière sur les réseaux. KeiroAI est pensé pour ça : visuels et reels générés automatiquement, calendrier de publication tenu tout seul, réponses aux clients — le tout à partir de 49 €/mois avec 7 jours d'essai gratuit.",
  },
  {
    q: 'Combien coûte KeiroAI par rapport à une agence ?',
    a: "Une agence ou un community manager coûte généralement 500 à 1500 €/mois. KeiroAI démarre à 49 €/mois (essai gratuit 7 jours), soit une fraction du prix, avec une exécution quotidienne automatique. L'agence garde l'avantage de la relation humaine sur-mesure ; KeiroAI, celui du volume, de la régularité et du coût.",
  },
  {
    q: 'Faut-il une carte bancaire pour essayer ?',
    a: "Tu peux générer tes premiers visuels gratuitement, sans carte, sur la page de génération. L'essai de 7 jours de l'automatisation complète demande une carte (0 € débité pendant l'essai, annulation en 1 clic).",
  },
];

function Mark({ v }: { v: Cell }) {
  if (v === 'yes') return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 font-bold" aria-label="oui">✓</span>;
  if (v === 'partial') return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold" aria-label="partiel">◐</span>;
  if (v === 'no') return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 text-neutral-400 font-bold" aria-label="non">—</span>;
  return <span className="text-sm font-semibold text-neutral-800">{v}</span>;
}

export default function AlternativesPage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <main className="min-h-screen bg-white text-neutral-900">
        {/* Hero */}
        <header className="relative bg-gradient-to-br from-[#0c1a3a] via-[#132d54] to-[#0c1a3a] text-white overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #a855f7 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-14 pb-16 text-center">
            <span className="inline-block bg-purple-500/20 text-purple-200 text-xs font-medium px-3 py-1.5 rounded-full border border-purple-400/20 mb-5">Comparatif 2026</span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-balance">
              Quelle IA marketing pour ton commerce local ?
            </h1>
            <p className="mt-5 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              KeiroAI, Limova, Zaturn ou une agence : comparatif honnête pour choisir la solution qui fait vraiment <strong className="text-white">grandir ta présence en ligne</strong> — sans y passer tes soirées.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/generate" className="inline-flex items-center gap-2 bg-white text-purple-700 font-bold px-8 py-3.5 rounded-xl hover:bg-neutral-100 transition-colors shadow-lg shadow-purple-900/20">
                Essayer gratuitement
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
              <Link href="/pricing" className="text-white/70 hover:text-white text-sm font-medium transition-colors">Voir les tarifs</Link>
            </div>
          </div>
        </header>

        {/* Comparison table */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">KeiroAI vs Limova vs Zaturn vs agence</h2>
          <p className="text-center text-neutral-500 mb-8 text-sm">Ce qui compte vraiment pour un commerce de proximité.</p>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 shadow-sm">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="p-4 text-sm font-semibold text-neutral-600 w-[38%]">Critère</th>
                  <th className="p-4 text-center text-sm font-bold text-purple-700 bg-purple-50">KeiroAI</th>
                  <th className="p-4 text-center text-sm font-semibold text-neutral-700">Limova</th>
                  <th className="p-4 text-center text-sm font-semibold text-neutral-700">Zaturn</th>
                  <th className="p-4 text-center text-sm font-semibold text-neutral-700">Agence / CM</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={i} className={i % 2 ? 'bg-neutral-50/50' : 'bg-white'}>
                    <td className="p-4 text-sm text-neutral-800 border-b border-neutral-100">{r.label}</td>
                    <td className="p-4 text-center border-b border-neutral-100 bg-purple-50/40"><Mark v={r.keiro} /></td>
                    <td className="p-4 text-center border-b border-neutral-100"><Mark v={r.limova} /></td>
                    <td className="p-4 text-center border-b border-neutral-100"><Mark v={r.zaturn} /></td>
                    <td className="p-4 text-center border-b border-neutral-100"><Mark v={r.agence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-400 mt-3">✓ inclus · ◐ partiel / selon l&apos;offre · — hors périmètre. Comparatif établi à partir d&apos;informations publiques (juillet 2026) ; prix Limova affichés HT. Marques citées à titre indicatif, propriété de leurs détenteurs respectifs.</p>
        </section>

        {/* Positioning */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="p-6 rounded-2xl border border-purple-200 bg-purple-50/50">
              <h3 className="font-bold text-lg mb-2 text-purple-800">Choisis KeiroAI si…</h3>
              <p className="text-sm text-neutral-700 leading-relaxed">Tu tiens un commerce local et tu veux une présence en ligne pro et régulière — de vrais visuels et reels à ton image, publiés automatiquement, plus les réponses aux messages et avis — sans embaucher ni y passer tes soirées.</p>
            </div>
            <div className="p-6 rounded-2xl border border-neutral-200 bg-neutral-50">
              <h3 className="font-bold text-lg mb-2 text-neutral-800">Regarde ailleurs si…</h3>
              <p className="text-sm text-neutral-700 leading-relaxed">Tu cherches une suite d&apos;agents généralistes pour toute l&apos;entreprise (juridique, RH, comptabilité, téléphonie) : des plateformes comme Limova couvrent un périmètre plus large. Tu veux une relation 100% humaine sur-mesure : une agence reste pertinente (à un autre budget).</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl font-bold mb-6">Questions fréquentes</h2>
          <div className="space-y-4">
            {FAQ.map((f, i) => (
              <details key={i} className="group bg-neutral-50 rounded-xl border border-neutral-100 overflow-hidden">
                <summary className="flex items-center justify-between cursor-pointer px-6 py-4 font-semibold text-[15px] leading-snug hover:bg-neutral-100 transition-colors list-none">
                  <span>{f.q}</span>
                  <svg className="w-5 h-5 text-neutral-400 shrink-0 ml-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </summary>
                <div className="px-6 pb-5 text-neutral-600 text-sm leading-relaxed border-t border-neutral-100 pt-4">{f.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-[#1e3a5f] rounded-2xl p-8 sm:p-12 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight">Teste par toi-même, gratuitement</h2>
            <p className="text-white/80 mb-8 max-w-lg mx-auto leading-relaxed">Génère tes premiers visuels sans carte. Si ça te plaît, ton équipe KeiroAI prend le relais — 7 jours d&apos;essai, annulation en 1 clic.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/generate" className="inline-flex items-center gap-2 bg-white text-purple-700 font-bold px-8 py-3.5 rounded-xl hover:bg-neutral-100 transition-colors shadow-lg shadow-purple-900/20">
                Essayer gratuitement
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
              <Link href="/pricing" className="text-white/70 hover:text-white text-sm font-medium transition-colors">Comparer les plans</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
