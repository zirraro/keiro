export default function Home() {
  return (
    <main className="bg-white">
      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 lg:px-8 pt-14 pb-10 md:pt-16 md:pb-12 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
        <div>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium bg-[#F5F7FB] text-[#2B6CB0] ring-1 ring-black/5">
            <span>•</span> Nouveau – Génération guidée par l’actualité
          </div>

          {/* Headline */}
          <h1 className="mt-5 text-[42px] leading-[1.1] sm:text-[52px] font-extrabold tracking-tight text-[#0F172A]">
            Créez des visuels qui
            <br />
            <span className="text-[#1A73E8]"> surfent sur l’actu</span>.
          </h1>

          {/* Copy */}
          <p className="mt-5 text-[15.5px] sm:text-[16.5px] text-[#475569] max-w-xl">
            Keiro transforme votre secteur, votre angle et les tendances du jour
            en visuels prêts à poster pour Instagram, TikTok, Facebook, LinkedIn & X.
          </p>

          {/* CTA buttons */}
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <a
              href="/generate"
              className="inline-flex items-center rounded-lg bg-[#1A73E8] hover:bg-[#1768d2] text-white font-semibold px-4.5 py-2.5 shadow-sm ring-1 ring-[#1A73E8]/20 transition"
            >
              Générer un visuel
            </a>
            <a
              href="#how"
              className="inline-flex items-center rounded-lg bg-white hover:bg-[#F8FAFC] text-[#0F172A] font-semibold px-4.5 py-2.5 ring-1 ring-black/10 transition"
            >
              Voir comment ça marche
            </a>
          </div>

          <p className="mt-3 text-xs text-[#94A3B8]">
            Essai sans carte – Export PNG HD – 1 à 3 variantes
          </p>
        </div>

        {/* Mockup simple à droite */}
        <div className="relative">
          <div className="relative rounded-2xl bg-white ring-1 ring-black/10 shadow-[0_10px_30px_rgba(15,23,42,.08)] p-4">
            <div className="aspect-[4/3] w-full rounded-xl bg-gradient-to-b from-[#F6F9FF] to-white ring-1 ring-black/5 flex items-center justify-center text-[#94A3B8]">
              Aperçu
            </div>
          </div>
        </div>
      </section>

      {/* Logos / Bar + trainée bleutée */}
      <section className="relative">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1A73E8]/15 blur-2xl" />
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-4 flex flex-wrap justify-center gap-6 ring-1 ring-black/5 rounded-xl bg-white shadow-[0_10px_30px_rgba(15,23,42,.03)]">
          {["LinkedIn","X","Shopify","Stripe","Zapier","Notion","Figma","Instagram","TikTok","Facebook","LinkedIn","X"].map((b,i)=>(
            <span key={i} className="text-[13px] text-[#64748B]">{b}</span>
          ))}
        </div>
      </section>

      {/* Features cards */}
      <section id="how" className="max-w-6xl mx-auto px-6 lg:px-8 py-10 grid md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white ring-1 ring-black/10 shadow-[0_12px_28px_rgba(15,23,42,.06)] p-5">
          <p className="text-[13px] text-[#1A73E8] font-semibold">Guidage intelligent</p>
          <h3 className="mt-1 font-semibold text-[#0F172A]">Pas d’inspi ? On guide.</h3>
          <p className="mt-2 text-[15px] text-[#475569]">
            Plateforme, objectif, tendance : Keiro prépare automatiquement un brief qui capte l’attention.
          </p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-black/10 shadow-[0_12px_28px_rgba(15,23,42,.06)] p-5">
          <p className="text-[13px] text-[#1A73E8] font-semibold">3 variantes</p>
          <h3 className="mt-1 font-semibold text-[#0F172A]">Choisissez en un clin d’œil</h3>
          <p className="mt-2 text-[15px] text-[#475569]">
            Jusqu’à 3 propositions d’un coup pour aller vite et sélectionner la meilleure.
          </p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-black/10 shadow-[0_12px_28px_rgba(15,23,42,.06)] p-5">
          <p className="text-[13px] text-[#1A73E8] font-semibold">Prêt réseaux</p>
          <h3 className="mt-1 font-semibold text-[#0F172A]">Formats auto</h3>
          <p className="mt-2 text-[15px] text-[#475569]">
            Carré, vertical, large — on adapte au réseau (IG, TikTok, FB, LinkedIn, X). Export PNG HD.
          </p>
        </div>
      </section>

      {/* CTA bas de page avec légère lueur */}
      <section className="relative mb-10">
        <div className="pointer-events-none absolute inset-0 mx-auto max-w-5xl h-24 rounded-2xl bg-[#1A73E8]/10 blur-3xl" />
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-6 rounded-2xl bg-white ring-1 ring-black/10 shadow-[0_14px_36px_rgba(15,23,42,.06)] flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[#0F172A] font-semibold">Prêt à essayer Keiro ?</p>
            <p className="text-[14.5px] text-[#64748B]">Générez un premier visuel en moins d’une minute.</p>
          </div>
          <a
            href="/generate"
            className="inline-flex items-center rounded-lg bg-[#1A73E8] hover:bg-[#1768d2] text-white font-semibold px-4.5 py-2.5 shadow-sm ring-1 ring-[#1A73E8]/20 transition"
          >
            Commencer maintenant
          </a>
        </div>
      </section>
    </main>
  );
}
