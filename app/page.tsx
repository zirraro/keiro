import Spotlight from "../components/site/spotlight";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ShineButton } from "../components/ui/shine-button";
import LogosMarquee from "../components/site/logos-marquee";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-neutral-950 text-neutral-100">
      <Spotlight />

      {/* HERO premium */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-10 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-xs text-blue-300/90 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Nouveau · Génération guidée par l’actualité
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-extrabold leading-tight">
            Créez des visuels qui <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">surfent sur l’actu</span>.
          </h1>
          <p className="mt-4 text-lg text-neutral-300">
            Keiro transforme votre secteur, votre angle et les tendances du jour en visuels prêts à poster pour Instagram, TikTok, Facebook, LinkedIn & X.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/generate">
              <ShineButton>Générer un visuel</ShineButton>
            </a>
            <a href="#how-it-works">
              <Button variant="outline">Voir comment ça marche</Button>
            </a>
          </div>

          <div className="mt-6 text-xs text-neutral-400">
            Essai sans carte • Export PNG HD • 1 à 3 variantes
          </div>
        </div>

        {/* Mock premium‑like */}
        <Card className="relative overflow-hidden">
          <div className="aspect-[4/3] bg-neutral-900/60 p-5">
            <div className="h-full w-full rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-1">Brief</div>
                  <div className="h-24 rounded bg-neutral-900" />
                  <div className="mt-2 h-2 rounded bg-neutral-800 w-2/3" />
                  <div className="mt-1 h-2 rounded bg-neutral-800 w-1/2" />
                </div>
                <div className="rounded-lg border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-1">Aperçu</div>
                  <div className="h-40 rounded bg-neutral-900" />
                  <div className="mt-2 flex gap-2">
                    <div className="h-2 rounded bg-neutral-800 w-1/2" />
                    <div className="h-2 rounded bg-neutral-800 w-1/3" />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-8 w-24 rounded bg-blue-600/80" />
                <div className="h-8 w-24 rounded border border-neutral-800" />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Logos / social proof */}
      <section className="max-w-6xl mx-auto px-4">
        <LogosMarquee />
      </section>

      {/* BÉNÉFICES */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-sm text-neutral-400">Guidage intelligent</div>
            <div className="mt-1 text-lg font-semibold">Pas d’inspi ? On guide.</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Plateforme, objectif, tendance : Keiro prépare automatiquement un brief qui capte l’attention.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-neutral-400">3 variantes</div>
            <div className="mt-1 text-lg font-semibold">Choisissez en un clin d’œil</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Jusqu’à 3 propositions d’un coup pour aller vite et sélectionner la meilleure.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-neutral-400">Prêt réseaux</div>
            <div className="mt-1 text-lg font-semibold">Formats auto</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Carré, vertical, large — on adapte au réseau (IG, TikTok, FB, LinkedIn, X). Export PNG HD.
            </p>
          </Card>
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <Card className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Prêt à essayer Keiro ?</div>
            <div className="text-sm text-neutral-400">Générez un premier visuel en moins d’une minute.</div>
          </div>
          <a href="/generate"><ShineButton>Commencer maintenant</ShineButton></a>
        </Card>
      </section>
    </main>
  );
}
