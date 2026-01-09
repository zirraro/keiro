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
          <h2 className="text-3xl font-bold">Transformez une publication basique en visuel captivant</h2>
          <p className="mt-2 text-neutral-600">Exemple concret : Restaurant bio "La Table Verte" pendant la hausse des prix de l'essence</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* AVANT */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-neutral-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10">
              ❌ AVANT
            </div>
            <div className="rounded-2xl border-2 border-neutral-300 overflow-hidden bg-white">
              {/* Image basique */}
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop"
                  alt="Plat de restaurant basique"
                  className="w-full aspect-square object-cover"
                />
              </div>

              {/* Caption Instagram classique */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600"></div>
                  <span className="text-sm font-semibold">latableverte</span>
                </div>
                <p className="text-sm text-neutral-600">
                  Salade fraîche du jour 🥗<br/>
                  #restaurant #bio #local #salad
                </p>
                <div className="pt-2 border-t border-neutral-200">
                  <p className="text-xs text-neutral-500">👁️ 12 vues • 💬 0 commentaires • 📢 Portée faible</p>
                </div>
              </div>

              {/* Résultat */}
              <div className="bg-neutral-100 p-4 text-center border-t border-neutral-200">
                <p className="text-sm font-semibold text-neutral-700">😴 Post basique, zéro lien avec l'actualité</p>
                <p className="text-xs text-neutral-500 mt-1">Personne ne s'arrête, engagement minimal</p>
              </div>
            </div>
          </div>

          {/* APRÈS */}
          <div className="relative">
            <div className="absolute -top-3 -left-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg z-10">
              ✨ APRÈS avec Keiro
            </div>
            <div className="rounded-2xl border-2 border-blue-200 overflow-hidden bg-white shadow-xl">
              {/* Image retravaillée avec overlay */}
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop"
                  alt="Plat de restaurant avec overlay"
                  className="w-full aspect-square object-cover brightness-75"
                />
                {/* Text overlay professionnel */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black/60 via-black/30 to-transparent">
                  <div className="text-center space-y-3">
                    <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full">
                      <p className="text-xs font-medium text-white">🌱 CIRCUIT COURT</p>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black text-white leading-tight drop-shadow-2xl">
                      L'essence flambe ?<br/>
                      Nos légumes arrivent<br/>
                      à vélo ! 🚴‍♂️
                    </h3>
                    <div className="inline-block bg-gradient-to-r from-green-500 to-green-600 px-6 py-3 rounded-xl shadow-2xl">
                      <p className="text-base font-bold text-white">-20% cette semaine</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Caption Instagram optimisée */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600"></div>
                  <span className="text-sm font-semibold">latableverte</span>
                </div>
                <p className="text-sm text-neutral-700">
                  💚 L'essence explose ? Nos circuits courts sont la solution !<br/><br/>
                  Pendant que les prix s'envolent, nos légumes parcourent 5km au lieu de 500.<br/><br/>
                  Cette semaine : -20% sur tous nos plats 🎉<br/><br/>
                  👉 Réservez maintenant (lien en bio)
                </p>
                <p className="text-xs text-blue-600">#essence #circuitcourt #local #bio #economie</p>
                <div className="pt-2 border-t border-neutral-200">
                  <p className="text-xs text-blue-600 font-medium">🔥 482 vues • 💬 37 commentaires • 📢 Portée x8</p>
                </div>
              </div>

              {/* Résultat */}
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 text-center border-t border-blue-200">
                <p className="text-sm font-semibold text-blue-900">🚀 Visuel qui capte l'attention + lien actuel</p>
                <p className="text-xs text-blue-700 mt-1">Les gens s'arrêtent, commentent, réservent !</p>
              </div>
            </div>
          </div>
        </div>

        {/* Explication sous les images */}
        <div className="mt-8 bg-blue-50 rounded-2xl border border-blue-200 p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-3">🎯 Ce qui change tout :</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Texte overlay professionnel</p>
                <p className="text-xs text-blue-700">Le message clé est visible immédiatement</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Lien direct avec l'actualité</p>
                <p className="text-xs text-blue-700">Circuits courts vs hausse de l'essence</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Appel à l'action immédiat</p>
                <p className="text-xs text-blue-700">-20% + réservation, message clair</p>
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
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm min-w-[600px]">
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
              Offre de lancement - 20 places Fondateurs
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
              subtitle="20 places - Prix verrouillé à vie"
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
