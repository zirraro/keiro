'use client';

import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Toggle } from "../../components/ui/toggle";
import { Accordion, AccordionItem } from "../../components/ui/accordion";
import { TiltCard } from "../../components/ui/tilt-card";
import { SectionReveal } from "../../components/ui/section-reveal";

export default function PricingPage() {
  const [billing, setBilling] = useState<"left"|"right">("left"); // left=Mensuel, right=Annuel
  const annual = billing === "right";
  const price = (m:number, a:number) => annual ? a : m;

  const badge = (txt:string) => (
    <span className="ml-2 text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 align-middle">
      {txt}
    </span>
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(59,130,246,.06),transparent)] bg-white text-neutral-900">
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-10">
        <SectionReveal>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-4xl font-extrabold">Tarifs simples, sans surprise</h1>
              <p className="text-neutral-600 mt-2">Payez pour la valeur — pas pour la complexité.</p>
            </div>
            <Toggle value={billing} onChange={setBilling} left="Mensuel" right="Annuel -2 mois" />
          </div>
        </SectionReveal>

        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <SectionReveal>
            <TiltCard className="p-6">
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
            </TiltCard>
          </SectionReveal>

          <SectionReveal>
            <TiltCard className="p-6 border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,.3)]">
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
            </TiltCard>
          </SectionReveal>

          <SectionReveal>
            <TiltCard className="p-6">
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
            </TiltCard>
          </SectionReveal>
        </div>

        {/* FAQ */}
        <SectionReveal>
          <div className="mt-12 max-w-3xl">
            <h2 className="text-2xl font-bold mb-4">FAQ</h2>
            <Accordion>
              <AccordionItem title="Quand est-ce que je paie ?" defaultOpen>
                Uniquement quand vous générez de vraies images (les appels IA ont un coût). L’essai guidé ne requiert pas de carte.
              </AccordionItem>
              <AccordionItem title="Puis-je annuler ?">
                Oui, à tout moment. Vos visuels restent téléchargeables. Pas d’engagement à long terme.
              </AccordionItem>
              <AccordionItem title="Les vidéos sont-elles incluses ?">
                C’est prévu dans la feuille de route. Elles seront proposées à partir du plan Pro (crédits séparés).
              </AccordionItem>
              <AccordionItem title="Puis-je intégrer mon logo et mes couleurs ?">
                Oui, avec l’Espace marque (dès Business). Vous pouvez aussi définir la teinte de marque dans Pro.
              </AccordionItem>
            </Accordion>
          </div>
        </SectionReveal>

        {/* CTA final */}
        <SectionReveal>
          <Card className="p-6 mt-10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Prêt à essayer Keiro ?</div>
              <div className="text-sm text-neutral-600">Générez un premier visuel en moins d’une minute.</div>
            </div>
            <a href="/generate"><Button>Commencer maintenant</Button></a>
          </Card>
        </SectionReveal>
      </section>
    </main>
  );
}
