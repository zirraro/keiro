// app/page.tsx
import Link from "next/link";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
      {children}
    </span>
  );
}

function RenderCard({
  brand,
  title,
  kicker,
  imageUrl,
  dark = true,
  badge = "",
}: {
  brand: string;
  title: string;
  kicker: string;
  imageUrl: string; // vraie photo
  dark?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={
        "relative w-full overflow-hidden rounded-xl border shadow-sm " +
        (dark ? "text-white" : "text-neutral-900")
      }
      style={{ aspectRatio: "4 / 5" }}
    >
      {/* photo en fond */}
      <img
        src={imageUrl}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      {/* overlay pour lisibilité */}
      <div className="absolute inset-0 bg-black/35" />

      {/* brand / badge */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-black">K</div>
        <span className="rounded-full bg-white/20 px-2 py-1 text-[11px] backdrop-blur">
          {brand}
        </span>
        {badge && (
          <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] text-black">
            {badge}
          </span>
        )}
      </div>

      {/* contenu */}
      <div className="absolute inset-x-3 bottom-3">
        <div className="mb-1 text-[11px] text-white/85">{kicker}</div>
        <div className="line-clamp-3 text-lg font-semibold leading-snug text-white">
          {title}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-neutral-50">
      {/* Header */}
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-black text-white">K</div>
          <span className="text-lg font-semibold">Keiro</span>
        </Link>
        <nav className="hidden gap-2 md:flex">
          <Link href="/generate" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-100">
            Studio
          </Link>
          <Link href="/dev/quick-generate" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-100">
            Sandbox
          </Link>
          <a href="#how" className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-100">
            Comment ça marche
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1100px] gap-6 px-6 py-10 md:grid-cols-2 md:py-16">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Pill>⚡ Images & vidéos génératives</Pill>
            <Pill>📰 Actus en temps réel</Pill>
            <Pill>🎯 Prompt “marque” guidé</Pill>
          </div>
          <h1 className="mb-4 text-3xl font-semibold md:text-4xl">
            Transformez une actualité en un visuel social prêt à poster.
          </h1>
          <p className="mb-6 text-neutral-600">
            Keiro capte une actu, vous aide à l’adapter à votre marque (ton, objectifs, contraintes),
            puis génère une <strong>image</strong> ou une <strong>vidéo courte</strong> optimisée pour les réseaux sociaux.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center rounded-md bg-black px-4 py-3 text-white hover:bg-neutral-800"
            >
              🚀 Ouvrir le studio
            </Link>
            <Link
              href="/dev/quick-generate"
              className="inline-flex items-center justify-center rounded-md border bg-white px-4 py-3 hover:bg-neutral-100"
            >
              🎬 Essayer la sandbox
            </Link>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Formats couverts : feed carré/portrait, story vertical, bannière; mode image & vidéo.
          </p>
        </div>

        {/* Aperçu attractif — 2 visuels photo */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 text-sm font-medium">Aperçu du rendu</div>
          <div className="grid gap-4 md:grid-cols-2">
            <RenderCard
              brand="LuxeCo"
              title="CAC 40 en hausse : le luxe tire la tendance"
              kicker="Business — Paris"
              imageUrl="https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80"
              badge="Tendance"
            />
            <RenderCard
              brand="FitDrink"
              title="Marathon : record battu, hydratation au cœur de la perf"
              kicker="Sport — Live"
              imageUrl="https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80"
            />
          </div>
          <div className="mt-4 text-xs text-neutral-500">
            Visuels d’illustration. Générez vos propres assets en un clic avec le studio.
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1100px] px-6 py-10">
        <h2 className="mb-6 text-2xl font-semibold">Comment ça marche</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            { n: 1, t: "Choisissez une actu", d: "Filtrez par thème (business, technologie, santé, sport…) et période." },
            { n: 2, t: "Personnalisez la voix", d: "Marque, objectif, ton, contraintes, CTA et hashtags." },
            { n: 3, t: "Générez le rendu", d: "Image ou vidéo selon la plateforme visée (feed/story)." },
            { n: 4, t: "Prévisualisez & exportez", d: "Visualisez, ajustez et téléchargez l’asset final." },
          ].map((s) => (
            <li key={s.n} className="rounded-lg border bg-white p-4">
              <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
                {s.n}
              </div>
              <div className="mb-1 font-medium">{s.t}</div>
              <div className="text-sm text-neutral-600">{s.d}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Use cases */}
      <section className="mx-auto max-w-[1100px] px-6 py-10">
        <h2 className="mb-6 text-2xl font-semibold">Cas d’usage concrets</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              emoji: "📈",
              title: "Post LinkedIn / X pour une marque B2B",
              body:
                "Choisissez une actu Business (ex: résultats CAC 40), sélectionnez un ton expert, “Objectif: trafic site”, et générez un visuel propre + hashtags.",
            },
            {
              emoji: "🛒",
              title: "Promo e-commerce liée à une tendance",
              body:
                "Reliez votre produit à une actu (ex: rentrée, sport, santé) et sortez un visuel promo contextualisé en 30s.",
            },
            {
              emoji: "🎥",
              title: "Story verticale ‘Breaking’",
              body:
                "Sélectionnez une news chaude, ton urgent, CTA “En savoir plus”. Keiro sort une courte vidéo story avec légendes.",
            },
            {
              emoji: "🏟️",
              title: "Post live sport / santé",
              body:
                "Actu sports/santé → générez un visuel score/stat ou conseil santé pour vos réseaux.",
            },
          ].map((c) => (
            <article key={c.title} className="rounded-lg border bg-white p-5">
              <div className="mb-2 text-2xl">{c.emoji}</div>
              <h3 className="mb-1 font-medium">{c.title}</h3>
              <p className="text-sm text-neutral-600">{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-[1100px] px-6 pb-16 pt-2">
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <h3 className="mb-2 text-lg font-medium">Prêt à créer votre premier visuel ?</h3>
          <p className="mb-4 text-sm text-neutral-600">
            Ouvrez le studio, choisissez une actu, ajustez le prompt et générez : c’est prêt en moins d’une minute.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/generate"
              className="rounded-md bg-black px-4 py-3 text-white hover:bg-neutral-800"
            >
              🚀 Ouvrir le studio
            </Link>
            <Link
              href="/dev/quick-generate"
              className="rounded-md border bg-white px-4 py-3 hover:bg-neutral-100"
            >
              🎬 Essayer la sandbox
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-neutral-600 md:flex-row">
          <div>© {new Date().getFullYear()} Keiro — Générer des contenus à partir de l’actualité.</div>
          <div className="flex gap-3">
            <a className="hover:underline" href="#how">Comment ça marche</a>
            <Link className="hover:underline" href="/generate">Studio</Link>
            <Link className="hover:underline" href="/dev/quick-generate">Sandbox</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
