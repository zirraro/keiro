import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * L'équipe, en accès libre.
 *
 * Demande du fondateur (2026-08-06) : « parcours le chemin comme un prospect
 * et regarde où peuvent être les points de friction, élimine-les. »
 *
 * Le point de friction que cette page corrige : « Voir ton équipe en action »
 * sur l'accueil envoyait vers /assistant, qui exige un compte. Le visiteur le
 * plus curieux — celui qui veut comprendre avant d'acheter — se prenait un mur
 * de connexion. On lui montre l'équipe sans rien demander.
 *
 * ── Ce qui est écrit ici ──
 *
 * Pas de promesse abstraite : pour chaque agent, ce qu'il fait cette semaine,
 * dans les mots du commerçant. Et le plan qui l'inclut, écrit sur la carte —
 * découvrir après paiement qu'un agent n'était pas compris est la meilleure
 * façon de perdre un client au premier mois.
 *
 * Les plans viennent de `minPlan` (lib/agents/client-context.ts), seule source
 * de vérité. Toute divergence ici serait une promesse que l'abonnement ne
 * tient pas.
 */

export const metadata: Metadata = {
  title: 'Ton équipe — KeiroAI',
  description:
    "Léna publie, Jade répond, Théo gère tes avis Google, Hugo tient ta boîte mail. Découvre les 10 agents KeiroAI et ce que chacun fait pour ton commerce.",
  alternates: { canonical: 'https://keiroai.com/agents' },
  openGraph: {
    title: 'Ton équipe — KeiroAI',
    description:
      "Dix agents qui travaillent pour ton commerce : publication, messages, avis Google, prospection, emails, WhatsApp.",
    url: 'https://keiroai.com/agents',
    type: 'website',
  },
};

interface Agent {
  prenom: string;
  role: string;
  /** Ce qu'il fait, dit comme le commerçant le vivrait. */
  quoi: string;
  /** Une action concrète, telle qu'elle apparaît dans le tableau de bord. */
  exemple: string;
  plan: 'Créateur' | 'Pro' | 'Business';
  emoji: string;
}

const EQUIPE: Agent[] = [
  {
    prenom: 'Léna', role: 'Contenu', emoji: '🎬', plan: 'Créateur',
    quoi: "Crée tes visuels et tes vidéos, écrit les légendes, programme et publie sur Instagram et TikTok aux heures où ton audience est là.",
    exemple: "A publié 4 posts cette semaine, dont un reel à 19 h — ton créneau le plus vu.",
  },
  {
    prenom: 'Jade', role: 'Messages', emoji: '💬', plan: 'Créateur',
    quoi: "Répond aux DM et aux commentaires Instagram, engage les gens qui te suivent, et te passe la main dès qu'une conversation devient sérieuse.",
    exemple: "A répondu à 23 commentaires et transmis 3 demandes de réservation.",
  },
  {
    prenom: 'Théo', role: 'Google', emoji: '📍', plan: 'Créateur',
    quoi: "Répond à tes avis Google, tient ta fiche à jour, et te signale quand un horaire ou une info ne correspond plus.",
    exemple: "A répondu à 5 avis. Un avis 2★ t'a été signalé avant publication.",
  },
  {
    prenom: 'Sara', role: 'Contrats', emoji: '📄', plan: 'Créateur',
    quoi: "Rédige tes contrats, promesses d'embauche, devis et courriers, prêts à signer.",
    exemple: "A préparé un contrat d'extra pour le service du samedi.",
  },
  {
    prenom: 'Louis', role: 'Chiffres', emoji: '📊', plan: 'Créateur',
    quoi: "Business plans, prévisionnels, tableaux et présentations — de quoi aller voir ta banque sans y passer le week-end.",
    exemple: "A monté le prévisionnel à 12 mois pour ton dossier de financement.",
  },
  {
    prenom: 'Ami', role: 'Stratégie', emoji: '🧭', plan: 'Créateur',
    quoi: "Lit les résultats de toute l'équipe chaque semaine, comprend ce qui marche, et corrige la stratégie des autres chaque mois.",
    exemple: "A décalé tes publications de 12 h à 19 h : +40 % de vues sur 3 semaines.",
  },
  {
    prenom: 'Clara', role: 'Accueil', emoji: '👋', plan: 'Créateur',
    quoi: "Configure ton espace, récupère tes infos une seule fois et les distribue à toute l'équipe. C'est à elle que tu déposes tes photos et tes documents.",
    exemple: "A transmis tes horaires à Théo et ta carte à Léna.",
  },
  {
    prenom: 'Hugo', role: 'Emails', emoji: '📬', plan: 'Pro',
    quoi: "Tient ta boîte mail : trie, répond, relance les devis sans réponse, lance tes séquences.",
    exemple: "A relancé 8 devis en attente. 2 clients ont répondu.",
  },
  {
    prenom: 'Léo', role: 'Prospection', emoji: '🎯', plan: 'Pro',
    quoi: "Trouve des clients potentiels autour de toi, les qualifie, remplit ton CRM et prépare l'approche.",
    exemple: "A ajouté 47 prospects qualifiés, dont 5 marqués prioritaires.",
  },
  {
    prenom: 'Stella', role: 'WhatsApp', emoji: '📱', plan: 'Pro',
    quoi: "Confirme tes réservations, envoie les rappels anti no-show, répond aux questions courantes sur WhatsApp.",
    exemple: "A confirmé 14 réservations et évité 3 tables vides.",
  },
];

const COULEUR_PLAN: Record<Agent['plan'], string> = {
  Créateur: 'bg-emerald-400/12 text-emerald-300 border-emerald-400/25',
  Pro: 'bg-blue-400/12 text-blue-300 border-blue-400/25',
  Business: 'bg-purple-400/12 text-purple-300 border-purple-400/25',
};

export default function PageAgents() {
  return (
    <main className="min-h-screen bg-[#0c1a3a] text-white">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <header className="mb-10 sm:mb-14">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm mb-6 transition-colors"
          >
            ← Retour
          </Link>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Ton équipe travaille
            <br className="hidden sm:block" />
            <span className="text-white/50"> pendant que tu sers tes clients.</span>
          </h1>
          <p className="mt-5 text-white/60 text-base sm:text-lg leading-relaxed max-w-2xl">
            Dix agents, chacun son métier. Tu connectes tes comptes une fois, tu déposes
            quelques photos, et ils s'occupent du reste — publications, messages, avis,
            devis, prospection.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {EQUIPE.map(a => (
            <article
              key={a.prenom}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl leading-none" aria-hidden>{a.emoji}</span>
                  <div className="min-w-0">
                    <h2 className="font-bold text-lg leading-tight">{a.prenom}</h2>
                    <p className="text-white/40 text-xs">{a.role}</p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border flex-shrink-0 ${COULEUR_PLAN[a.plan]}`}
                >
                  {a.plan}
                </span>
              </div>

              <p className="text-white/70 text-sm leading-relaxed mb-3 flex-1">{a.quoi}</p>

              <p className="text-white/45 text-[13px] leading-relaxed pt-3 border-t border-white/10">
                <span className="text-white/30">Cette semaine · </span>
                {a.exemple}
              </p>
            </article>
          ))}
        </div>

        {/* Les exemples ci-dessus sont illustratifs : le dire évite qu'un
            prospect les prenne pour des chiffres garantis. */}
        <p className="mt-5 text-white/30 text-xs leading-relaxed">
          Les activités affichées sont des exemples représentatifs d'une semaine type.
          Tes chiffres dépendent de ton commerce et de ton audience.
        </p>

        <section className="mt-12 sm:mt-16 rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 text-center">
          <h2 className="text-xl sm:text-2xl font-bold">Sept agents dès 49 € par mois</h2>
          <p className="mt-2 text-white/55 text-sm sm:text-base leading-relaxed max-w-xl mx-auto">
            Moins qu'un service d'extra le samedi soir. Sept jours pour essayer,
            annulation en un clic, sans avoir à écrire à qui que ce soit.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/essai?plan=createur"
              className="inline-flex items-center justify-center min-h-[52px] px-7 rounded-xl bg-white text-[#0c1a3a] font-semibold hover:opacity-90 active:opacity-80 transition-opacity"
            >
              Essayer 7 jours gratuitement
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center min-h-[52px] px-7 rounded-xl border border-white/25 text-white font-medium hover:bg-white/10 transition-colors"
            >
              Voir les plans en détail
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
