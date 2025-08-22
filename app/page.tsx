import Image from "next/image";
import { Button } from "../components/ui/button";  // imports RELATIFS (compat Vercel)
import { Card } from "../components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(59,130,246,.14),transparent)] bg-neutral-950 text-neutral-100">
      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-12">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-blue-300/90 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Nouveau · Génération guidée par l’actualité
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold leading-tight">
              Créez des visuels qui surfent <span className="text-blue-400">sur l’actu</span>.
            </h1>
            <p className="mt-4 text-lg text-neutral-300">
              Keiro génère des images prêtes pour Instagram, TikTok, Facebook, LinkedIn & X
              — à partir de votre secteur, de votre angle et des tendances du moment.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate">
                <Button>Générer un visuel</Button>
              </a>
              <a href="#how-it-works">
                <Button variant="outline">Voir comment ça marche</Button>
              </a>
            </div>

            <div className="mt-6 text-xs text-neutral-400">
              Essai sans carte • Export PNG HD • 1 ou 3 variantes
            </div>
          </div>

          {/* Mock visuel / préview */}
          <Card className="relative overflow-hidden">
            <div className="aspect-square bg-neutral-900/60 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="mx-auto mb-4 w-16 h-16 rounded-xl bg-blue-500/80" />
                <div className="text-xl font-semibold">Prévisualisation</div>
                <p className="mt-2 text-neutral-400 text-sm">
                  Votre visuel généré apparaîtra ici après quelques secondes.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* BENEFICES */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-lg font-semibold">Guidage ultra simple</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Plateforme, objectif, tendance. Keiro prépare automatiquement le bon brief.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-lg font-semibold">3 variantes instantanées</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Obtenez jusqu’à 3 propositions pour choisir la meilleure en un clin d’œil.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-lg font-semibold">Prêt pour les réseaux</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Format auto (carré, vertical, large) selon le réseau. Export PNG HQ.
            </p>
          </Card>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold">Comment ça marche</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="text-sm text-neutral-400">Étape 1</div>
            <div className="mt-1 font-semibold">Dites-nous où vous postez</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Instagram, TikTok, Facebook, LinkedIn ou X. Keiro choisit le format adapté.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-neutral-400">Étape 2</div>
            <div className="mt-1 font-semibold">Ajoutez votre angle</div>
            <p className="mt-2 text-neutral-400 text-sm">
              Secteur, type de business, tendance, accroche & CTA — on compose un visuel qui capte.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-neutral-400">Étape 3</div>
            <div className="mt-1 font-semibold">Générez et exportez</div>
            <p className="mt-2 text-neutral-400 text-sm">
              1 ou 3 variantes. Téléchargez en PNG HD. Postez immédiatement.
            </p>
          </Card>
        </div>

        <div className="mt-8">
          <a href="/generate">
            <Button>Essayer maintenant</Button>
          </a>
        </div>
      </section>

      {/* SOCIAL PROOF (placeholder simple) */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <Card className="p-6">
          <div className="text-sm text-neutral-400">Ils utilisent Keiro</div>
          <div className="mt-3 grid sm:grid-cols-3 gap-4">
            <div className="text-neutral-300 text-sm">• Café du Marché — posts quotidiens</div>
            <div className="text-neutral-300 text-sm">• Pizzeria Roma — promos week‑end</div>
            <div className="text-neutral-300 text-sm">• Studio Fit — lancements d’offres</div>
          </div>
        </Card>
      </section>
    </main>
  );
}
