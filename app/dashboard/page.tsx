'use client';

import Link from "next/link";
import Image from "next/image";
import { Button } from "../../components/ui/button";
import { TiltCard } from "../../components/ui/tilt-card";
import { SectionReveal } from "../../components/ui/section-reveal";

const mockImages = [
  "https://placehold.co/600x600/1e293b/ffffff?text=Visuel+1",
  "https://placehold.co/600x600/334155/ffffff?text=Visuel+2",
  "https://placehold.co/600x600/475569/ffffff?text=Visuel+3",
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <SectionReveal>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Tableau de bord</h1>
              <p className="text-neutral-400 mt-1">Gérez vos créations et votre espace marque</p>
            </div>
            <Link href="/generate">
              <Button>+ Nouveau visuel</Button>
            </Link>
          </div>
        </SectionReveal>

        {/* Derniers visuels */}
        <SectionReveal>
          <div>
            <h2 className="text-xl font-semibold mb-3">Derniers visuels générés</h2>
            {mockImages.length > 0 ? (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {mockImages.map((src, i) => (
                  <TiltCard key={i} className="overflow-hidden">
                    <Image
                      src={src}
                      alt={`visuel-${i}`}
                      width={600}
                      height={600}
                      className="w-full h-auto"
                    />
                    <div className="p-3 text-sm text-neutral-400">Visuel #{i + 1} — IG • Promo</div>
                  </TiltCard>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500">Aucun visuel généré pour le moment.</p>
            )}
          </div>
        </SectionReveal>

        {/* Accès rapide */}
        <SectionReveal>
          <div>
            <h2 className="text-xl font-semibold mb-3">Accès rapide</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              <TiltCard className="p-5">
                <h3 className="font-semibold">Espace marque</h3>
                <p className="text-sm text-neutral-400 mb-3">Logo, couleurs et slogan.</p>
                <Link href="/brand">
                  <Button variant="outline" className="w-full">Configurer</Button>
                </Link>
              </TiltCard>

              <TiltCard className="p-5">
                <h3 className="font-semibold">Tarifs & abonnements</h3>
                <p className="text-sm text-neutral-400 mb-3">Comparez les plans.</p>
                <Link href="/pricing">
                  <Button variant="outline" className="w-full">Voir tarifs</Button>
                </Link>
              </TiltCard>

              <TiltCard className="p-5">
                <h3 className="font-semibold">Support</h3>
                <p className="text-sm text-neutral-400 mb-3">Une question ?</p>
                <Link href="/contact">
                  <Button variant="outline" className="w-full">Contacter</Button>
                </Link>
              </TiltCard>
            </div>
          </div>
        </SectionReveal>
      </div>
    </main>
  );
}
