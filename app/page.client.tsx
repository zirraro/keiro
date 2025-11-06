'use client';


import Spotlight from "../components/site/spotlight";
import GridBG from "../components/site/grid-bg";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import LogosMarquee from "../components/site/logos-marquee";
import { TiltCard } from "../components/ui/tilt-card";
import { SectionReveal } from "../components/ui/section-reveal";
import GradientDivider from "../components/ui/gradient-divider";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-white text-neutral-900 overflow-hidden">
      <Spotlight />
      <GridBG />

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-10 grid md:grid-cols-2 gap-10 items-center">
        <SectionReveal>
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-blue-500 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Nouveau · Génération guidée par l'actualité
            </div>
            <h1 className="mt-6 text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
              Créez des visuels qui <span className="bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-400 bg-clip-text text-transparent">surfent sur l'actu</span>.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-neutral-600 leading-relaxed">
              Keiro transforme votre secteur, votre angle et les tendances du jour en visuels prêts à poster pour Instagram, TikTok, Facebook, LinkedIn & X.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/generate">
                <Button>Générer un visuel</Button>
              </a>
              <a href="#how-it-works">
                <Button variant="outline">Voir comment ça marche</Button>
              </a>
            </div>

            <div className="mt-6 flex items-center gap-4 text-sm text-neutral-500">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                Essai sans carte
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                Export PNG HD
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                1 à 3 variantes
              </span>
            </div>
          </div>
        </SectionReveal>

        {/* Mock premium‑like en tilt */}
        <SectionReveal className="md:justify-self-end">
          <TiltCard className="p-0 shadow-2xl shadow-blue-500/10">
            <div className="aspect-[4/3] bg-gradient-to-br from-blue-50 to-cyan-50 p-5 rounded-2xl">
              <div className="h-full w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                    <div className="text-xs font-medium text-blue-600 mb-2">Brief</div>
                    <div className="h-24 rounded-md bg-white border border-blue-100" />
                    <div className="mt-3 h-2 rounded-full bg-blue-200 w-2/3" />
                    <div className="mt-2 h-2 rounded-full bg-blue-100 w-1/2" />
                  </div>
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3">
                    <div className="text-xs font-medium text-cyan-600 mb-2">Aperçu</div>
                    <div className="h-40 rounded-md bg-gradient-to-br from-blue-400 to-cyan-400 border border-cyan-200" />
                    <div className="mt-3 flex gap-2">
                      <div className="h-2 rounded-full bg-cyan-200 w-1/2" />
                      <div className="h-2 rounded-full bg-cyan-100 w-1/3" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-8 w-24 rounded-lg bg-blue-500 shadow-sm" />
                  <div className="h-8 w-24 rounded-lg border-2 border-neutral-200" />
                </div>
              </div>
            </div>
          </TiltCard>
        </SectionReveal>
      </section>

      <section className="max-w-6xl mx-auto px-4">
        <GradientDivider />
        <LogosMarquee />
        <GradientDivider />
      </section>

      {/* BÉNÉFICES en Tilt + Reveal */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900">Comment ça marche ?</h2>
          <p className="mt-3 text-lg text-neutral-600">Simple, rapide, efficace</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <SectionReveal>
            <TiltCard className="p-6 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-100 hover:border-blue-200 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              </div>
              <div className="text-sm font-medium text-blue-600 mb-1">Guidage intelligent</div>
              <div className="text-xl font-bold text-neutral-900 mb-2">Pas d'inspi ? On guide.</div>
              <p className="text-neutral-600 text-sm leading-relaxed">
                Plateforme, objectif, tendance : Keiro prépare automatiquement un brief qui capte l'attention.
              </p>
            </TiltCard>
          </SectionReveal>

          <SectionReveal>
            <TiltCard className="p-6 bg-gradient-to-br from-cyan-50 to-white border-2 border-cyan-100 hover:border-cyan-200 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div className="text-sm font-medium text-cyan-600 mb-1">3 variantes</div>
              <div className="text-xl font-bold text-neutral-900 mb-2">Choisissez en un clin d'œil</div>
              <p className="text-neutral-600 text-sm leading-relaxed">
                Jusqu'à 3 propositions d'un coup pour aller vite et sélectionner la meilleure.
              </p>
            </TiltCard>
          </SectionReveal>

          <SectionReveal>
            <TiltCard className="p-6 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-100 hover:border-blue-200 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </div>
              <div className="text-sm font-medium text-blue-600 mb-1">Prêt réseaux</div>
              <div className="text-xl font-bold text-neutral-900 mb-2">Formats auto</div>
              <p className="text-neutral-600 text-sm leading-relaxed">
                Carré, vertical, large — on adapte au réseau (IG, TikTok, FB, LinkedIn, X). Export PNG HD.
              </p>
            </TiltCard>
          </SectionReveal>
        </div>
      </section>

      {/* CTA final */}
      <SectionReveal>
        <section className="max-w-6xl mx-auto px-4 pb-20">
          <TiltCard className="p-8 md:p-10 bg-gradient-to-r from-blue-500 to-cyan-500 border-0 shadow-2xl shadow-blue-500/30">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-white">
              <div>
                <div className="text-2xl md:text-3xl font-bold mb-2">Prêt à essayer Keiro ?</div>
                <div className="text-blue-100 text-lg">Générez un premier visuel en moins d'une minute.</div>
              </div>
              <a href="/generate">
                <Button className="bg-white text-blue-600 hover:bg-blue-50 shadow-lg text-lg px-8 py-6 font-semibold">
                  Commencer maintenant
                </Button>
              </a>
            </div>
          </TiltCard>
        </section>
      </SectionReveal>
    </main>
  );
}
