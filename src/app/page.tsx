'use client';

export default function HomeKeiro() {
  return (
    <main className="min-h-dvh bg-white">
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-12">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-neutral-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              Nouveau : visuels liés à l’actualité en 5–10 minutes
            </div>
            <h1 className="mt-4 text-4xl/tight md:text-5xl/tight font-semibold">
              Des visuels qui surfent sur l’actualité — <span className="bg-amber-200 px-2 -mx-2 rounded">en quelques minutes</span>.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              Choisis une actu, décris ton activité en 2–3 infos, Keiro te propose un angle,
              rédige un texte propre et génère un visuel cohérent prêt à publier.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate" className="px-5 py-3 rounded-xl bg-black text-white hover:opacity-90">
                Essayer gratuitement
              </a>
              <a href="#exemple" className="px-5 py-3 rounded-xl border hover:bg-neutral-50">
                Voir un exemple
              </a>
            </div>
            <ul className="mt-6 grid sm:grid-cols-3 gap-4 text-sm text-neutral-700">
              <li className="rounded-xl border p-3">Orthographe & accroches soignées</li>
              <li className="rounded-xl border p-3">Exports adaptés aux réseaux</li>
              <li className="rounded-xl border p-3">Ajustements instantanés</li>
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

      {/* EXEMPLE CONCRET */}
      <section id="exemple" className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-2xl font-semibold">Exemple concret</h2>
        <div className="mt-6 grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <div className="rounded-2xl border overflow-hidden">
              <div className="grid md:grid-cols-2">
                <img
                  src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1200&auto=format&fit=crop"
                  alt="Avant"
                  className="h-64 w-full object-cover"
                />
                <img
                  src="https://images.unsplash.com/photo-1520975922284-9d62c9b0eece?q=80&w=1200&auto=format&fit=crop"
                  alt="Après"
                  className="h-64 w-full object-cover"
                />
              </div>
              <div className="p-4 text-sm text-neutral-600">
                <b>Actu :</b> ouverture d’une nouvelle ligne TGV vers la côte cet été. <b>Activité :</b> hôtel & resto de bord de mer.  
                Keiro suggère une offre “Week-end mer express”, propose un texte clair et un visuel lumineux.
              </div>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-2xl border p-5">
              <h3 className="font-semibold">Sortie Keiro</h3>
              <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700 space-y-2">
                <li><b>Visuel :</b> “Week-end mer express 🌊 — offre 48h”.</li>
                <li><b>Texte :</b> “Le TGV arrive chez nous ➜ -20% ce week-end. Réservez avant dimanche minuit.”</li>
                <li><b>Formats :</b> prêts pour Instagram, LinkedIn, Facebook, Stories.</li>
              </ul>
              <a href="/generate" className="mt-4 inline-flex items-center justify-center rounded-xl bg-black text-white px-4 py-2">
                Générer mon premier visuel →
              </a>
            </div>
          </div>
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
          <h2 className="text-2xl font-semibold">Offres & tarifs</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <Plan
              title="Essentiel"
              price="79€ / mois"
              bullets={[
                'Visuels illimités (usage raisonnable)',
                'Suggestions d’actu par catégories',
                'Guidage texte (accroches + CTA)',
                'Exports réseaux (posts + stories)',
                'Corrections d’orthographe',
                'Support email'
              ]}
              ctaLabel="Choisir Essentiel"
            />
            <Plan
              title="Croissance"
              price="198€ / mois"
              highlight
              bullets={[
                'Tout Essentiel',
                'Calendrier de contenus (idées & rappels)',
                'Bibliothèque médias (logos, photos)',
                'Historique & versions',
                'Kit de style simple (couleurs, ton)',
                'Exports multi-plateformes',
                'Support chat prioritaire'
              ]}
              ctaLabel="Choisir Croissance"
            />
            <Plan
              title="Studio"
              price="499€ / mois"
              bullets={[
                'Tout Croissance',
                'Espace équipe (droits, validations)',
                'Modèles internes (mentions, disclaimers)',
                'Rapports mensuels (idées qui performent)',
                'Formats pro (HD, fond transparent)',
                'Onboarding + SLA'
              ]}
              ctaLabel="Choisir Studio"
            />
          </div>
          <div className="mt-6 text-center text-sm text-neutral-600">
            Commencer gratuitement — <b>sans carte</b>, annulation en 1 clic.
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
          <a href="/generate" className="px-6 py-3 rounded-xl bg-black text-white hover:opacity-90">
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
    <div className="rounded-2xl border p-5 bg-white">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-black text-white grid place-items-center text-sm">{num}</div>
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
  title, price, bullets, ctaLabel, highlight
}: {
  title: string;
  price: string;
  bullets: string[];
  ctaLabel: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-6 bg-white shadow-sm ${highlight ? 'ring-2 ring-black' : ''}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="text-lg font-medium">{price}</div>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-neutral-700">
        {bullets.map((b, i) => <li key={i} className="flex gap-2"><span>•</span><span>{b}</span></li>)}
      </ul>
      <a href="/generate" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-black text-white px-4 py-2">
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
