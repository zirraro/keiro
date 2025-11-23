'use client';

export default function HomeKeiro() {
  return (
    <main className="min-h-dvh bg-white">
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
              Nouveau : visuels liés à l'actualité en 5–10 minutes
            </div>
            <h1 className="mt-4 text-4xl/tight md:text-5xl/tight font-semibold">
              Des visuels qui surfent sur l'actualité — <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">en quelques minutes</span>.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              Choisis une actu, décris ton activité en 2–3 infos, Keiro te propose un angle,
              rédige un texte propre et génère un visuel cohérent prêt à publier.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate" className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all">
                Essayer gratuitement
              </a>
              <a href="#exemple" className="px-5 py-3 rounded-xl border border-blue-200 hover:bg-blue-50 transition-colors">
                Voir un exemple
              </a>
            </div>
            <ul className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> Orthographe & accroches soignées
              </li>
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> Exports adaptés aux réseaux
              </li>
              <li className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-blue-900">
                <span className="text-blue-500 mr-1">✓</span> Ajustements instantanés
              </li>
            </ul>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-2xl border shadow-sm overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=1200&auto=format&fit=crop"
                alt="Exemple de visuel"
                className="w-full h-72 object-cover"
              />
              <div className="p-4 text-sm text-neutral-600">
                Exemple de rendu Keiro combinant une actu + un business (texte et visuel prêts à publier).
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-semibold">Comment ça marche</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <Step num="1" title="Choisis une actu">
              Parcours les catégories (économie, sport, tech, lifestyle…) et sélectionne une actualité.
            </Step>
            <Step num="2" title="Décris ton activité">
              Type d’offre, cible, ton souhaité. Keiro propose un angle pertinent, sans fautes.
            </Step>
            <Step num="3" title="Génère & ajuste">
              Lumière, ambiance, éléments visuels… Export en formats réseaux en 1 clic.
            </Step>
          </div>
        </div>
      </section>

      {/* EXEMPLE CONCRET AVANT/APRÈS */}
      <section id="exemple" className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold">Transformez une actualité en client</h2>
          <p className="mt-2 text-neutral-600">Voici comment Keiro vous aide à catcher la trend et convertir</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* AVANT */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-neutral-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10">
              ❌ AVANT
            </div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-neutral-50/30 p-6">
              <div className="bg-white rounded-xl border p-4 mb-4">
                <p className="text-xs text-neutral-500 mb-2">📰 Actualité brute</p>
                <p className="font-semibold text-sm mb-2">
                  "Le gouvernement annonce une hausse de 15% du prix de l'essence d'ici la fin du mois"
                </p>
                <p className="text-xs text-neutral-600">Source : Le Monde - il y a 2h</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-neutral-400 text-xl">✗</span>
                  <p className="text-sm text-neutral-700">Vous postez l'actu telle quelle sur vos réseaux</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-neutral-400 text-xl">✗</span>
                  <p className="text-sm text-neutral-700">Aucun lien avec votre activité</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-neutral-400 text-xl">✗</span>
                  <p className="text-sm text-neutral-700">Pas d'appel à l'action</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-neutral-400 text-xl">✗</span>
                  <p className="text-sm text-neutral-700">Visuel générique qui ne se démarque pas</p>
                </div>
              </div>

              <div className="mt-4 bg-neutral-100 rounded-lg p-3 text-center">
                <p className="text-xs font-medium text-neutral-600">Résultat :</p>
                <p className="text-lg font-bold text-neutral-700">😴 Faible engagement, 0 conversion</p>
              </div>
            </div>
          </div>

          {/* APRÈS */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10">
              ✨ APRÈS avec Keiro
            </div>
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/30 p-6">
              <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-6 mb-4 text-white shadow-lg">
                <p className="text-xs opacity-90 mb-3">🚗 Restaurant bio "La Table Verte"</p>
                <h3 className="font-bold text-lg mb-2">
                  L'essence flambe ? 🌱<br/>
                  Nos circuits courts font baisser l'addition !
                </h3>
                <p className="text-sm mb-4 opacity-95">
                  Pendant que les prix s'envolent, nos légumes du coin arrivent à vélo.
                  Résultat : -20% sur vos plats cette semaine.
                </p>
                <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                  <p className="text-xs font-medium">👉 Réservez maintenant</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 text-xl">✓</span>
                  <p className="text-sm text-neutral-700"><strong>Lien direct</strong> entre l'actu et votre solution</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 text-xl">✓</span>
                  <p className="text-sm text-neutral-700"><strong>Bénéfice clair</strong> pour vos clients</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 text-xl">✓</span>
                  <p className="text-sm text-neutral-700"><strong>Appel à l'action</strong> immédiat</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 text-xl">✓</span>
                  <p className="text-sm text-neutral-700"><strong>Visuel pro</strong> qui capte l'attention</p>
                </div>
              </div>

              <div className="mt-4 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-lg p-3 text-center">
                <p className="text-xs font-medium text-blue-800">Résultat :</p>
                <p className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">🚀 +300% d'engagement, conversions réelles</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <a href="/generate" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-lg hover:shadow-xl transition-all hover:scale-105">
            Générer mon premier visuel →
          </a>
        </div>
      </section>

      {/* POURQUOI PUBLIER SUR L’ACTU */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-semibold">Pourquoi publier sur l’actualité ?</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6 text-neutral-700">
            <Card>Plus de portée naturelle : les plateformes boostent les contenus liés aux tendances.</Card>
            <Card>Plus de régularité : tu produis vite, donc tu publies souvent.</Card>
            <Card>Plus de clarté : orthographe, structure, accroche et appel à l’action soignés.</Card>
          </div>
        </div>
      </section>

      {/* COMPARATIF AU MOIS */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-2xl font-semibold">Keiro vs. graphiste “par campagne” (au mois)</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Hypothèse réaliste&nbsp;: <b>4 campagnes / mois</b> (hebdo) + 1–2 variantes chacune.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left p-3">Critère</th>
                <th className="text-left p-3">Keiro</th>
                <th className="text-left p-3">Graphiste/Studio (par campagne)</th>
              </tr>
            </thead>
            <tbody className="[&_td]:p-3 [&_tr:nth-child(even)]:bg-neutral-50/40">
              <tr>
                <td>Délai de production</td>
                <td><b>5–10 minutes</b></td>
                <td>2–5 jours</td>
              </tr>
              <tr>
                <td>Ajustements</td>
                <td><b>Illimités, instantanés</b></td>
                <td>Payants ou limités</td>
              </tr>
              <tr>
                <td>Coût au mois</td>
                <td><b>Forfait</b> (voir offres)</td>
                <td><b>1 200€ à 4 800€</b> (4× 300–1 200€)</td>
              </tr>
              <tr>
                <td>Réactivité sur l’actu</td>
                <td><b>Immédiate</b></td>
                <td>Dépend des dispos</td>
              </tr>
              <tr>
                <td>Cohérence & texte</td>
                <td>Guidage + relecture</td>
                <td>À briefer / revoir</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-y bg-neutral-50/60">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium mb-4">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Offre de lancement - 50 places Fondateurs
            </div>
            <h2 className="text-2xl font-semibold">Offres & tarifs</h2>
          </div>

          {/* Plans principaux */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Plan
              title="🎁 Gratuit"
              price="0€"
              subtitle="Pour découvrir"
              bullets={[
                '3 visuels avec watermark',
                'Actualités par catégories',
                'Export réseaux sociaux'
              ]}
              ctaLabel="Essayer"
            />
            <Plan
              title="⭐ Fondateurs"
              price="149€ / mois"
              subtitle="50 places - Prix verrouillé à vie"
              special
              bullets={[
                'Visuels illimités',
                'Génération vidéo illimitée',
                'Démo personnalisée offerte',
                'Support prioritaire'
              ]}
              ctaLabel="Rejoindre"
            />
            <Plan
              title="🚀 Starter"
              price="199€ / mois"
              subtitle="Garantie satisfait 30j"
              highlight
              bullets={[
                'Visuels illimités',
                '10 vidéos/mois',
                'Démo personnalisée offerte',
                'Studio édition complet'
              ]}
              ctaLabel="Choisir Starter"
            />
            <Plan
              title="💼 Pro"
              price="349€ / mois"
              subtitle="Onboarding premium inclus"
              bullets={[
                'Tout Starter',
                '30 vidéos/mois',
                'Calendrier de contenus',
                'Kit de style (couleurs, ton)'
              ]}
              ctaLabel="Choisir Pro"
            />
          </div>

          <div className="mt-8 text-center">
            <a href="/pricing" className="text-blue-600 hover:underline text-sm font-medium">
              Voir tous les plans dont Business (599€/mois) →
            </a>
          </div>

          <div className="mt-4 text-center text-sm text-neutral-600">
            💡 <b>Essai 7 jours à 29€</b> (déduit du 1er mois) • Sans engagement • Annulation en 1 clic
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF & FAQ COURTE */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold">Ce que disent nos utilisateurs</h2>
            <div className="mt-4 grid gap-4">
              <Quote
                text="On publie 3× plus, avec plus de régularité — les DM augmentent."
                author="Le Bistrot du Port"
              />
              <Quote
                text="Enfin un outil qui comprend la tendance et notre offre."
                author="Move&Fit"
              />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">FAQ</h2>
            <div className="mt-4 space-y-4 text-sm text-neutral-700">
              <Faq q="Puis-je retoucher le visuel ?"
                   a="Oui : lumière, ambiance, éléments visuels et texte sur l’image." />
              <Faq q="Mes contenus m’appartiennent ?"
                   a="Oui. Tu peux utiliser librement tes visuels sur tes réseaux." />
              <Faq q="Je ne suis pas à l’aise avec l’écriture."
                   a="Keiro propose des accroches claires sans fautes, prêtes à poster." />
            </div>
          </div>
        </div>
        <div className="mt-10 text-center">
          <a href="/generate" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:shadow-lg hover:scale-105 transition-all">
            Essayer maintenant
          </a>
        </div>
      </section>
    </main>
  );
}

/* --- mini composants UI --- */
function Step({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-blue-100 p-5 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white grid place-items-center text-sm font-semibold">{num}</div>
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-neutral-700">{children}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border p-5 bg-white">{children}</div>;
}

function Plan({
  title, price, subtitle, bullets, ctaLabel, highlight, special
}: {
  title: string;
  price: string;
  subtitle?: string;
  bullets: string[];
  ctaLabel: string;
  highlight?: boolean;
  special?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 bg-white shadow-sm transition-all hover:shadow-lg ${
      special ? 'ring-2 ring-amber-400 bg-gradient-to-br from-amber-50 to-orange-50' :
      highlight ? 'ring-2 ring-blue-500 shadow-lg' : ''
    }`}>
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="text-xl font-bold mt-1">{price}</div>
      {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      <ul className="mt-4 space-y-2 text-sm text-neutral-700">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className={special ? "text-amber-500" : "text-blue-500"}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <a href="/generate" className={`mt-5 inline-flex w-full items-center justify-center rounded-xl font-medium px-4 py-2 hover:shadow-lg transition-all text-sm ${
        special ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' :
        'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
      }`}>
        {ctaLabel}
      </a>
    </div>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <figure className="rounded-2xl border p-5 bg-white">
      <blockquote className="text-neutral-800">“{text}”</blockquote>
      <figcaption className="mt-2 text-sm text-neutral-500">— {author}</figcaption>
    </figure>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border p-4 bg-white">
      <summary className="cursor-pointer font-medium">{q}</summary>
      <p className="mt-2 text-neutral-700">{a}</p>
    </details>
  );
}
