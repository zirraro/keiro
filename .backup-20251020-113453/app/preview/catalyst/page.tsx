'use client';

import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import LogosMarquee from "../../../components/site/logos-marquee";
import { Toggle } from "../../../components/ui/toggle";

export default function CatalystPreview() {
  const [billing, setBilling] = useState<"left"|"right">("left"); // left=Mensuel, right=Annuel
  const annual = billing === "right";

  const price = (m:number, a:number) => annual ? a : m;
  const badge = (txt:string) => (
    <span className="ml-2 text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 align-middle">
      {txt}
    </span>
  );

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* HERO premium */}
      <section className="relative overflow-hidden">
        {/* blob/halo */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full opacity-20 blur-3xl"
               style={{ background: "radial-gradient(closest-side, rgba(59,130,246,.35), transparent)" }} />
        </div>

        <div className="max-w-6xl mx-auto px-4 pt-16 pb-10 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-blue-300/90 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Génération guidée par l’actualité
            </div>
            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold leading-tight">
              Le studio IA <span className="text-blue-400">qui surfe sur l’actu</span>.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              Créez des visuels prêts pour Instagram, TikTok, Facebook, LinkedIn & X — en partant de votre secteur, de votre angle et des tendances du jour.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate"><Button>Commencer gratuitement</Button></a>
              <a href="#pricing"><Button variant="outline">Voir les tarifs</Button></a>
            </div>
            <div className="mt-4 text-xs text-neutral-600">
              Pas de carte requise • Export PNG HD • 1 à 3 variantes
            </div>
          </div>

          {/* Mockup app premium‑like */}
          <Card className="relative overflow-hidden">
            <div className="aspect-[4/3] bg-white/60 p-5">
              <div className="h-full w-full rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <div className="text-xs text-neutral-600 mb-1">Brief</div>
                    <div className="h-24 rounded bg-white" />
                    <div className="mt-2 h-2 rounded bg-neutral-100 w-2/3" />
                    <div className="mt-1 h-2 rounded bg-neutral-100 w-1/2" />
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <div className="text-xs text-neutral-600 mb-1">Aperçu</div>
                    <div className="h-40 rounded bg-white" />
                    <div className="mt-2 flex gap-2">
                      <div className="h-2 rounded bg-neutral-100 w-1/2" />
                      <div className="h-2 rounded bg-neutral-100 w-1/3" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-8 w-24 rounded bg-blue-600/80" />
                  <div className="h-8 w-24 rounded border border-neutral-200" />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Logos / social proof */}
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <LogosMarquee />
        </div>
      </section>

      {/* Features premium */}
      <section className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-neutral-600">01</div>
          <div className="mt-1 text-lg font-semibold">Guidage intelligent</div>
          <p className="mt-2 text-sm text-neutral-600">Plateforme, objectif, tendance : Keiro prépare le bon brief pour des visuels qui convertissent.</p>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-neutral-600">02</div>
          <div className="mt-1 text-lg font-semibold">Variantes instantanées</div>
          <p className="mt-2 text-sm text-neutral-600">Obtenez jusqu’à 3 propositions d’un coup pour choisir en quelques secondes.</p>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-neutral-600">03</div>
          <div className="mt-1 text-lg font-semibold">Prêt pour les réseaux</div>
          <p className="mt-2 text-sm text-neutral-600">Formats auto (carré, vertical, large) selon IG, TikTok, FB, LinkedIn ou X.</p>
        </Card>
      </section>

      {/* Pricing premium */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-extrabold">Tarifs simples, sans surprise</h2>
            <p className="text-neutral-600 mt-1">Payez pour la valeur — pas pour la complexité.</p>
          </div>
          <Toggle value={billing} onChange={setBilling} left="Mensuel" right="Annuel -2 mois" />
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {/* Starter */}
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-semibold">Starter</h3>
              <div className="text-2xl font-extrabold">
                {price(19, 190)}€
                <span className="text-sm text-neutral-600 font-medium">/{annual ? "an" : "mois"}</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-neutral-600">Lancez-vous en solo.</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-200">
              <li>• 50 images / {annual ? "an" : "mois"}</li>
              <li>• 1 proposition par génération</li>
              <li>• Formats auto réseaux</li>
              <li>• Export PNG HD</li>
            </ul>
            <div className="mt-5">
              <a href="/generate"><Button variant="outline" className="w-full">Choisir Starter</Button></a>
            </div>
          </Card>

          {/* Pro (highlight) */}
          <Card className="p-6 border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,.3)]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-semibold">Pro {badge("Recommandé")}</h3>
              <div className="text-2xl font-extrabold">
                {price(49, 490)}€
                <span className="text-sm text-neutral-600 font-medium">/{annual ? "an" : "mois"}</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-neutral-600">Pour poster souvent et tester.</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-200">
              <li>• 250 images / {annual ? "an" : "mois"}</li>
              <li>• Jusqu’à 3 variantes par génération</li>
              <li>• Couleur de marque & accroches</li>
              <li>• Historique & téléchargements</li>
            </ul>
            <div className="mt-5">
              <a href="/generate"><Button className="w-full">Choisir Pro</Button></a>
            </div>
          </Card>

          {/* Business */}
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-semibold">Business</h3>
              <div className="text-2xl font-extrabold">
                {price(149, 1490)}€
                <span className="text-sm text-neutral-600 font-medium">/{annual ? "an" : "mois"}</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-neutral-600">Pour les petites équipes.</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-200">
              <li>• 1000 images / {annual ? "an" : "mois"}</li>
              <li>• Espace marque (logo, couleurs)</li>
              <li>• Priorité support</li>
              <li>• Pré‑config campagnes</li>
            </ul>
            <div className="mt-5">
              <a href="/generate"><Button variant="outline" className="w-full">Choisir Business</Button></a>
            </div>
          </Card>
        </div>

        {/* FAQ courte */}
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="font-semibold">Quand est-ce que je paie ?</div>
            <p className="text-sm text-neutral-600 mt-1">Uniquement quand vous générez de vraies images (les appels IA ont un coût). L’essai ne requiert pas de carte.</p>
          </Card>
          <Card className="p-5">
            <div className="font-semibold">Puis-je annuler ?</div>
            <p className="text-sm text-neutral-600 mt-1">Oui, à tout moment. Vos visuels restent téléchargeables.</p>
          </Card>
          <Card className="p-5">
            <div className="font-semibold">Et pour les vidéos ?</div>
            <p className="text-sm text-neutral-600 mt-1">C’est prévu. Elles seront incluses à partir du plan Pro (crédits séparés).</p>
          </Card>
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <Card className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Prêt à essayer Keiro ?</div>
            <div className="text-sm text-neutral-600">Générez un premier visuel en moins d’une minute.</div>
          </div>
          <a href="/generate"><Button>Commencer maintenant</Button></a>
        </Card>
      </section>
    </main>
  );
}
