import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

function Plan({
  title, price, tagline, feats, cta = "Choisir", highlight = false
}: {
  title: string; price: string; tagline: string; feats: string[]; cta?: string; highlight?: boolean;
}) {
  return (
    <Card className={`p-6 ${highlight ? "border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,.3)]" : ""}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-semibold">{title}</h3>
        <div className="text-2xl font-extrabold">{price}<span className="text-sm text-neutral-400 font-medium"> /mois</span></div>
      </div>
      <p className="mt-1 text-sm text-neutral-400">{tagline}</p>
      <ul className="mt-4 space-y-2 text-sm text-neutral-200">
        {feats.map((f,i) => <li key={i}>• {f}</li>)}
      </ul>
      <div className="mt-5">
        <a href="/generate"><Button variant={highlight ? "primary" : "outline"} className="w-full">{cta}</Button></a>
      </div>
    </Card>
  );
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(59,130,246,.14),transparent)]">
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-12">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl font-extrabold">Tarifs simples, sans surprise</h1>
          <p className="mt-3 text-neutral-300">
            Payez pour la valeur : visuels prêts à poster, adaptés à l’actualité et à votre marque.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-10">
          <Plan
            title="Starter"
            price="19€"
            tagline="Lancez-vous en solo."
            feats={[
              "50 images / mois",
              "1 proposition par génération",
              "Formats auto (IG, TikTok, FB, LinkedIn, X)",
              "Export PNG HD",
            ]}
          />
          <Plan
            title="Pro"
            price="49€"
            tagline="Pour poster souvent et tester."
            feats={[
              "250 images / mois",
              "Jusqu’à 3 variantes par génération",
              "Couleur de marque & accroches suggérées",
              "Historique et téléchargements",
            ]}
            highlight
          />
          <Plan
            title="Business"
            price="149€"
            tagline="Pour les petites équipes."
            feats={[
              "1000 images / mois",
              "Espace marque (logo, couleurs)",
              "Priorité support",
              "Pré‑configurations par campagne",
            ]}
          />
        </div>

        <div className="mt-10 text-center text-sm text-neutral-400">
          Besoin d’auto‑post IG/FB ou intégration CRM ? <span className="text-neutral-200">Plan Entreprise sur mesure</span>.
        </div>
      </section>
    </main>
  );
}
