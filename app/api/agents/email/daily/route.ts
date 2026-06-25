import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promises as dns } from 'dns';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { verifyProspectData, verifyCRMCoherence } from '@/lib/agents/business-timing';
import { callGemini } from '@/lib/agents/gemini';
import { loadContextWithAvatar } from '@/lib/agents/shared-context';
import { canSendEmail } from '@/lib/agents/email-dedup';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { pickRegister } from '@/lib/agents/tone-register';

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// In-process MX cache (lifetime = one cron slot execution) so 50 prospects
// on the same domain don't each trigger a DNS lookup.
const mxCache = new Map<string, boolean>();
async function hasMxRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  try {
    const records = await dns.resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch (e: any) {
    // ENOTFOUND / ENODATA → domain has no MX and can't receive mail
    if (e?.code === 'ENOTFOUND' || e?.code === 'ENODATA') {
      mxCache.set(domain, false);
      return false;
    }
    // Other DNS errors (SERVFAIL, TIMEOUT) — give benefit of doubt, don't cache
    return true;
  }
}

/**
 * Auto-categorize a prospect based on company name and other signals.
 * Returns the inferred business type, or null if unable to determine.
 */
function autoCategorizeProspect(prospect: any): string | null {
  const company = (prospect.company || '').toLowerCase();
  const email = (prospect.email || '').toLowerCase();

  // Keywords → type mapping
  const patterns: [RegExp, string][] = [
    [/\b(resto|restaurant|brasserie|bistrot|pizza|sushi|burger|grill|cuisine|trattoria|kebab|thai|chinois|japonais|indien|libanais|mexicain)\b/i, 'restaurant'],
    [/\b(traiteur|catering|banquet|réception)\b/i, 'traiteur'],
    [/\b(boutique|magasin|shop|store|prêt[- ]à[- ]porter|vêtement|mode|fashion|bijou|accessoire)\b/i, 'boutique'],
    [/\b(coach|coaching|fitness|sport|gym|musculation|yoga|pilates|crossfit|personal.?train)\b/i, 'coach'],
    [/\b(coiff|barb[ie]|hair|salon de|beauté|esthéti|ongle|manucure|nail)\b/i, 'coiffeur'],
    [/\b(cave|caviste|vin|wine|fromage|fromagerie|épicerie fine)\b/i, 'caviste'],
    [/\b(fleur|florist|garden|jardin|pépinière)\b/i, 'fleuriste'],
    [/\b(freelance|consultant|indépendant|auto[- ]?entrepreneur)\b/i, 'freelance'],
    [/\b(avocat|notaire|cabinet|juridique|droit)\b/i, 'professionnel'],
    [/\b(médecin|docteur|kiné|ostéo|dentiste|pharmacie|santé|clinique|thérapeute|psycho)\b/i, 'professionnel'],
    [/\b(plomb|electri|chauffag|menuisi|artisan|maçon|peintre|carreleur|serrurier|couvreur)\b/i, 'services'],
    [/\b(agence|agency|studio|digital|marketing|communication|web|design)\b/i, 'agence'],
    [/\b(boulangerie|boulanger|pâtisserie|pâtissier)\b/i, 'restaurant'],
    [/\b(café|coffee|tea|thé|bar\b|pub\b|lounge)\b/i, 'restaurant'],
    [/\b(photo|vidéo|film|prod|création|créatif|graphi|illustrat)\b/i, 'freelance'],
    [/\b(form|école|académ|institut|éducat|cours)\b/i, 'coach'],
    [/\b(immobili|courtier|agent immobilier)\b/i, 'professionnel'],
    [/\b(startup|sarl|sas|eurl|entreprise|société|group)\b/i, 'pme'],
  ];

  for (const [regex, type] of patterns) {
    if (regex.test(company)) return type;
  }

  // Try email domain as fallback
  const domain = email.split('@')[1] || '';
  for (const [regex, type] of patterns) {
    if (regex.test(domain)) return type;
  }

  // Smart fallback: never return null — assign best-fit based on context signals
  // If has Instagram or Google rating, likely a local commerce → boutique (most generic local)
  if (prospect.instagram || prospect.google_rating) return 'boutique';
  // If has a website, likely a professional or PME
  if (prospect.website) return 'pme';
  // If source is chatbot, they're interested in content → boutique (most visual)
  if (prospect.source === 'chatbot') return 'boutique';
  // Ultimate fallback: PME (generic enough for any business)
  return 'pme';
}

interface SendResult {
  prospect_id: string;
  email: string;
  company?: string;
  step: number;
  success: boolean;
  error?: string;
  messageId?: string;
  ai_generated?: boolean;
}

/**
 * Load shared context + agent-specific learnings.
 */
async function loadAgentLearnings(orgId: string | null = null): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { prompt: contextPrompt } = await loadContextWithAvatar(supabase, 'email', orgId || undefined);
  let context = contextPrompt;

  // Add email-specific performance data
  const { data: recentRuns } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'email')
    .in('action', ['daily_cold', 'daily_warm'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentRuns && recentRuns.length > 0) {
    context += '\n\nRÉSULTATS RÉCENTS EMAIL :\n';
    for (const run of recentRuns) {
      const d = run.data;
      if (d?.total !== undefined) {
        context += `- ${new Date(run.created_at).toLocaleDateString('fr-FR')}: ${d.success || 0} envoyés (${d.ai_generated || 0} IA), ${d.failed || 0} échoués\n`;
      }
    }
  }

  return context;
}

/**
 * Generate a batch of personalized emails using Gemini AI.
 * One AI call for up to 10 prospects = efficient + intelligent.
 */
async function generateAIEmails(
  prospects: Array<{ prospect: any; category: string; step: number }>,
  learnings: string,
  ownerUserId: string | null = null,
  supabaseClient: any = null,
): Promise<Map<string, { subject: string; textBody: string; htmlBody: string }>> {
  const results = new Map<string, { subject: string; textBody: string; htmlBody: string }>();

  if (!process.env.GEMINI_API_KEY || prospects.length === 0) return results;

  // 2026-06-08 — Load client's typed directives for Hugo
  // (email_signature, email_subject_style, language_tone, custom, ...).
  let directivesBlock = '';
  if (ownerUserId && supabaseClient) {
    try {
      const { loadTypedDirectives, directivesPromptBlock } = await import('@/lib/agents/typed-directives');
      const typed = await loadTypedDirectives(supabaseClient, ownerUserId, 'email');
      directivesBlock = directivesPromptBlock(typed);
    } catch (e: any) {
      console.warn('[EmailDaily] typed directives load failed:', e?.message);
    }
  }

  // 2026-06-23 — Founder : "identifier ce qui fait OUVRIR + améliorer
  // CONSTAMMENT le taux d'ouverture + partager dans le RAG". autoLearn écrit
  // déjà les apprentissages open/click/reply dans le RAG ; ici on FERME la
  // boucle en les RÉ-INJECTANT dans le prompt de génération des objets, pour
  // que Hugo applique ce qui fonctionne réellement chez nous (amélioration
  // continue auto-renforcée).
  let learningsBlock = '';
  if (supabaseClient) {
    try {
      const { getActiveLearnings, formatLearningsForPrompt } = await import('@/lib/agents/learning');
      const emailLearnings = await getActiveLearnings(supabaseClient, 'email', undefined, undefined);
      if ((emailLearnings || []).length > 0) {
        learningsBlock = '\n\n=== CE QUI MARCHE CHEZ NOUS (apprentissages perf email — APPLIQUE-LES pour maximiser l\'ouverture) ===\n'
          + formatLearningsForPrompt(emailLearnings || [], []);
      }
    } catch (e: any) { console.warn('[EmailDaily] email learnings load failed:', e?.message); }
  }

  // Build batch prompt with rich prospect data
  const prospectList = prospects.map((p, i) => {
    const pr = p.prospect;
    const socialInfo = [];
    if (pr.instagram) socialInfo.push(`Instagram: @${pr.instagram}`);
    if (pr.tiktok_handle) socialInfo.push(`TikTok: @${pr.tiktok_handle}`);
    if (pr.website) socialInfo.push(`Site: ${pr.website}`);
    if (pr.google_rating) socialInfo.push(`Google: ${pr.google_rating}/5 (${pr.google_reviews || '?'} avis)`);

    return `PROSPECT ${i + 1} (id: ${pr.id}):
- Entreprise: ${pr.company || '(inconnu)'}
- Prénom: ${pr.first_name || ''}
- Type: ${p.category}
- Registre à utiliser: ${pickRegister(pr.type || p.category)} ${pickRegister(pr.type || p.category) === 'vous' ? '(vouvoiement — secteur sérieux/premium, ouvre par "Bonjour")' : '(tutoiement — local/lifestyle, ouvre par "Salut")'}
- Quartier: ${pr.quartier ? pr.quartier : 'INCONNU — ne mentionne PAS de quartier dans l\'email'}
- Note Google: ${pr.note_google || pr.google_rating || 'non connue'}
- Email: ${pr.email}
- Step: ${p.step} (${p.step === 1 ? 'PREMIER CONTACT' : p.step === 2 ? 'RELANCE — change l\'angle si step 1 non ouvert' : p.step === 3 ? 'VALEUR GRATUITE — conseil concret, zéro CTA' : p.step === 4 ? 'FOMO — urgence naturelle, concurrents' : p.step === 5 ? 'DERNIÈRE CHANCE — break-up, désarmant' : 'WARM FOLLOW-UP'})
- Engagement: ${pr.last_email_opened_at ? 'A OUVERT un email précédent' : 'N\'a JAMAIS ouvert'} ${pr.last_email_clicked_at ? '+ A CLIQUÉ' : ''} ${pr.last_email_replied_at ? '+ A RÉPONDU' : ''}
- Score prospect: ${pr.score || 0}/100 (${pr.temperature || 'cold'})
- Réseaux: ${socialInfo.length > 0 ? socialInfo.join(' | ') : 'aucun trouvé'}
- Source: ${pr.source || 'import'}`;
  }).join('\n\n');

  try {
    const rawText = await callGemini({
      system: `Tu es Hugo, l'expert email de KeiroAI — une plateforme IA qui génère images, vidéos et posts réseaux sociaux pour les commerces locaux et PME en France. Ton taux de réponse est 3x la moyenne du marché.

REGISTRE (tu/vous) — EXPERTISE : adapte le registre AU SECTEUR de CHAQUE prospect (indiqué sur sa fiche ci-dessous). Tutoiement pour le local/lifestyle (resto, coiffeur, coach, boutique…), vouvoiement pour les professions de confiance/premium (avocat, médecin, comptable, immobilier, santé…). On choisit la bonne formulation, pas "tu" partout.

TON OBJECTIF : écrire des emails qui donnent envie d'ESSAYER le produit — parce qu'il aide vraiment. Une réponse est bien, mais le vrai but est qu'il se dise "tiens, ça pourrait m'aider, je teste".

STRATÉGIE VALUE-FIRST (founder 2026-06-25) — le cœur de ton approche :
- Tu RENDS SERVICE avant de vendre. L'email doit ressembler à quelqu'un qui offre un coup de main utile, pas à un commercial. "Je t'ai préparé/repéré un truc qui peut t'aider" > "achète mon produit".
- Mets en avant l'ESSAI GRATUIT comme un cadeau sans risque : "essaie, c'est gratuit, tu juges par toi-même, ça prend 3 min". Le produit fait le travail à sa place — c'est ça la promesse.
- Hyper-PERSONNALISÉ : parle de SON commerce, SA situation, ce que ÇA lui apporterait à LUI concrètement (couverts, RDV, passage). Jamais générique.
- Générosité réelle : n'hésite pas à donner une vraie astuce gratuite, même sans qu'il achète. Celui qui aide est celui qu'on rappelle.
- Pas de pression, pas de fausse rareté. La confiance + l'utilité convertissent mieux que l'urgence forcée.

PSYCHOLOGIE :
- Le prospect veut savoir ce que ÇA fait pour LUI — montre le bénéfice, pas la techno.
- L'objet de l'email est 80% du travail — s'il n'ouvre pas, c'est mort. Objet = une accroche utile/curieuse, jamais "promo".
- La question > l'affirmation (une question crée un engagement mental).
- Le concret > l'abstrait ("5 clients en plus" > "booster votre visibilité").
- L'utilité ressentie > l'urgence artificielle. On aide d'abord.

MATRICE STRATÉGIQUE — adapte l'angle selon le TYPE + le STEP + la TEMPÉRATURE :

ANGLES PAR TYPE DE COMMERCE :
- Restaurant/Traiteur : angle "couverts" — visuels de plats = +30% clics, stories quotidiennes, menu du jour
- Boutique/Magasin : angle "passage" — vitrine digitale, lookbooks, promos saisonnières
- Coach/Fitness : angle "agenda" — booking via contenu, avant/après, témoignages vidéo
- Coiffeur/Barbier : angle "confiance" — galerie réalisations, avis clients, prise de RDV
- Caviste/Fleuriste : angle "saison" — contenu saisonnier, événements, offres éphémères
- Freelance/Consultant : angle "expertise" — personal branding, portfolio, thought leadership
- Professionnel (avocat, médecin...) : angle "crédibilité" — image pro, contenu éducatif, confiance
- Agence/Studio : angle "productivité" — automatisation contenu clients, scaling sans embaucher
- PME/Startup : angle "marque" — communication corporate, marque employeur, visibilité

STRATÉGIE PAR STEP × TEMPÉRATURE :
Step 1 (premier contact) :
  - Cold : Question + valeur — "j'ai vu ton [commerce], t'as du potentiel mais..."
  - Warm (chatbot lead) : Référence à l'échange — "suite à ton message, voici ce que je peux faire..."

Step 2 (rapport 48h J+2) :
  - Montre la valeur déjà créée — "en 48h, LÉNA a déjà préparé X visuels pour toi..."
  - Si pas ouvert step 1 : Nouvel angle — change le sujet, essaie social proof
  - Si ouvert mais pas cliqué : Rappel doux + valeur ajoutée — "je sais que t'es occupé, mais regarde ce qu'on a fait..."

Step 3 (mi-parcours J+7) :
  - Stats semaine 1 — crée l'attachement avec des résultats concrets
  - Restaurant : "en 7 jours, 3 visuels publiés, +X vues" / Boutique : "tes produits en story ont eu X vues"
  - Coach : "ton personal branding prend forme" / Artisan : "tes photos avant/après cartonnent"
  - Montre les métriques réelles si disponibles

Step 4 (J-4 avant fin trial J+10) :
  - LE PLUS IMPORTANT — l'email qui convertit le plus
  - Bilan complet personnalisé : "Il te reste 4 jours. En 10 jours LÉNA a créé X visuels, JADE a envoyé Y DMs, tu as gagné Z abonnés"
  - Projection 90 jours : "si tu continues à ce rythme, dans 90 jours tu as +400 abonnés et une présence Instagram pro"
  - Urgence douce — "choisis ton plan avant [date]"
  - Les chiffres sont personnalisés depuis les vraies données du compte

Step 5 (dernier jour J+13) :
  - Urgence forte + offre spéciale
  - "C'est ton dernier jour d'accès complet à ton équipe IA"
  - Récapitulatif de tout ce qui a été fait pendant l'essai
  - Warm/Hot : Offre directe — choix du plan avec réduction early bird

PERSONNALISATION INTELLIGENTE :
- Si le prospect a un Instagram : "j'ai vu ton compte @xxx, t'as du bon contenu mais..."
- Si note Google haute (>4.0) : "4.5 sur Google c'est top, mais est-ce que ça se voit sur Insta ?"
- Si note Google basse (<3.5) : ne mentionne PAS la note, focus sur "montrer le vrai toi"
- Si prospect a un site web : "ton site est clean, il manque juste du contenu frais"
- Si prospect est un restaurant : ROI = couverts, si coach : ROI = clients bookés, si boutique : ROI = passage en magasin
- Si score >50 (chaud) : sois plus direct et propose un appel

STRUCTURE EMAIL PARFAIT (step 1) — DOIT ÊTRE NATUREL :
Exemple de bon email :
"Salut Marie,

Je suis tombé sur ton resto l'autre jour, franchement la carte a l'air top. Par contre sur Insta c'est un peu vide et je me suis dit que ça pouvait te coûter des couverts.

On a un outil qui génère des visuels pro de tes plats en 3 min, sans photographe. Quelques restaus dans ton coin l'utilisent déjà.

Tu veux que je te montre ce que ça donne ?

Hugo

P.S. Tu peux tester gratuitement, 3 visuels en 5 min : https://keiroai.com/generate"

Pas de bullet points, pas de stats forcées, pas de "saviez-vous que 72%...", juste une conversation naturelle entre deux personnes.

SIGNATURE — TU DOIS SIGNER "Hugo" à la fin (ou "Hugo ✌️" en step 3, "Hugo — KeiroAI" en step warm). Une seule fois, pas deux.

P.S. — Tu PEUX ajouter un P.S. si ça booste la conversion (essai gratuit, lien direct, urgence légère). Une seule P.S. max. Jamais deux P.S. dans le même email. Le P.S. doit être COURT et apporter de la valeur, pas être un slogan.

STEP 2 (relance douce, J+3) : "Je te relance vite fait..." + rappeler step 1 + social proof ("des restos comme toi utilisent déjà..."). Signe "Hugo".
STEP 3 (valeur gratuite, J+5) : Donne un conseil concret et actionnable sans rien demander en retour. Genre "3 astuces pour tes stories" ou "ton erreur #1 sur Insta". Pas de CTA vente, juste de la valeur. Signe "Hugo ✌️".
STEP 4 (FOMO concurrents, J+8) : "Tes concurrents postent déjà..." + montrer que le marché bouge + urgence naturelle + CTA direct
STEP 5 (dernière chance, J+12) : Ultra direct et désarmant. "Pas de souci si c'est pas le moment" + dernière proposition + "je te laisse tranquille après"
WARM (step 10) : "Suite à notre échange..." + très personnalisé + proposer essai gratuit 7 jours (carte requise, 0€ débité)

VÉRIFICATION BUSINESS OBLIGATOIRE :
- AVANT d'écrire l'email, vérifie que le nom du commerce EST CRÉDIBLE. Un nom inventé/hallucinated = INTERDIT.
- Si le nom de l'entreprise ne semble pas être un vrai commerce (trop générique, incomplet, bizarre), mets "skip": true dans le JSON.
- JAMAIS inventer un quartier ou arrondissement. Si le quartier est vide/null, n'en mentionne PAS dans l'email. Dis juste "ton resto" pas "ton resto du 9ème".
- Si le quartier est fourni, utilise-le UNIQUEMENT s'il est cohérent avec le nom du commerce. En cas de doute, ne le mentionne pas.
- JAMAIS dire "je suis tombé sur [company] en cherchant les meilleurs restos du [quartier]" si tu n'es pas SÛR que c'est le bon quartier.
- Alternative sans quartier : "Salut [prénom], je suis tombé sur [company]" tout court, ça suffit.

TON NATUREL — CRITÈRES ABSOLUS :
- L'email doit ressembler à un message envoyé par un VRAI humain, pas un robot. Comme si Hugo tapait le mail vite fait depuis son téléphone.
- JAMAIS de "?" en début de ligne. Une question commence par un sujet, pas par "?".
- JAMAIS de structure visible type "accroche / pain point / solution / CTA" — ça doit couler naturellement.
- Le texte doit être FLUIDE, comme une conversation. Pas de bullet points, pas de listes, pas de formatage.
- Ouverture selon le REGISTRE du prospect : "Salut [prénom]," en tutoiement, "Bonjour [prénom]," en vouvoiement. JAMAIS "Hey" ni "Cher".
- Le nom du commerce doit être utilisé comme on en parlerait à l'oral : "ton resto" (tu) / "votre resto" (vous), pas "Restaurant Le Soleil Paris 9ème".
- Si le nom du commerce est trop long ou formel, utilise une version courte naturelle.

INTERDICTIONS ABSOLUES :
- RESPECTE le registre indiqué pour CHAQUE prospect : tutoiement (tu/ton/ta) OU vouvoiement (vous/votre) selon sa fiche. Ne mélange JAMAIS les deux dans le même email.
- JAMAIS "n'hésitez pas" / "cher" / "cordialement" / "bien à vous" — même en vouvoiement, reste direct, humain et chaleureux, pas corporate.
- JAMAIS plus de 6 lignes de corps
- JAMAIS d'emoji dans l'objet (sauf ✌️ dans la signature)
- JAMAIS mentionner le prix dans le step 1 (sauf essai gratuit)
- JAMAIS de "?" en tout début de ligne (la question doit commencer par des mots)
- JAMAIS de nom de commerce qui sonne faux ou inventé — si le nom est bizarre, dis juste "ton commerce" ou "ton resto"
- Signature obligatoire : Hugo (UNE seule ligne, en fin d'email, sans "Cordialement" ni "Bien à toi" devant)
- P.S. autorisé MAIS UN SEUL — jamais deux P.S. dans le même mail. Optionnel sur step 1/2/3, recommandé sur step 4/5 pour pousser à la conversion.
- INTERDIT : signer "Oussama", "l'équipe KeiroAI", "L'équipe", "Cordialement Hugo", deux Hugo d'affilée, deux P.S. d'affilée

${learnings}

━━━ CONNAISSANCES AVANCÉES — COLD EMAIL MASTERY ━━━

DÉLIVRABILITÉ — CONFIGURATION DNS AVANCÉE :
- SPF + DKIM + DMARC p=reject est le MINIMUM en 2026. Gmail rejette activement les emails non conformes depuis novembre 2025.
- BIMI (Brand Indicators for Message Identification) : affiche le logo KeiroAI dans la boîte de réception. Nécessite un VMC (Verified Mark Certificate) + logo SVG. Booste l'open rate de 10-15% grâce à la confiance visuelle.
- MTA-STS (Mail Transfer Agent Strict Transport Security) : force le chiffrement TLS pour les emails en transit. Signal de confiance pour Gmail/Microsoft.
- Taux de plaintes spam : TOUJOURS < 0.1% (seuil critique). Au-dessus de 0.3% = risque de blacklist. UN SEUL signalement spam sur 1000 emails = problème.
- MAX 20 emails froids par boîte d'envoi par jour pour un domaine neuf. Après 4 semaines de warm-up, monter progressivement à 50/jour max.

ANTI-SPAM — TECHNIQUES DE VARIATION :
- Jamais envoyer 2 emails identiques. Chaque email DOIT avoir des variations uniques : ordre des phrases, synonymes, longueur, ponctuation.
- Spin syntax mental : pour chaque élément, avoir 3-4 variantes. Ex: "je suis tombé sur" / "j'ai découvert" / "j'ai vu" / "quelqu'un m'a parlé de". NE PAS utiliser des outils de spin automatique — l'IA DOIT créer du contenu unique organiquement.
- Éviter les trigger words spam : "gratuit", "offre", "promotion", "cliquez ici", "urgent", "dernière chance" dans le sujet. Dans le corps, acceptable avec parcimonie.
- Le ratio texte/HTML doit rester simple. Nos emails sont en texte quasi-pur avec signature HTML = parfait. Pas de gros blocs HTML, pas d'images dans le corps.
- Varier les heures d'envoi : pas tous les emails à 8h00 pile. Répartir entre 7h-10h et 14h-16h avec un décalage aléatoire de 1-15 minutes.

A/B TESTING — MÉTHODOLOGIE AVEC PETITS ÉCHANTILLONS :
- Avec < 250 contacts par variante, les résultats ne sont PAS statistiquement significatifs. MAIS on peut quand même apprendre en combinant plusieurs signaux.
- Métrique primaire : taux de RÉPONSE (pas l'open rate qui est biaisé par le tracking pixel). Un sujet qui génère des réponses > un sujet qui génère des ouvertures.
- Durée minimale d'un test : 48h pour les ouvertures, 5-7 jours pour les réponses. Ne JAMAIS conclure en < 48h.
- Tester UN SEUL élément à la fois : sujet OU corps OU CTA OU timing. Jamais 2 éléments en même temps.
- Avec 50-100 contacts : observer la TENDANCE, pas le résultat absolu. 3 réponses vs 0 sur 50 contacts = signal fort même si pas "significatif" statistiquement.
- Règle du "3x" : déclarer un gagnant seulement si une variante fait 3x mieux que l'autre. Ex: 6% réponse vs 2% = gagnant. 3% vs 2% = pas conclusif.

INBOX PLACEMENT vs DELIVERY RATE :
- Delivery rate = "l'email est arrivé quelque part" (boîte de réception OU spam). Viser 98%+.
- Inbox placement = "l'email est arrivé dans la boîte de réception principale" (pas spam, pas promotions). Viser 85%+.
- Un delivery rate de 98% avec un inbox placement de 40% = CATASTROPHE silencieuse. Les emails "arrivent" mais personne ne les voit.
- Pour maximiser l'inbox placement : les RÉPONSES sont le signal #1. Un email qui reçoit des réponses = Gmail le met en boîte principale. D'où l'importance des questions ouvertes dans nos emails.
- Warm-up moderne : ce n'est plus juste "envoyer progressivement plus". Il faut des ouvertures, des réponses, des "mark as important". Les outils de warm-up simulent ces interactions positives.

RÉCUPÉRATION DE RÉPUTATION DE DOMAINE :
- Si le domaine keiroai.com est blacklisté ou en mauvaise réputation : NE PAS insister. Acheter un domaine secondaire (ex: keiroai.fr, keiromail.com) et le warm-up pendant 2-4 semaines.
- Le warm-up prend 2-4 semaines minimum. Commencer avec 5 emails/jour à des contacts connus (qui répondront), puis monter de 5/jour par semaine.
- Signaux positifs à générer pendant le warm-up : ouvertures > 50%, réponses > 20%, "mark as important", déplacement de spam vers inbox.
- Si la réputation est irrécupérable (historique de spam, blacklists multiples), il est PLUS EFFICACE de repartir sur un nouveau domaine que de tenter de récupérer.
- Checker la réputation : Google Postmaster Tools (gratuit), MXToolbox, mail-tester.com (score /10, viser > 8).

RGPD — CE QUI EST RÉELLEMENT AUTORISÉ EN B2B FRANCE :
- Le cold email B2B est LÉGAL en France sous le RGPD. Base légale = intérêt légitime (pas besoin de consentement préalable pour du B2B).
- CONDITION : l'email doit être une adresse PROFESSIONNELLE (contact@entreprise.com, prenom@entreprise.com). Les adresses perso (gmail, hotmail) d'un professionnel = zone grise, à éviter en cold.
- OBLIGATION : lien de désinscription fonctionnel en 1 clic dans CHAQUE email. Pas de justification demandée, pas de "êtes-vous sûr ?".
- OBLIGATION : pouvoir justifier l'ORIGINE de chaque contact. "Trouvé sur Google Maps" = valide. "Acheté une liste" = risqué. Documenter la source dans le CRM.
- Le B2C bascule en opt-in strict le 11 août 2026. Le B2B reste en intérêt légitime. Mais si un prospect est un auto-entrepreneur (B2C/B2B hybride), traiter comme B2B si l'email est pro.
- Sanctions CNIL : jusqu'à 20M€ ou 4% du CA. En pratique, les PME reçoivent d'abord un avertissement. Mais un signalement de prospect = enquête potentielle.
- CONSEIL : dans chaque email, une phrase type "Je te contacte car j'ai vu [source] et je pense que KeiroAI peut t'aider" = justification de l'intérêt légitime.
- MAX 3 emails de prospection par prospect (notre règle actuelle = conforme). Au-delà de 3 relances non sollicitées = harcèlement commercial.

CONSIGNE : Pour chaque prospect, génère un email UNIQUE et personnalisé.
Réponds en JSON — un tableau d'objets, un par prospect :
[
  {
    "id": "prospect_id",
    "subject": "Objet percutant < 50 chars — PAS de emoji",
    "body": "Corps du mail 4-6 lignes tutoiement",
    "skip": false
  }
]
Si le nom du commerce est douteux/introuvable/incohérent, mets "skip": true et "reason": "explication".

UNIQUEMENT du JSON valide, pas de markdown, pas d'explication.${directivesBlock}${learningsBlock}`,
      message: prospectList,
      maxTokens: 3000,
    });

    // Parse JSON array (strip markdown fences if present)
    const cleanText = rawText.replace(/```[\w]*\s*/g, '').trim();
    let emails: any[] = [];

    // Try full array match first
    const fullMatch = cleanText.match(/\[[\s\S]*\]/);
    if (fullMatch) {
      try {
        emails = JSON.parse(fullMatch[0]);
      } catch {
        // Full match failed, try extracting individual objects
      }
    }

    // Salvage: extract all complete JSON objects from truncated array
    if (emails.length === 0) {
      const objectRegex = /\{\s*"id"\s*:\s*"[^"]+"\s*,\s*"subject"\s*:\s*"[^"]*"\s*,\s*"body"\s*:\s*"[^"]*"\s*\}/g;
      const objects = cleanText.match(objectRegex);
      if (objects && objects.length > 0) {
        for (const obj of objects) {
          try {
            emails.push(JSON.parse(obj));
          } catch { /* skip malformed */ }
        }
        console.log(`[EmailDaily] AI batch: salvaged ${emails.length} complete emails from truncated JSON`);
      }
    }

    // Last resort: try to extract objects with newlines in body (common with Gemini)
    if (emails.length === 0) {
      try {
        // Find all id+subject pairs and extract what we can
        const idSubjectRegex = /"id"\s*:\s*"([^"]+)"\s*,\s*"subject"\s*:\s*"([^"]*)"\s*,\s*"body"\s*:\s*"([\s\S]*?)(?:"\s*\}|$)/g;
        let m;
        while ((m = idSubjectRegex.exec(cleanText)) !== null) {
          const body = m[3].replace(/\n/g, '\\n').replace(/"/g, '\\"');
          emails.push({ id: m[1], subject: m[2], body: m[3].replace(/\\n/g, '\n') });
        }
        if (emails.length > 0) {
          console.log(`[EmailDaily] AI batch: regex-extracted ${emails.length} emails`);
        }
      } catch { /* regex extraction failed */ }
    }

    if (emails.length === 0) {
      console.warn('[EmailDaily] AI batch: no emails extracted, raw:', cleanText.substring(0, 400));
      return results;
    }
    for (const email of emails) {
      if (!email.id || !email.subject || !email.body) continue;
      // Skip emails flagged by AI as incoherent/suspicious business
      if (email.skip) {
        console.log(`[EmailDaily] AI skipped prospect ${email.id}: ${email.reason || 'business incoherent'}`);
        continue;
      }

      // Build HTML version
      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f4f7;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#fff;padding:24px 20px;border:1px solid #e5e7eb;border-radius:8px;">
${email.body.split('\n').map((line: string) => {
  // 2026-06-25 (bug founder : du HTML brut '<p style=...>Hugo' s'affichait +
  // un '<' littéral cassait le rendu). Le corps DOIT être du texte : on retire
  // toute balise que l'IA aurait pu produire, PUIS on échappe les <>& restants.
  const clean = String(line || '')
    .replace(/<\/?[a-z][^>]*>/gi, '')      // strip toute balise HTML émise par l'IA
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .trim();
  return clean ? `<p style="margin:8px 0;">${clean}</p>` : '';
}).join('')}
<p style="margin:20px 0;text-align:center;"><a href="https://keiroai.com/generate" style="display:inline-block;background:linear-gradient(to right,#0c1a3a,#1e3a5f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px;">Découvrir KeiroAI</a></p>
<p style="margin:14px 0;font-size:13px;color:#6b7280;border-left:3px solid #0c1a3a;padding-left:12px;">+200 entrepreneurs utilisent KeiroAI pour leur marketing.</p>
</div>
<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">
<a href="https://keiroai.com" style="color:#0c1a3a;text-decoration:none;">keiroai.com</a> · <a href="https://keiroai.com/unsubscribe" style="color:#c0c0c0;">Se désinscrire</a>
</div></div></body></html>`;

      results.set(email.id, {
        subject: email.subject,
        textBody: email.body,
        htmlBody,
      });
    }

    console.log(`[EmailDaily] AI generated ${results.size}/${prospects.length} emails`);
  } catch (error: any) {
    console.error('[EmailDaily] AI batch generation failed:', error.message);
  }

  return results;
}

/**
 * Auto-learn from email performance.
 * Called at the end of each run to save insights.
 * Tracks: open/click/reply rates, best categories, best subject patterns, best steps.
 */
async function autoLearn(results: SendResult[], supabase: any, orgId: string | null = null, clientUserId: string | null = null) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get engagement data + email subjects for correlation
  const { data: recentActivity } = await supabase
    .from('crm_activities')
    .select('prospect_id, type, data')
    .in('type', ['email_opened', 'email_clicked', 'email_replied', 'email'])
    .gte('created_at', oneWeekAgo)
    .limit(100);

  if (!recentActivity || recentActivity.length === 0) return;

  const emailsSent = recentActivity.filter((a: any) => a.type === 'email');
  const opens = recentActivity.filter((a: any) => a.type === 'email_opened');
  const clicks = recentActivity.filter((a: any) => a.type === 'email_clicked');
  const replies = recentActivity.filter((a: any) => a.type === 'email_replied');

  // Auto-update prospect scores on engagement
  for (const reply of replies) {
    if (reply.prospect_id) {
      const { data: prospect } = await supabase
        .from('crm_prospects')
        .select('score, temperature, status')
        .eq('id', reply.prospect_id)
        .single();
      if (prospect && prospect.status !== 'client') {
        await supabase.from('crm_prospects').update({
          status: 'repondu',
          temperature: 'hot',
          score: Math.min(100, (prospect.score || 0) + 50),
          updated_at: new Date().toISOString(),
        }).eq('id', reply.prospect_id);

        // Notify client: prospect has replied!
        if (clientUserId) {
          try {
            const { notifyClient } = await import('@/lib/agents/notify-client');
            const replyData = reply.data as any;
            await notifyClient(supabase, {
              userId: clientUserId,
              agent: 'email',
              type: 'action',
              title: `Prospect a répondu ! Reprends la main`,
              message: `${replyData?.company || 'Un prospect'} a répondu à ton email. C'est le moment de closer ! Ouvre ta boîte mail pour continuer la conversation.`,
              data: { prospect_id: reply.prospect_id, action: 'reply_received' },
            });
          } catch {}
        }
      }
    }
  }
  for (const click of clicks) {
    if (click.prospect_id) {
      const { data: prospect } = await supabase
        .from('crm_prospects')
        .select('score, temperature')
        .eq('id', click.prospect_id)
        .single();
      if (prospect && (prospect.temperature === 'cold' || !prospect.temperature)) {
        await supabase.from('crm_prospects').update({
          temperature: 'warm',
          score: Math.min(100, (prospect.score || 0) + 25),
          updated_at: new Date().toISOString(),
        }).eq('id', click.prospect_id);
      }
    }
  }

  // Analyze by category
  const byCategory: Record<string, { sent: number; opens: number; clicks: number; replies: number }> = {};
  for (const email of emailsSent) {
    const cat = email.data?.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { sent: 0, opens: 0, clicks: 0, replies: 0 };
    byCategory[cat].sent++;
  }
  for (const activity of [...opens, ...clicks, ...replies]) {
    const cat = activity.data?.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { sent: 0, opens: 0, clicks: 0, replies: 0 };
    if (activity.type === 'email_opened') byCategory[cat].opens++;
    if (activity.type === 'email_clicked') byCategory[cat].clicks++;
    if (activity.type === 'email_replied') byCategory[cat].replies++;
  }

  // Analyze by step
  const byStep: Record<number, { sent: number; opens: number; clicks: number }> = {};
  for (const email of emailsSent) {
    const step = email.data?.step || 1;
    if (!byStep[step]) byStep[step] = { sent: 0, opens: 0, clicks: 0 };
    byStep[step].sent++;
  }
  for (const activity of [...opens, ...clicks]) {
    const step = activity.data?.step || 1;
    if (!byStep[step]) byStep[step] = { sent: 0, opens: 0, clicks: 0 };
    if (activity.type === 'email_opened') byStep[step].opens++;
    if (activity.type === 'email_clicked') byStep[step].clicks++;
  }

  // 2026-06-23 — Apprentissage par FEATURE D'OBJET (founder: "identifier ce qui
  // fait ouvrir"). Corrèle les caractéristiques de l'objet (longueur, question,
  // chiffre) avec l'ouverture réelle → saveLearning (RAG) → ré-injecté dans le
  // prompt de Hugo. Boucle d'amélioration continue du taux d'ouverture.
  try {
    const openedIds = new Set(opens.map((o: any) => o.prospect_id).filter(Boolean));
    const feats: Record<string, { sent: number; open: number }> = {
      'objet court (≤40 car.)': { sent: 0, open: 0 },
      'objet avec une question (?)': { sent: 0, open: 0 },
      'objet avec un chiffre': { sent: 0, open: 0 },
      'objet long (>55 car.)': { sent: 0, open: 0 },
    };
    for (const e of emailsSent) {
      const subj = String(e.data?.subject || ''); if (!subj) continue;
      const opened = openedIds.has(e.prospect_id);
      const bump = (k: string) => { feats[k].sent++; if (opened) feats[k].open++; };
      if (subj.length <= 40) bump('objet court (≤40 car.)');
      if (subj.length > 55) bump('objet long (>55 car.)');
      if (subj.includes('?')) bump('objet avec une question (?)');
      if (/\d/.test(subj)) bump('objet avec un chiffre');
    }
    const insights = Object.entries(feats).filter(([, d]) => d.sent >= 5).map(([k, d]) => ({ k, or: d.open / d.sent, sent: d.sent }));
    if (insights.length >= 2) {
      insights.sort((a, b) => b.or - a.or);
      const best = insights[0], worst = insights[insights.length - 1];
      if (best.or - worst.or >= 0.05) {
        await saveLearning(supabase, {
          agent: 'email', category: 'email',
          learning: `Objets qui OUVRENT le mieux : "${best.k}" (taux d'ouverture ${(best.or * 100).toFixed(0)}%) vs "${worst.k}" (${(worst.or * 100).toFixed(0)}%). Privilégier "${best.k}" pour maximiser l'ouverture.`,
          evidence: `${emailsSent.length} envois analysés sur 7j. ${best.k}: ${best.sent} env. ${worst.k}: ${worst.sent} env.`,
          confidence: Math.min(80, 40 + best.sent * 2),
        }, orgId);
      }
    }
  } catch { /* feature-learning best-effort */ }

  const bestCategory = Object.entries(byCategory)
    .sort((a, b) => (b[1].clicks + b[1].opens + b[1].replies * 3) - (a[1].clicks + a[1].opens + a[1].replies * 3))[0];

  const bestStep = Object.entries(byStep)
    .sort((a, b) => (b[1].clicks + b[1].opens) - (a[1].clicks + a[1].opens))[0];

  if (bestCategory) {
    // Build rich performance summary
    const totalSent = emailsSent.length;
    const openRate = totalSent > 0 ? (opens.length / totalSent * 100).toFixed(1) : '0';
    const clickRate = opens.length > 0 ? (clicks.length / opens.length * 100).toFixed(1) : '0';
    const replyRate = totalSent > 0 ? (replies.length / totalSent * 100).toFixed(1) : '0';

    const categoryBreakdown = Object.entries(byCategory)
      .map(([cat, d]) => `${cat}: ${d.sent} envoyés, ${d.opens} ouverts, ${d.clicks} clics, ${d.replies} réponses`)
      .join(' | ');

    const stepBreakdown = Object.entries(byStep)
      .map(([step, d]) => `Step ${step}: ${d.sent} envoyés, ${d.opens} ouverts, ${d.clicks} clics`)
      .join(' | ');

    const learning = `Semaine du ${new Date().toLocaleDateString('fr-FR')}: ${totalSent} envoyés, ${opens.length} ouverts (OR=${openRate}%), ${clicks.length} clics (CTR=${clickRate}% sur ouverts), ${replies.length} réponses (${replyRate}%). Meilleure catégorie: ${bestCategory[0]}. Meilleur step: ${bestStep?.[0] || '?'}. Détail: ${categoryBreakdown}. Steps: ${stepBreakdown}`;

    // 2026-06-03 — Removed legacy memory log (was 201 rows/month polluting
    // the "useful actions" ratio without serving any consumer). The learning
    // is now persisted in the structured knowledge_rag below.
    void learning;

    // ── STRUCTURED LEARNINGS (new system) ──
    // 1. Best category insight
    const sortedCats = Object.entries(byCategory)
      .filter(([, d]) => d.sent >= 3)
      .sort((a, b) => {
        const scoreA = a[1].replies * 5 + a[1].clicks * 2 + a[1].opens;
        const scoreB = b[1].replies * 5 + b[1].clicks * 2 + b[1].opens;
        return scoreB - scoreA;
      });

    if (sortedCats.length >= 2) {
      const best = sortedCats[0];
      const worst = sortedCats[sortedCats.length - 1];
      const bestOR = best[1].sent > 0 ? (best[1].opens / best[1].sent * 100).toFixed(0) : '0';
      const worstOR = worst[1].sent > 0 ? (worst[1].opens / worst[1].sent * 100).toFixed(0) : '0';

      await saveLearning(supabase, {
        agent: 'email',
        category: 'email',
        learning: `Les ${best[0]} répondent le mieux (OR ${bestOR}%, ${best[1].replies} réponses). Prioriser cette catégorie. Les ${worst[0]} performent moins bien (OR ${worstOR}%).`,
        evidence: `${totalSent} emails analysés sur 7j. ${best[0]}: ${best[1].sent} envoyés, ${best[1].opens} ouverts, ${best[1].clicks} clics, ${best[1].replies} rép. ${worst[0]}: ${worst[1].sent} envoyés, ${worst[1].opens} ouverts.`,
        confidence: Math.min(85, 40 + totalSent * 2),
        revenue_linked: best[1].replies > 0,
      }, orgId);
    }

    // 2. Best step insight
    const sortedSteps = Object.entries(byStep)
      .filter(([, d]) => d.sent >= 3)
      .sort((a, b) => {
        const scoreA = a[1].clicks * 2 + a[1].opens;
        const scoreB = b[1].clicks * 2 + b[1].opens;
        return scoreB - scoreA;
      });

    if (sortedSteps.length >= 2) {
      const bestS = sortedSteps[0];
      const bestSOR = bestS[1].sent > 0 ? (bestS[1].opens / bestS[1].sent * 100).toFixed(0) : '0';

      await saveLearning(supabase, {
        agent: 'email',
        category: 'email',
        learning: `Step ${bestS[0]} a le meilleur taux d'ouverture (${bestSOR}%). Adapter le ton des autres steps en conséquence.`,
        evidence: `Step ${bestS[0]}: ${bestS[1].sent} envoyés, ${bestS[1].opens} ouverts, ${bestS[1].clicks} clics sur 7j.`,
        confidence: Math.min(80, 35 + totalSent),
      }, orgId);
    }

    // 3. Open rate trend insight
    const orNum = parseFloat(openRate);
    if (totalSent >= 10) {
      if (orNum >= 30) {
        await saveLearning(supabase, {
          agent: 'email',
          category: 'email',
          learning: `Taux d'ouverture excellent (${openRate}%). Les objets actuels fonctionnent bien, continuer dans cette direction.`,
          evidence: `${totalSent} emails, ${opens.length} ouvertures, OR=${openRate}% sur 7j.`,
          confidence: Math.min(90, 50 + Math.round(orNum)),
        }, orgId);
      } else if (orNum < 15) {
        await saveLearning(supabase, {
          agent: 'email',
          category: 'email',
          learning: `Taux d'ouverture faible (${openRate}%). Il faut tester des objets plus courts, plus directs, avec une question ou le prénom du prospect.`,
          evidence: `${totalSent} emails, seulement ${opens.length} ouvertures sur 7j. Action: changer la stratégie d'objets.`,
          confidence: Math.min(85, 45 + totalSent),
        }, orgId);
      }
    }

    // 4. Reply detection — what triggered responses
    if (replies.length > 0) {
      const repliedProspectTypes = replies
        .map((r: any) => r.data?.category)
        .filter(Boolean);
      const topReplyType = repliedProspectTypes.length > 0
        ? repliedProspectTypes.sort((a: string, b: string) =>
            repliedProspectTypes.filter((v: string) => v === b).length -
            repliedProspectTypes.filter((v: string) => v === a).length
          )[0]
        : null;

      if (topReplyType) {
        await saveLearning(supabase, {
          agent: 'email',
          category: 'conversion',
          learning: `Les ${topReplyType} répondent le plus aux emails (${replies.length} réponses cette semaine). Concentrer les efforts de prospection sur ce type.`,
          evidence: `${replies.length} réponses reçues sur 7j, majoritairement des ${topReplyType}.`,
          confidence: Math.min(90, 50 + replies.length * 10),
          revenue_linked: true, // replies = direct conversion signal
        }, orgId);
      }
    }

    console.log(`[EmailDaily] Auto-learning: ${openRate}% open, ${clickRate}% click, ${replyRate}% reply. Best: ${bestCategory[0]}. ${sortedCats.length >= 2 ? 'Structured learnings saved.' : ''}`);
  }
}

/**
 * Send a single email via Gmail API (client's own) > Brevo > Resend fallback.
 */
async function sendEmail(
  prospect: any,
  step: number,
  template: { subject: string; htmlBody: string; textBody: string },
  category: string,
  clientUserId?: string | null,
): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }> {
  try {
    // Final safety checks
    if (template.textBody.includes('{{') || template.subject.includes('{{')) {
      return { success: false, error: 'Unresolved template variables' };
    }
    if (template.textBody.includes('Oussama') || template.htmlBody.includes('Oussama')) {
      template.textBody = template.textBody.replace(/Oussama/g, 'Hugo');
      template.htmlBody = template.htmlBody.replace(/Oussama/g, 'Hugo');
    }

    // ── Personalized visual (Hugo + Léna) ─────────────────────────
    // When the prospect is verified AND the fiche is rich enough,
    // generate a contextual visual via Seedream and inject it into
    // the HTML body. Founder ask 2026-05-24 with reinforcement: ZERO
    // tolerance for low-quality. We only fire when we're confident
    // the visual will actually be on-brand for this prospect.
    //
    // QUALITY GATES (all must pass — no exceptions):
    //   1. prospect.verified === true (Léo or commercial cleared it)
    //   2. completeness ≥ 70% (was 60% — bumped for quality bar)
    //   3. type is a known business category (not 'pme' / 'services')
    //   4. company name looks real (not generic / placeholder)
    //   5. step is 1 or 4 (high-conversion moments)
    //   6. brief construction succeeded (returns null otherwise)
    //
    // Skip silently if any gate fails so the email still ships.
    try {
      // Field completeness — type-aware via shared helper (so a resto
      // isn't penalised for missing LinkedIn). Founder ask 2026-05-27.
      const { completeness: fiCompleteness, PERSONALIZED_VISUAL_THRESHOLD } = await import('@/lib/agents/fiche-completeness');
      void PERSONALIZED_VISUAL_THRESHOLD;
      const compResult = fiCompleteness(prospect);
      const completePct = compResult.pct;

      // Gate 3 — type must be a concrete category for which we can build
      // a credible visual brief. Generic types like 'pme' or 'services'
      // are skipped because we'd produce a generic stock visual.
      const VISUAL_READY_TYPES = new Set([
        'restaurant', 'boutique', 'coach', 'coiffeur', 'barbier',
        'fleuriste', 'caviste', 'salon_beaute', 'salon_de_beaute',
        'traiteur', 'photographe', 'hotel', 'bar', 'brasserie',
        'patisserie', 'boulangerie', 'fromagerie',
      ]);
      const typeKey = (prospect.type || '').toString().toLowerCase().replace(/[\s-]/g, '_');
      const typeIsReady = VISUAL_READY_TYPES.has(typeKey);

      // Gate 4 — company name sanity check: not empty, not a single word
      // generic placeholder, has at least 3 characters.
      const company = (prospect.company || '').toString().trim();
      const companyLooksReal = company.length >= 3
        && !/^(prospect|test|inconnu|n\/a|tbd|sans nom)$/i.test(company)
        && !/^[a-z]+$/i.test(company); // single lowercase word feels like placeholder

      const visualEligible =
        prospect.verified === true &&
        (step === 1 || step === 4) &&
        completePct >= 70 &&
        typeIsReady &&
        companyLooksReal &&
        !template.htmlBody.includes('<img');

      if (visualEligible) {
        // Business-type-specific visual cues. Each category has its own
        // composition, lighting, and props that read as "for THIS niche"
        // instead of stock. Founder bar: "super bien comprendre le business
        // du client pour lui presenter en exemple super quali".
        const TYPE_CUES: Record<string, string> = {
          restaurant: 'Hero plate shot, warm tungsten lighting, dark wood table, herb garnish, shallow depth of field. Editorial food photography style.',
          brasserie: 'Hero plate shot, warm tungsten lighting, dark wood table, herb garnish, shallow depth of field. Editorial food photography style.',
          bar: 'Cocktail close-up, condensation on glass, moody backlight with bokeh, deep blacks. Editorial drink photography.',
          hotel: 'Suite interior, golden hour light through large windows, layered textiles, cinematic warm tones. Architectural digest style.',
          boutique: 'Curated product flat-lay on neutral background, soft daylight, premium materials in focus, careful negative space.',
          coach: 'Action shot of a coach mid-session, soft afternoon light, athletic but warm aesthetic, motivational not aggressive.',
          coiffeur: 'Salon interior detail, mirror reflection, soft daylight, premium scissors or product close-up, editorial beauty.',
          barbier: 'Vintage barbershop interior, leather chair detail, warm tungsten light, craftsman aesthetic.',
          fleuriste: 'Seasonal bouquet on linen table, soft morning light, watercolor palette, slightly out-of-focus background.',
          caviste: 'Bottle on dark wood with subtle backlight, condensation droplets, focused label visible but readable as abstract.',
          salon_beaute: 'Spa detail shot, white linen, eucalyptus branch, candle, soft morning light. Calm editorial.',
          salon_de_beaute: 'Spa detail shot, white linen, eucalyptus branch, candle, soft morning light. Calm editorial.',
          traiteur: 'Plated catering tableau, candlelight, layered textures, elegant restaurant lighting on a buffet detail.',
          photographe: 'Behind-the-camera lifestyle shot, camera body close-up, soft window light, photographer\'s hands in frame.',
          patisserie: 'Pastry display close-up, soft pink and gold tones, condensation on glass case, mouth-watering hero shot.',
          boulangerie: 'Bread loaves on dark slate, golden crust catching light, flour dust in beam, artisan bakery interior.',
          fromagerie: 'Cheese board flat-lay on slate, dramatic side-lighting, varied textures, knife and walnuts as props.',
        };

        const typeCue = TYPE_CUES[typeKey] || `Editorial moodboard appropriate for a ${prospect.type}.`;
        const quartierBit = prospect.quartier ? ` Set in ${prospect.quartier} (subtle local cue, not literal).` : '';
        const ratingBit = (prospect.note_google ?? 0) >= 4.3 ? ' Premium aesthetic (high Google rating).' : '';

        // Super-personalised cues from the scraped business_notes
        // (website / Instagram bio / ambiance keywords). Founder ask
        // 2026-05-27: use the notes to enrich the visual brief so the
        // example feels truly built FOR this prospect, not generic.
        let notesCue = '';
        try {
          const { notesToPromptBlock } = await import('@/lib/agents/prospect-scraper');
          const promptBlock = notesToPromptBlock((prospect as any).business_notes);
          if (promptBlock) {
            // Translate the most useful lines into visual cues
            const bn: any = (prospect as any).business_notes || {};
            const ambianceWords = (bn.ambiance || []).join(', ');
            const audienceLine = bn.audience || '';
            const bioOrPitch = (bn.insta_bio || bn.website_description || '').slice(0, 160);
            const cues: string[] = [];
            if (ambianceWords) cues.push(`Match the brand's own aesthetic: ${ambianceWords}.`);
            if (audienceLine) cues.push(`Aimed at ${audienceLine}.`);
            if (bioOrPitch) cues.push(`Brand voice context: "${bioOrPitch}".`);
            if (cues.length) notesCue = ' ' + cues.join(' ');
          }
        } catch { /* notes optional */ }

        // Single-paragraph brief — keeps Seedream focused on the cue
        // rather than diluting across stock filler.
        const visualBrief = `${typeCue}${quartierBit}${ratingBit}${notesCue} Magazine-quality, scroll-stopping Instagram post the brand owner would actually share. Format: 4:5 portrait.`;

        const { generateJadeImage } = await import('@/lib/visuals/jade-prompter');
        // 15s hard timeout — if Seedream is slow, ship the email without
        // the visual rather than delay the daily send slot.
        const visualUrl = await Promise.race<string | null>([
          generateJadeImage(visualBrief, 'post', prospect.user_id || undefined),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 15000)),
        ]);

        if (visualUrl) {
          const altText = `Aperçu visuel généré pour ${company}`;
          const visualBlock = `<div style="margin:14px 0;text-align:center;"><img src="${visualUrl}" alt="${altText}" style="max-width:100%;border-radius:10px;border:1px solid #e5e7eb;" /><div style="font-size:11px;color:#9ca3af;margin-top:4px;font-style:italic;">Aperçu généré spécifiquement pour ${company} — sans photographe, en 3 minutes</div></div>`;
          if (/<p[^>]*>/i.test(template.htmlBody)) {
            template.htmlBody = template.htmlBody.replace(/(<\/p>)/i, `$1${visualBlock}`);
          } else {
            template.htmlBody = visualBlock + template.htmlBody;
          }
          // Audit log so we can review the quality bar later
          try {
            const auditSb = getSupabaseAdmin();
            await auditSb.from('agent_logs').insert({
              agent: 'email',
              action: 'visual_attached',
              status: 'success',
              user_id: prospect.user_id || null,
              data: {
                prospect_id: prospect.id,
                step,
                completeness_pct: completePct,
                type: typeKey,
                visual_url: visualUrl,
              },
              created_at: new Date().toISOString(),
            });
          } catch { /* audit non-fatal */ }
        }
      }
    } catch { /* visual generation is best-effort */ }
    // Clean up formatting issues
    for (const key of ['textBody', 'htmlBody'] as const) {
      let t = template[key];
      t = t.replace(/^\s*\?\s*/gm, ''); // Remove orphan "?" at start of lines
      t = t.replace(/^Bonjour\s/gm, 'Salut '); // Consistent greeting
      t = t.replace(/\s+\./g, '.'); // Fix "word ." → "word."
      t = t.replace(/\s+,/g, ','); // Fix "word ," → "word,"
      t = t.replace(/\s+!/g, ' !'); // French spacing before !
      t = t.replace(/\s+\?/g, ' ?'); // French spacing before ?
      t = t.replace(/\.\s*\.\s*\./g, '...'); // Fix ". . ." → "..."
      t = t.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
      t = t.replace(/^\s+$/gm, ''); // Remove whitespace-only lines
      t = t.replace(/^\s*,\s*$/gm, ''); // Remove orphan comma lines (empty first_name)
      t = t.replace(/(?:Salut|Bonjour)\s+,/g, 'Bonjour,'); // "Salut ," → "Bonjour,"
      t = t.replace(/([.!?])\s*\n\s*([a-zà-ü])/g, '$1\n\n$2'); // Ensure paragraph breaks
      template[key] = t;
    }

    // ── Hugo signature + P.S. — DEDUP, don't strip ──
    // The AI is now allowed (and required) to sign as Hugo and to
    // include an optional P.S. The role of this block is to:
    //   1. Remove duplicates if the AI somehow wrote 2 Hugo lines or 2 P.S.
    //   2. Ensure a clickable keiroai.com/generate link exists somewhere
    //      (text body) — if not, append a single discrete P.S. with it.
    // We DO NOT strip what the AI wrote anymore — it's a real human
    // signature now, with conversion P.S. when relevant.
    const signatureUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com';
    const cleanUrl = signatureUrl.replace(/^https?:\/\//, '');

    // TEXT body dedup — collapse multiple Hugo lines into one
    template.textBody = template.textBody.replace(
      /(\n\s*Hugo[^\n]*\n)([\s\S]*?)(\n\s*Hugo[^\n]*\n)/gi,
      '$1$2',
    );
    // TEXT body dedup — collapse multiple P.S. lines into the first one
    {
      const psMatches = [...template.textBody.matchAll(/(\n\s*P\.?\s*S\.?[^\n]*)/gi)];
      if (psMatches.length > 1) {
        const first = psMatches[0][0];
        // Strip all P.S. lines then re-append only the first
        template.textBody = template.textBody.replace(/\n\s*P\.?\s*S\.?[^\n]*/gi, '').trimEnd() + first;
      }
    }
    // If no link to keiroai.com anywhere, append a single discrete P.S.
    // after the Hugo line. Never adds a second P.S. — only when none.
    if (!/keiroai\.(com|fr|io)/i.test(template.textBody)) {
      if (/\bP\.?\s*S\.?\b/i.test(template.textBody)) {
        // Author wrote a P.S. but no link — append link to it inline.
        template.textBody = template.textBody.replace(
          /(\bP\.?\s*S\.?\b[^\n]*)/i,
          `$1 — ${signatureUrl}/generate`,
        );
      } else {
        template.textBody = template.textBody.trimEnd() + `\n\nP.S. Tu peux tester gratuitement : ${signatureUrl}/generate`;
      }
    }
    // TEXT body: also strip any "Hugo de KeiroAI" duplicates that came
    // from older prompt examples to avoid two Hugos back-to-back.
    template.textBody = template.textBody.replace(
      /(\n\s*Hugo[^\n]*\n+)\s*Hugo[^\n]*\n?/gi,
      '$1',
    );

    // HTML body — same dedup logic.
    if (template.htmlBody) {
      // Remove a duplicated "Hugo" line if the AI emitted two
      template.htmlBody = template.htmlBody.replace(
        /(Hugo[^<\n]{0,40}(?:<br\s*\/?>|<\/p>|<\/div>)\s*)(.*?)(Hugo[^<\n]{0,40}(?:<br\s*\/?>|<\/p>|<\/div>))/i,
        '$1$2',
      );
      // Collapse multiple P.S. lines
      const psHtmlMatches = [...template.htmlBody.matchAll(/(P\.?\s*S\.?\.?\s*[^<]{0,200}(?=<|$))/gi)];
      if (psHtmlMatches.length > 1) {
        const first = psHtmlMatches[0][0];
        template.htmlBody = template.htmlBody.replace(/P\.?\s*S\.?\.?\s*[^<]{0,200}(?=<|$)/gi, '');
        template.htmlBody = template.htmlBody + `<br><br><span style="color:#555;">${first}</span>`;
      }
      // Wrap bare keiroai URLs into clickable links so the prospect can
      // click (Gmail auto-links, but Outlook/Apple don't always).
      template.htmlBody = template.htmlBody.replace(
        /(?<!href=["'])(https?:\/\/(?:www\.)?keiroai\.(?:com|fr|io)[^\s<"']*)/g,
        '<a href="$1" style="color:#7c3aed;text-decoration:underline">$1</a>',
      );
      // If no link present at all, append a discrete signature P.S.
      if (!/href=["'][^"']*keiroai\.(com|fr|io)/i.test(template.htmlBody)) {
        const htmlSig = `<br><br><span style="color:#555;">P.S. Tu peux tester gratuitement : <a href="${signatureUrl}/generate" style="color:#7c3aed;text-decoration:underline">${cleanUrl}/generate</a></span>`;
        if (/<\/body>/i.test(template.htmlBody)) {
          template.htmlBody = template.htmlBody.replace(/<\/body>/i, `${htmlSig}</body>`);
        } else {
          template.htmlBody = template.htmlBody + htmlSig;
        }
      }
    }

    // Business coherence: if quartier is empty but email mentions a specific quartier, strip it
    if (!prospect.quartier) {
      // Remove phrases like "du Opéra", "du 9ème", "du Marais" if quartier wasn't in CRM
      const quartierRegex = /\b(du|de|dans le|au|des)\s+(Opéra|Marais|Bastille|Montmartre|Belleville|Pigalle|Batignolles|Oberkampf|République|Nation|Châtelet|Saint-Germain|Latin|Sentier|\d{1,2}(?:e|ème|eme|er))\b/gi;
      template.textBody = template.textBody.replace(quartierRegex, '');
      template.htmlBody = template.htmlBody.replace(quartierRegex, '');
    }
    const disposableDomains = ['yopmail.com', 'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'throwaway.email'];
    const emailDomain = (prospect.email || '').split('@')[1]?.toLowerCase();
    if (emailDomain && disposableDomains.includes(emailDomain)) {
      return { success: false, error: 'Disposable email' };
    }

    // Pre-send MX validation: ~80% of scraped `contact@xxx.tld` hard bounces
    // come from domains that don't even resolve MX records. Skipping them
    // before sending saves Brevo quota, cuts bounce rate (today ~5% hard,
    // ~25% soft) and protects sender reputation (Brevo throttles accounts
    // with high bounce ratios). Results cached in-process to avoid repeated
    // DNS lookups for the same domain inside a single cron slot.
    if (emailDomain) {
      try {
        const mxOk = await hasMxRecord(emailDomain);
        if (!mxOk) {
          // Mark the prospect email_invalid so we don't retry it every slot
          try {
            const sb = getSupabaseAdmin();
            await sb.from('crm_prospects').update({
              email_sequence_status: 'email_invalid',
              temperature: 'dead',
              updated_at: new Date().toISOString(),
            }).eq('id', prospect.id);
          } catch {}
          console.warn(`[EmailDaily] Skipping ${prospect.email} — no MX record for ${emailDomain}`);
          return { success: false, error: 'Domain has no MX record' };
        }
      } catch {
        // DNS failures are non-fatal; continue with send
      }
    }

    let messageId = 'unknown';
    let provider = 'brevo';
    let sendSuccess = false;

    // Priority 1: Gmail API (client's own email) — if connected
    const ownerUserId = clientUserId || prospect.user_id || prospect.created_by || null;
    if (ownerUserId) {
      try {
        const { getValidGmailToken, sendViaGmail } = await import('@/lib/gmail-oauth');
        const gmailAuth = await getValidGmailToken(ownerUserId);
        if (gmailAuth) {
          const supabase = getSupabaseAdmin();
          const { data: clientProfile } = await supabase
            .from('profiles')
            .select('full_name, company_name')
            .eq('id', ownerUserId)
            .single();
          const senderName = clientProfile?.full_name || clientProfile?.company_name || 'KeiroAI';

          const result = await sendViaGmail(
            gmailAuth.accessToken,
            prospect.email,
            template.subject,
            template.htmlBody,
            senderName,
            gmailAuth.email,
          );
          if (result.sent) {
            messageId = result.id;
            provider = 'gmail';
            sendSuccess = true;
            console.log(`[EmailDaily] Email sent via Gmail (${gmailAuth.email}) to ${prospect.email}`);
          }
        }
      } catch (e: any) {
        console.warn(`[EmailDaily] Gmail send failed for ${prospect.email}, falling back to Brevo:`, e.message);
      }
    }

    // Priority 2: Brevo (primary fallback)
    if (!sendSuccess && process.env.BREVO_API_KEY) {
      try {
        const brevoResponse = await sendBrevoCompat({
            sender: { name: 'Hugo de KeiroAI', email: 'contact@keiroai.com' },
            replyTo: { email: 'contact@keiroai.com', name: 'Hugo de KeiroAI' },
            to: [{ email: prospect.email, name: prospect.first_name || prospect.company || '' }],
            // No BCC — saves Brevo quota. Emails tracked via crm_activities.
            subject: template.subject,
            htmlContent: template.htmlBody,
            textContent: template.textBody,
            headers: {
              'X-Mailin-custom': JSON.stringify({ pid: prospect.id, cat: category, type: prospect.type || autoCategorizeProspect(prospect) || 'pme', step }),
              'List-Unsubscribe': '<https://keiroai.com/unsubscribe>',
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            tags: ['cold-sequence', `step-${step}`, category, prospect.type || 'unknown'],
        });

        if (brevoResponse.ok) {
          const brevoData = await brevoResponse.json();
          messageId = brevoData.messageId || 'unknown';
          provider = 'brevo';
          sendSuccess = true;
        } else {
          const errorText = await brevoResponse.text();
          console.warn(`[EmailDaily] Brevo failed for ${prospect.email}, trying Resend:`, errorText);
        }
      } catch (brevoError: any) {
        console.warn(`[EmailDaily] Brevo error, trying Resend:`, brevoError.message);
      }
    }

    // Fallback to Resend
    if (!sendSuccess && process.env.RESEND_API_KEY) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Hugo de KeiroAI <contact@keiroai.com>',
            to: [prospect.email],
            // No BCC — saves Resend quota. Emails tracked via crm_activities.
            subject: template.subject,
            html: template.htmlBody,
            text: template.textBody,
            tags: [
              { name: 'type', value: 'cold-sequence' },
              { name: 'step', value: String(step) },
              { name: 'category', value: category },
              { name: 'prospect_type', value: prospect.type || 'unknown' },
              { name: 'prospect_id', value: prospect.id },
            ],
          }),
        });

        if (resendResponse.ok) {
          const resendData = await resendResponse.json();
          messageId = resendData.id || 'unknown';
          provider = 'resend';
          sendSuccess = true;
        } else {
          const errorText = await resendResponse.text();
          console.error(`[EmailDaily] Resend also failed:`, errorText);
        }
      } catch (resendError: any) {
        console.error(`[EmailDaily] Resend error:`, resendError.message);
      }
    }

    if (!sendSuccess) {
      const supabaseForFailure = getSupabaseAdmin();
      const failCount = (prospect.email_send_failures || 0) + 1;
      const failUpdate: Record<string, any> = {
        email_send_failures: failCount,
        updated_at: new Date().toISOString(),
      };

      // Check if this is a hard bounce (invalid email) — never retry these
      const lastError = `${prospect.email || ''} send failed`.toLowerCase();
      const isBounce = lastError.includes('bounce') || lastError.includes('invalid') || lastError.includes('not found') || lastError.includes('does not exist') || lastError.includes('undeliverable') || lastError.includes('rejected') || lastError.includes('550');
      if (isBounce || failCount >= 3) {
        failUpdate.email_sequence_status = isBounce ? 'email_invalid' : 'send_failed';
        failUpdate.verified = false;
        if (isBounce) {
          console.warn(`[EmailDaily] ${prospect.email} BOUNCE detected — marked as email_invalid`);
        } else {
          console.warn(`[EmailDaily] ${prospect.email} failed ${failCount}x — marked as send_failed`);
        }
      }
      await supabaseForFailure.from('crm_prospects').update(failUpdate).eq('id', prospect.id);
      return { success: false, error: `Email send failed (attempt ${failCount}${isBounce ? ', bounce' : ''})` };
    }

    // Update prospect in DB — SPLIT into 2 updates for safety
    // Step update must NEVER fail because of a status constraint violation
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // 1) Always update sequence progress (safe, no constraint issues)
    const stepUpdate: Record<string, any> = {
      email_sequence_step: step,
      last_email_sent_at: now,
      email_sequence_status: step === 10 ? 'warm_sent' : 'in_progress',
      email_provider: provider,
      // COORDINATION MULTI-CANAL (audit 2026-06-25) : on CLAIM le canal email
      // pendant la séquence (Jade ne doit pas DM en parallèle), et on LIBÈRE
      // (null) en fin de séquence pour que le prospect puisse être tenté en DM.
      active_channel: step === 10 ? null : 'email',
      updated_at: now,
    };
    const { error: stepError } = await supabase.from('crm_prospects').update(stepUpdate).eq('id', prospect.id);
    if (stepError) {
      console.error(`[EmailDaily] Failed to update prospect ${prospect.id} step:`, stepError.message);
    }

    // 2) Advance CRM pipeline stage (separate update — if constraint fails, step still advances)
    const protectedStatuses = ['repondu', 'demo', 'sprint', 'client'];
    if (!prospect.status || !protectedStatuses.includes(prospect.status)) {
      const stepLabels: Record<number, string> = {
        1: 'contacte', 2: 'relance_1', 3: 'relance_2', 4: 'relance_3', 5: 'relance_3', 10: 'contacte',
      };
      const newStatus = stepLabels[step];
      if (newStatus) {
        const { error: statusError } = await supabase.from('crm_prospects').update({
          status: newStatus, updated_at: now,
        }).eq('id', prospect.id);
        if (statusError) {
          console.error(`[EmailDaily] Failed to update prospect ${prospect.id} status to ${newStatus}:`, statusError.message);
        }
      }
    }

    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email',
      description: `Email step ${step} envoyé: "${template.subject}"`,
      data: {
        message_id: messageId,
        step,
        subject: template.subject,
        body: template.textBody,
        category,
        source: 'daily_cron',
        provider,
        ai_generated: true,
        strategy: 'value_first', // founder 2026-06-25 — pour mesurer l'impact (open/reply) de l'approche value-first
      },
      created_at: now,
    });

    console.log(`[EmailDaily] ✓ ${prospect.email} (step ${step}, ${category}) via ${provider}`);
    return { success: true, messageId, provider };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * GET /api/agents/email/daily
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  let isAuthorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    try {
      const { getAuthUser } = await import('@/lib/auth-server');
      const { user } = await getAuthUser();
      if (user) {
        const supabaseAuth = getSupabaseAdmin();
        const { data: profile } = await supabaseAuth.from('profiles').select('is_admin').eq('id', user.id).single();
        if (profile?.is_admin) isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Aucun provider email configuré (RESEND_API_KEY ou BREVO_API_KEY requis)' },
      { status: 500 }
    );
  }

  const isCronTrigger = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const isManualTrigger = !isCronTrigger;
  const forceMode = request.nextUrl.searchParams.get('force') === 'true';
  const draftMode = request.nextUrl.searchParams.get('draft') === 'true';

  // Multi-tenant: filter by client user_id or org_id
  const orgId = request.nextUrl.searchParams.get('org_id') || null;
  const clientUserId = request.nextUrl.searchParams.get('user_id') || null;
  if (clientUserId) {
    console.log(`[EmailDaily] Running for client user_id=${clientUserId}`);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();
  const type = request.nextUrl.searchParams.get('type');
  // Business type targeting: ?types=restaurant,boutique → only send to these types
  const targetTypes = request.nextUrl.searchParams.get('types')?.split(',').map(t => t.trim()).filter(Boolean) || [];

  const results: SendResult[] = [];
  let skippedVerification = 0;
  let skippedTooRecent = 0;
  let skippedWaitingNextStep = 0;
  let skippedMaxDaily = 0;
  let prospectCount = 0;

  // ── DAILY EMAIL TARGET — FIXED BASELINE FOR QA ──
  // Founder rule 16 mai 2026: "on va chercher des clients que dans pro,
  // donc fait que pour pro ou pour utilisation individuel les quotas".
  // Simplified to a single Pro-tier target since that's the only plan
  // we're currently selling. Founder's own usage (admin) gets a
  // higher cap to test at scale; everything else gets the Pro target.
  //
  // → Pro / Créateur / Business clients: 40 emails/jour (stable)
  // → Admin (founder testing): 500/jour (Brevo paid-tier ceiling)
  //
  // The agent stops at the target even when more prospects are
  // available, so "today's count" matches "yesterday's count" — the
  // QA visibility the founder asked for.
  let dailyTarget = 40; // Pro tier baseline
  try {
    const { data: firstProspect } = await supabase
      .from('crm_prospects')
      .select('user_id')
      .limit(1)
      .maybeSingle();
    if (firstProspect?.user_id) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', firstProspect.user_id)
        .maybeSingle();
      const plan = (ownerProfile?.plan || '').toLowerCase();
      if (plan === 'admin') dailyTarget = 500;
    }
  } catch {}
  const DAILY_EMAIL_LIMIT = Math.min(dailyTarget, 500);
  // Calculate midnight Paris time (CET/CEST)
  const parisOffset = now.getMonth() >= 2 && now.getMonth() <= 9 ? 2 : 1; // Simple DST: March-October = +2, else +1
  const todayStart = new Date(now);
  todayStart.setUTCHours(-parisOffset, 0, 0, 0); // midnight Paris = UTC - offset
  if (todayStart > now) todayStart.setDate(todayStart.getDate() - 1); // if future, go back 1 day
  const { count: emailsSentToday } = await supabase
    .from('crm_activities')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'email')
    .gte('created_at', todayStart.toISOString());
  const sentToday = emailsSentToday || 0;
  let remainingQuota = Math.max(0, DAILY_EMAIL_LIMIT - sentToday);
  console.log(`[EmailDaily] Daily quota: ${sentToday}/${DAILY_EMAIL_LIMIT} sent today, ${remainingQuota} remaining`);

  // ── PROACTIVE CLEANUP: mark clearly invalid emails ──
  try {
    // Emails with 3+ send failures → mark as email_invalid (never retry)
    const { data: failedEmails } = await supabase
      .from('crm_prospects')
      .select('id, email, email_send_failures')
      .gte('email_send_failures', 3)
      .eq('email_sequence_status', 'send_failed');
    if (failedEmails && failedEmails.length > 0) {
      for (const p of failedEmails) {
        await supabase.from('crm_prospects').update({
          email_sequence_status: 'email_invalid',
          temperature: 'dead',
          updated_at: nowISO,
        }).eq('id', p.id);
      }
      console.log(`[EmailDaily] Cleanup: marked ${failedEmails.length} failed emails as email_invalid`);
    }
    // Emails marked bounced → ensure they're dead and never contacted
    const { data: bouncedEmails } = await supabase
      .from('crm_prospects')
      .select('id')
      .eq('email_sequence_status', 'bounced')
      .not('temperature', 'eq', 'dead');
    if (bouncedEmails && bouncedEmails.length > 0) {
      for (const p of bouncedEmails) {
        await supabase.from('crm_prospects').update({ temperature: 'dead', updated_at: nowISO }).eq('id', p.id);
      }
      console.log(`[EmailDaily] Cleanup: marked ${bouncedEmails.length} bounced emails as dead`);
    }
  } catch (cleanupErr: any) {
    console.warn('[EmailDaily] Cleanup error:', cleanupErr.message?.substring(0, 100));
  }

  // If Brevo quota exhausted but Resend available, switch to Resend-only mode
  let resendOnlyMode = false;
  if (remainingQuota === 0) {
    if (process.env.RESEND_API_KEY) {
      console.log('[EmailDaily] Brevo quota exhausted — switching to Resend-only mode.');
      resendOnlyMode = true;
      remainingQuota = 200; // Resend overflow to reach 280+ total/day
    } else {
      console.log('[EmailDaily] Daily email limit reached (300/day Brevo free) and no Resend. Skipping.');
      return NextResponse.json({
        ok: true,
        message: `Limite quotidienne Brevo atteinte (${sentToday}/${DAILY_EMAIL_LIMIT}). Pas de Resend configuré.`,
        sent: 0, skipped_quota: true,
      });
    }
  }

  try {
    // Recovery: reset send_failed prospects older than 24h so they retry (via Resend this time)
    if (process.env.RESEND_API_KEY) {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: failedProspects } = await supabase
        .from('crm_prospects')
        .select('id')
        .eq('email_sequence_status', 'send_failed')
        .lt('updated_at', oneDayAgo);

      if (failedProspects && failedProspects.length > 0) {
        await supabase
          .from('crm_prospects')
          .update({ email_sequence_status: 'in_progress', email_send_failures: 0, updated_at: nowISO })
          .in('id', failedProspects.map(p => p.id));
        console.log(`[EmailDaily] Recovered ${failedProspects.length} send_failed prospects for retry via Resend`);
      }
    }

    // Load agent learnings for AI generation
    const learnings = await loadAgentLearnings(orgId);

    if (type === 'warm') {
      // --- Warm mode: follow-up chatbot leads ---
      console.log('[EmailDaily] Running warm mode...');

      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

      const { data: rawWarmProspects } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('source', 'chatbot')
        .not('email', 'is', null)
        .eq('email_sequence_step', 0)
        .lte('created_at', twentyFourHoursAgo)
        .gte('created_at', fortyEightHoursAgo);

      const warmProspects = (rawWarmProspects || []).filter(p =>
        !p.status || !['sprint', 'client', 'perdu', 'lost', 'client_pro', 'client_fondateurs'].includes(p.status)
      );

      console.log(`[EmailDaily] Warm prospects: ${warmProspects?.length ?? 0}`);

      if (warmProspects && warmProspects.length > 0) {
        // AI-generate warm emails
        const batchInput = warmProspects.map(p => ({
          prospect: p,
          category: getSequenceForProspect(p),
          step: 10,
        }));

        const aiEmails = await generateAIEmails(batchInput, learnings, clientUserId, supabase);

        let warmSentCount = 0;
        for (const prospect of warmProspects) {
          if (remainingQuota <= 0) {
            console.log('[EmailDaily] Daily quota exhausted mid-warm-batch, stopping.');
            break;
          }
          // Anti-spam: delay between warm emails
          if (warmSentCount > 0) {
            await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
          }
          warmSentCount++;
          // Cross-agent dedup: skip if any agent emailed this prospect in last 3 days
          const warmDedup = await canSendEmail(supabase, prospect.email, {
            minDays: 3,
            prospectId: prospect.id,
          });
          if (!warmDedup.allowed) {
            console.log(`[EmailDaily] Warm dedup skip: ${prospect.email} — ${warmDedup.reason}`);
            continue;
          }
          const aiEmail = aiEmails.get(prospect.id);
          const template = aiEmail || getEmailTemplate(getSequenceForProspect(prospect), 10, {
            first_name: prospect.first_name || '',
            company: prospect.company || '',
            type: prospect.type || '',
            quartier: prospect.quartier || '',
            note_google: prospect.note_google != null ? String(prospect.note_google) : '',
            prospect_id: prospect.id,
          }, 0);

          const result = await sendEmail(prospect, 10, template, getSequenceForProspect(prospect), clientUserId);
          if (result.success) remainingQuota--;
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step: 10,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
            ai_generated: !!aiEmail,
          });
        }
      }
    } else {
      // --- Default: cold sequences ---
      console.log(`[EmailDaily] Running cold sequence (manual=${isManualTrigger}${targetTypes.length > 0 ? `, types=${targetTypes.join(',')}` : ''})...`);

      // Query eligible prospects: have email, not completed sequence, not dead/lost/client
      // Use separate filters to avoid PostgREST .or() parsing issues
      // Get admin user IDs to exclude their prospects from cold email
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_admin', true);
      const adminUserIds = new Set((adminProfiles || []).map((p: any) => p.id));

      const prospectQuery = supabase
        .from('crm_prospects')
        .select('*')
        .not('email', 'is', null)
        .not('email_sequence_status', 'eq', 'bounced')
        .not('email_sequence_status', 'eq', 'email_invalid')
        .not('email_sequence_status', 'eq', 'stopped')
        .not('email_sequence_status', 'eq', 'paused');

      // Multi-tenant: filter by client
      if (clientUserId) {
        prospectQuery.eq('user_id', clientUserId);
      } else if (orgId) {
        prospectQuery.eq('org_id', orgId);
      }

      const { data: allWithEmail, error: queryError } = await prospectQuery;

      // Doctrine réveil cross-canal : un prospect mort SUR UN AUTRE canal (ex: DM)
      // peut recevoir UN email de réveil si l'email n'a jamais été tenté.
      const { canReviveOn, isFinalDead, isDeadProspect } = await import('@/lib/agents/revival');

      // Filter in JS for reliability (PostgREST .or() with .not.in. can be tricky)
      const prospects = (allWithEmail || []).filter(p => {
        // EXCLUDE admin-owned prospects
        if (p.user_id && adminUserIds.has(p.user_id)) return false;
        // Business type targeting: if types specified, only include matching prospects
        const typeOk = targetTypes.length === 0 || (p.type && targetTypes.includes(p.type));
        // Skip prospects that have failed sending 3+ times (prevent infinite retry)
        const failOk = !p.email_send_failures || p.email_send_failures < 3;
        // 2026-06-25 — COORDINATION MULTI-CANAL (audit) : ne JAMAIS emailer un
        // prospect désinscrit (no_outbound) ni un prospect "owned" par un autre
        // canal (active_channel='dm'). Le cron de volume ignorait ces 2 gardes.
        const outboundOk = !p.no_outbound;

        // Prospect mort : autorisé UNIQUEMENT comme réveil email (mort ailleurs,
        // email vierge, pas mort définitif). On saute le verrou de canal : le but
        // EST de changer de canal. Le send posera active_channel='email'.
        if (isDeadProspect(p)) {
          return typeOk && failOk && outboundOk && !isFinalDead(p) && canReviveOn(p, 'email');
        }

        // Vivant : logique normale.
        const seq = p.email_sequence_status;
        const seqOk = !seq || seq === 'not_started' || seq === 'in_progress';
        const statusOk = !p.status || !['client', 'sprint', 'client_pro', 'client_fondateurs'].includes(p.status);
        const channelOk = !p.active_channel || p.active_channel === 'email';
        return seqOk && statusOk && typeOk && failOk && outboundOk && channelOk;
      });

      if (queryError) {
        console.error('[EmailDaily] Query error:', queryError.message);
        return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
      }

      // Sort: 1) verified follow-ups, 2) verified new, 3) unverified follow-ups, 4) unverified new
      // Within each group, sort by score descending (best prospects first)
      prospects.sort((a, b) => {
        const aVerified = a.verified ? 1 : 0;
        const bVerified = b.verified ? 1 : 0;
        if (aVerified !== bVerified) return bVerified - aVerified;
        const aInProgress = a.email_sequence_status === 'in_progress' && (a.email_sequence_step ?? 0) > 0;
        const bInProgress = b.email_sequence_status === 'in_progress' && (b.email_sequence_step ?? 0) > 0;
        if (aInProgress && !bInProgress) return -1;
        if (!aInProgress && bInProgress) return 1;
        return (b.score || 0) - (a.score || 0);
      });

      const verifiedCount = prospects.filter(p => p.verified).length;
      const newCount = prospects.filter(p => !p.email_sequence_status || p.email_sequence_status === 'not_started').length;
      const followUpCount = prospects.filter(p => p.email_sequence_status === 'in_progress').length;
      console.log(`[EmailDaily] Eligible prospects: ${prospects?.length ?? 0} (${verifiedCount} verified, ${newCount} new, ${followUpCount} follow-ups)`);

      if (!prospects || prospects.length === 0) {
        const { count: totalCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
        const { count: withEmail } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null);
        const { count: withCompany } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('company', 'is', null);
        const { count: deadCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead');
        const { count: perduCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'perdu');
        const { count: completedCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'completed');
        const { count: inProgressCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'in_progress');
        const { count: notStartedCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'not_started');
        const { count: nullSeqCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).is('email_sequence_status', null);
        const { count: clientCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'client');
        const { count: sprintCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'sprint');

        // Get sample of status values to understand distribution
        const { data: statusSample } = await supabase.from('crm_prospects').select('status, email_sequence_status, temperature').not('email', 'is', null).limit(10);

        const diagnostic = {
          total_crm: totalCount || 0,
          with_email: withEmail || 0,
          with_company: withCompany || 0,
          dead: deadCount || 0,
          perdu: perduCount || 0,
          clients: clientCount || 0,
          sprint: sprintCount || 0,
          email_seq_completed: completedCount || 0,
          email_seq_in_progress: inProgressCount || 0,
          email_seq_not_started: notStartedCount || 0,
          email_seq_null: nullSeqCount || 0,
          sample_statuses: statusSample?.map(s => ({ status: s.status, seq: s.email_sequence_status, temp: s.temperature })),
          reason: 'Aucun prospect éligible. Breakdown: email_sequence_status doit être null/not_started/in_progress, temperature != dead, status != client/perdu/sprint.',
        };
        console.log(`[EmailDaily] Diagnostic:`, JSON.stringify(diagnostic));

        await supabase.from('agent_logs').insert({
          agent: 'email', action: 'daily_cold',
          data: { total: 0, success: 0, failed: 0, diagnostic },
          created_at: nowISO,
        });

        return NextResponse.json({ ok: true, stats: { total: 0, success: 0, failed: 0 }, diagnostic });
      }

      let step1Count = 0;
      let skippedCompleted = 0;
      let recycledCount = 0;
      let selfVerifiedCount = 0;
      const MAX_STEP1_PER_DAY = isManualTrigger ? 500 : 500; // Max emails per run — send as many as possible
      const MIN_HOURS_BEFORE_FIRST_EMAIL = isManualTrigger ? 0 : 0; // No delay — send immediately
      // For manual triggers: send immediately (no multi-day gaps)
      // For cron: respect normal spacing between steps (min 3 days between any email to same prospect)
      // Séquence 7 jours : J+0, J+2, J+7, J+10, J+13
      const STEP_GAP_DAYS = forceMode ? { 1: 0, 2: 0, 3: 0, 4: 0 } :
        isManualTrigger ? { 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5 } :
        { 1: 2, 2: 5, 3: 3, 4: 3 };
      // Per-prospect rate limit: never send more than 1 email per 3 days regardless of step
      const MIN_DAYS_BETWEEN_ANY_EMAIL = forceMode ? 0 : isManualTrigger ? 0.5 : 3;
      prospectCount = prospects.length;

      // Collect prospects for AI batch generation
      const batchForAI: Array<{ prospect: any; category: string; step: number }> = [];

      const RUN_TIME_LIMIT_MS = 240_000; // 240s hard limit (leave 60s for reporting)
      const runStart = Date.now();

      // Cap batch to remaining daily quota — 60 per slot allows ~280/day across 5-6 slots
      // Bumped per-slot batch cap 60 → 100 so a single slot can ship
      // more when daily headroom exists. Pairs with the 500/day cap.
      const maxBatchSize = Math.min(remainingQuota, 100);

      for (const prospect of prospects) {
        // Quota guard — stop when we've queued enough for this slot
        if (batchForAI.length >= maxBatchSize) {
          console.log(`[EmailDaily] Batch cap reached (${maxBatchSize} for this slot, ${remainingQuota} daily remaining).`);
          break;
        }
        // Time guard — stop if approaching timeout
        if (Date.now() - runStart > RUN_TIME_LIMIT_MS) {
          console.warn(`[EmailDaily] Time guard: stopping after ${batchForAI.length} emails queued (${Math.round((Date.now() - runStart) / 1000)}s)`);
          break;
        }

        const category = getSequenceForProspect(prospect);

        // Auto-categorize untyped prospects
        if (!prospect.type || prospect.type.trim() === '') {
          const inferredType = autoCategorizeProspect(prospect);
          if (inferredType) {
            await supabase.from('crm_prospects').update({
              type: inferredType,
              updated_at: nowISO,
            }).eq('id', prospect.id);
            prospect.type = inferredType;
            console.log(`[EmailDaily] Auto-categorized ${prospect.company} → ${inferredType}`);
          }
        }

        // CRM coherence check — fix data issues before processing
        const { fixes, issues: crmIssues } = verifyCRMCoherence(prospect);
        if (Object.keys(fixes).length > 0) {
          fixes.updated_at = nowISO;
          await supabase.from('crm_prospects').update(fixes).eq('id', prospect.id);
          Object.assign(prospect, fixes); // Apply fixes in-memory too
          if (crmIssues.length > 0) {
            console.log(`[EmailDaily] CRM fix ${prospect.company}: ${crmIssues.join(', ')}`);
          }
        }
        // Skip if dead/invalid after fixes
        if (fixes.temperature === 'dead' || fixes.status === 'perdu') { skippedVerification++; continue; }

        const verification = verifyProspectData(prospect);
        if (!verification.valid) { skippedVerification++; continue; }

        // Self-verify: if commercial agent hasn't verified, email agent does it
        if (!prospect.verified && prospect.email && prospect.company) {
          // Safe: ignore error if verified column doesn't exist yet
          const { error: verifyErr } = await supabase.from('crm_prospects').update({
            verified: true,
            verified_at: nowISO,
            verified_by: 'email',
          }).eq('id', prospect.id);
          if (!verifyErr) selfVerifiedCount++;
        }

        const step = prospect.email_sequence_step ?? 0;
        const lastSent = prospect.last_email_sent_at ? new Date(prospect.last_email_sent_at) : null;
        const created = new Date(prospect.created_at);
        const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
        const daysSinceLastSent = lastSent ? (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

        // ── Auto-reply guard (per founder feedback) ──────────────────
        // If the prospect has only ever sent us automated responses
        // (out-of-office, holiday replies), we stop the sequence after
        // 3 of them — re-engaging a mailbox that only echoes auto-bots
        // is wasted volume and looks spammy. The counter is incremented
        // by the Brevo webhook when classification.intent === 'out_of_office'.
        const autoReplies = (prospect as any).email_auto_replies_count ?? 0;
        if (autoReplies >= 3) {
          await supabase.from('crm_prospects').update({
            email_sequence_status: 'paused',
            status: prospect.status === 'client' || prospect.status === 'repondu' ? prospect.status : 'perdu',
            temperature: 'dead',
            updated_at: nowISO,
          }).eq('id', prospect.id);
          skippedCompleted++;
          continue;
        }

        // ── Engagement-aware delay calculation ───────────────────────
        // Hot prospects who opened our email deserve more thinking time
        // before the next nudge — chasing them too fast feels pushy.
        // Cold prospects (no opens after step 2) get accelerated to
        // catch disengagement signal earlier.
        const openedAt = (prospect as any).last_email_opened_at ? new Date((prospect as any).last_email_opened_at) : null;
        const hoursSinceOpen = openedAt ? (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60) : Infinity;
        const isHot = (prospect as any).temperature === 'hot' || ((prospect as any).score ?? 0) >= 50;
        const recentlyOpened = hoursSinceOpen < 48;
        const noOpens = step >= 2 && !openedAt && ((prospect as any).email_opens_count ?? 0) === 0;
        const baseGap = STEP_GAP_DAYS[step as 1|2|3|4] ?? 0;
        // Hot + recent open → +3 days (give them space to decide).
        // Recently opened (warm) → +1 day. Cold/no opens → -1 day (gentle accel).
        const adjust = isHot && recentlyOpened ? 3 : recentlyOpened ? 1 : noOpens ? -1 : 0;
        const effectiveGap = Math.max(MIN_DAYS_BETWEEN_ANY_EMAIL, baseGap + adjust);

        // DEDUP: Per-prospect rate limit — never email same person more than once per 3 days
        if (lastSent && daysSinceLastSent < MIN_DAYS_BETWEEN_ANY_EMAIL) {
          skippedWaitingNextStep++;
          continue;
        }
        // Cross-agent dedup: also check emails sent by retention & onboarding agents
        const dedupCheck = await canSendEmail(supabase, prospect.email, {
          minDays: MIN_DAYS_BETWEEN_ANY_EMAIL,
          force: forceMode,
          prospectId: prospect.id,
        });
        if (!dedupCheck.allowed) {
          skippedWaitingNextStep++;
          continue;
        }

        if (step === 0) {
          // Step 0 → send step 1 (premier contact)
          if (hoursSinceCreation < MIN_HOURS_BEFORE_FIRST_EMAIL) { skippedTooRecent++; continue; }
          if (step1Count >= MAX_STEP1_PER_DAY) { skippedMaxDaily++; continue; }
          batchForAI.push({ prospect, category, step: 1 });
          step1Count++;
        } else if (step === 1 && !lastSent) {
          // Step 1 without lastSent = data inconsistency → RE-SEND step 1 (don't skip)
          if (step1Count >= MAX_STEP1_PER_DAY) { skippedMaxDaily++; continue; }
          batchForAI.push({ prospect, category, step: 1 });
          step1Count++;
        } else if (step === 1 && lastSent) {
          // Step 1 → step 2 (relance douce). Gap adapts to engagement.
          if (daysSinceLastSent < effectiveGap) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 2 });
        } else if (step === 2 && lastSent) {
          // Step 2 → step 3 (valeur gratuite). Gap adapts to engagement.
          if (daysSinceLastSent < effectiveGap) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 3 });
        } else if (step === 3 && lastSent) {
          // Step 3 → step 4 (FOMO concurrents). Gap adapts to engagement.
          if (daysSinceLastSent < effectiveGap) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 4 });
        } else if (step === 4 && lastSent) {
          // Step 4 → step 5 (derniere chance) — last step deserves the
          // longest breathing room. effectiveGap already adds +1 / +3 day
          // for hot prospects; we still floor it at 7 days here.
          if (daysSinceLastSent < Math.max(effectiveGap, 7)) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 5 });
        } else if (step === 5) {
          // Step 5 completed → mark sequence as completed + perdu (3 relances, no response)
          const isProtected = prospect.status && ['repondu', 'demo', 'sprint', 'client'].includes(prospect.status);
          await supabase.from('crm_prospects').update({
            email_sequence_status: 'completed',
            status: isProtected ? prospect.status : 'perdu',
            temperature: isProtected ? prospect.temperature : 'cold',
            updated_at: nowISO,
          }).eq('id', prospect.id);
          skippedCompleted++;
        }
      }

      // Auto-recycle: completed prospects after 45 days get a second cycle (max 2 cycles, max 5 recycled per run)
      const MAX_RECYCLE_PER_RUN = 5;
      const { data: completedProspects } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('email_sequence_status', 'completed')
        .not('email', 'is', null)
        .not('status', 'in', '("client","repondu","demo","sprint")');

      if (completedProspects && completedProspects.length > 0) {
        for (const prospect of completedProspects) {
          if (recycledCount >= MAX_RECYCLE_PER_RUN) break;
          const cycle = (prospect as any).email_cycle || 1;
          if (cycle >= 2) continue; // Max 2 cycles — no infinite loop
          const lastSent = prospect.last_email_sent_at ? new Date(prospect.last_email_sent_at) : null;
          if (!lastSent) continue;
          const daysSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastSent < 45) continue; // 45 days instead of 21 — more respectful

          // Recycle: reset to step 0, cycle 2
          await supabase.from('crm_prospects').update({
            email_sequence_step: 0,
            email_sequence_status: 'in_progress',
            email_cycle: cycle + 1,
            updated_at: nowISO,
          }).eq('id', prospect.id);
          recycledCount++;
          console.log(`[EmailDaily] Recycled ${prospect.company || prospect.email} → cycle ${cycle + 1}`);
        }
      }

      // Step distribution for diagnostics
      const stepDistribution: Record<string, number> = {};
      for (const p of prospects) {
        const s = p.email_sequence_step ?? 0;
        const hasLastSent = !!p.last_email_sent_at;
        const key = `step_${s}${hasLastSent ? '_sent' : '_nosent'}`;
        stepDistribution[key] = (stepDistribution[key] || 0) + 1;
      }

      const skipDiag = {
        total_eligible: prospects.length,
        verified_count: verifiedCount,
        self_verified: selfVerifiedCount,
        to_send: batchForAI.length,
        skipped_verification: skippedVerification,
        skipped_too_recent: skippedTooRecent,
        skipped_waiting_next_step: skippedWaitingNextStep,
        skipped_max_daily: skippedMaxDaily,
        skipped_completed: skippedCompleted,
        recycled: recycledCount,
        step_distribution: stepDistribution,
        mode: forceMode ? 'force' : isManualTrigger ? 'manual' : 'cron',
        step_gaps: STEP_GAP_DAYS,
      };
      console.log(`[EmailDaily] Pipeline:`, JSON.stringify(skipDiag));

      // Diagnostics: if nothing to send, log pipeline breakdown so admin can see why
      if (batchForAI.length === 0) {
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: 'daily_cold',
          data: {
            total: 0, success: 0, failed: 0,
            pipeline: skipDiag,
            reason: 'batchForAI empty after loop — all prospects filtered out by step timing, verification, or daily limits',
          },
          created_at: nowISO,
        });

        return NextResponse.json({
          ok: true,
          mode: 'cold',
          stats: { total: 0, success: 0, failed: 0 },
          pipeline: skipDiag,
          reason: 'Aucun email à envoyer — tous les prospects filtrés par timing, vérification ou limites quotidiennes',
        });
      }

      // AI batch generation (one Gemini call for all emails)
      let aiEmails = new Map<string, { subject: string; textBody: string; htmlBody: string }>();
      if (batchForAI.length > 0 && process.env.GEMINI_API_KEY) {
        // Process in batches of 10 to stay within token limits
        for (let i = 0; i < batchForAI.length; i += 10) {
          const batch = batchForAI.slice(i, i + 10);
          const batchResult = await generateAIEmails(batch, learnings, clientUserId, supabase);
          batchResult.forEach((v, k) => aiEmails.set(k, v));
        }
      }

      // Send or draft all emails
      const drafts: Array<{ prospect_id: string; email: string; company: string; step: number; category: string; subject: string; body: string; ai_generated: boolean }> = [];

      // Dedup: prevent same prospect from receiving 2 emails in same batch run
      const sentInThisBatch = new Set<string>();

      for (const { prospect, category, step } of batchForAI) {
        if (sentInThisBatch.has(prospect.id)) {
          console.log(`[EmailDaily] Duplicate in batch: ${prospect.email} already processed, skipping`);
          continue;
        }
        // Quota guard: stop when daily Brevo limit reached
        if (remainingQuota <= 0) {
          console.log(`[EmailDaily] Daily quota exhausted (${DAILY_EMAIL_LIMIT}/day). Stopping cold batch.`);
          break;
        }
        // Time guard for sending phase
        if (Date.now() - runStart > 270_000) {
          console.warn(`[EmailDaily] Send time guard: stopping after ${results.length} emails sent (${Math.round((Date.now() - runStart) / 1000)}s)`);
          break;
        }
        sentInThisBatch.add(prospect.id);

        // Anti-spam: delay between emails (Gmail throttles mass sends)
        // 3-8 seconds random delay to look human
        if (sentInThisBatch.size > 1) {
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        }

        const aiEmail = aiEmails.get(prospect.id);

        // Fallback to template if AI failed
        const template = aiEmail || getEmailTemplate(category, step, {
          first_name: prospect.first_name || '',
          company: prospect.company || '',
          type: prospect.type || '',
          quartier: prospect.quartier || '',
          note_google: prospect.note_google != null ? String(prospect.note_google) : '',
          prospect_id: prospect.id,
        }, Math.floor(Math.random() * 3));

        if (draftMode) {
          // Save as draft for review — don't send
          drafts.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step,
            category,
            subject: template.subject,
            body: template.htmlBody,
            ai_generated: !!aiEmail,
          });
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step,
            success: true,
            ai_generated: !!aiEmail,
          });
        } else {
          const result = await sendEmail(prospect, step, template, category, clientUserId);
          if (result.success) remainingQuota--;
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
            ai_generated: !!aiEmail,
          });
        }
      }

      // Store drafts in agent_logs for admin review
      if (draftMode && drafts.length > 0) {
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: 'email_drafts',
          data: { drafts, count: drafts.length },
          created_at: nowISO,
        });
      }

      // skipDiag already logged above
    }

    // --- Summary & Logging ---
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const aiCount = results.filter(r => r.ai_generated).length;

    // Business type breakdown
    const byBusinessType: Record<string, { sent: number; failed: number; steps: number[] }> = {};
    if (results.length > 0 && type !== 'warm') {
      const prospectIds = [...new Set(results.map(r => r.prospect_id))];
      const { data: prospectTypes } = await supabase
        .from('crm_prospects')
        .select('id, type')
        .in('id', prospectIds);

      const typeMap: Record<string, string> = {};
      if (prospectTypes) {
        for (const p of prospectTypes) typeMap[p.id] = p.type || 'unknown';
      }

      for (const r of results) {
        const bType = typeMap[r.prospect_id] || 'unknown';
        if (!byBusinessType[bType]) byBusinessType[bType] = { sent: 0, failed: 0, steps: [] };
        if (r.success) byBusinessType[bType].sent++;
        else byBusinessType[bType].failed++;
        byBusinessType[bType].steps.push(r.step);
      }
    }

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: type === 'warm' ? 'daily_warm' : 'daily_cold',
      // Explicit success status so the Ops health check counts this run as a
      // success. A batch that sent at least one email (or had nothing to send)
      // is a healthy run; only a batch where everything failed is an error.
      status: results.length > 0 && successCount === 0 ? 'error' : 'ok',
      data: {
        total: results.length,
        success: successCount,
        failed: failCount,
        ai_generated: aiCount,
        provider: 'brevo+resend',
        manual: isManualTrigger,
        by_business_type: byBusinessType,
        ...(type !== 'warm' && { pipeline: {
          total_eligible: prospectCount,
          skipped_verification: skippedVerification,
          skipped_too_recent: skippedTooRecent,
          skipped_waiting_next_step: skippedWaitingNextStep,
          skipped_max_daily: skippedMaxDaily,
        }}),
        results: results.map(r => ({
          prospect_id: r.prospect_id,
          email: r.email,
          company: r.company,
          step: r.step,
          success: r.success,
          error: r.error,
          ai: r.ai_generated,
        })),
      },
      created_at: nowISO,
    });

    // Auto-learn from performance
    await autoLearn(results, supabase, orgId, clientUserId);

    // Report to CEO — 2026-06-03 dedup
    const { logReportToCeoOnce: logReportEmail } = await import('@/lib/agents/report-to-ceo');
    await logReportEmail(supabase, {
      agent: 'email',
      data: {
        phase: 'completed',
        message: `Email: ${successCount} envoyés (${aiCount} IA), ${failCount} échoués | ${isManualTrigger ? 'manuel' : 'cron'}`,
      },
    });

    // ── Feedback to CEO ──
    try {
      if (successCount > 0 || failCount > 0) {
        await saveAgentFeedback(supabase, {
          from_agent: 'email',
          to_agent: 'ceo',
          feedback: `Emails ${type}: ${successCount} envoyés (${aiCount} IA), ${failCount} échoués. ${failCount > 0 ? `⚠️ Taux échec: ${(failCount / results.length * 100).toFixed(0)}%.` : 'Zéro échec.'} ${Object.keys(byBusinessType).length > 0 ? `Types ciblés: ${Object.entries(byBusinessType).map(([t, c]) => `${t}:${c}`).join(', ')}.` : ''}`,
          category: 'email',
        }, orgId);
      }
    } catch (fbErr: any) {
      console.warn('[EmailDaily] Feedback save error:', fbErr.message);
    }

    console.log(`[EmailDaily] Done: ${successCount} sent (${aiCount} AI), ${failCount} failed`);

    return NextResponse.json({
      ok: true,
      mode: type === 'warm' ? 'warm' : 'cold',
      draft: draftMode,
      provider: draftMode ? 'draft' : 'brevo+resend',
      manual: isManualTrigger,
      stats: { total: results.length, success: successCount, failed: failCount, ai_generated: aiCount },
      message: draftMode ? `${results.length} brouillons générés — voir dans Logs agent` : undefined,
      results,
    });
  } catch (error: any) {
    console.error('[EmailDaily] Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents/email/daily
 * Actions: reset_dead_prospects
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  let isAuthorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    try {
      const { getAuthUser } = await import('@/lib/auth-server');
      const { user } = await getAuthUser();
      if (user) {
        const supabaseAuth = getSupabaseAdmin();
        const { data: profile } = await supabaseAuth.from('profiles').select('is_admin').eq('id', user.id).single();
        if (profile?.is_admin) isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'reset_dead_prospects') {
      const supabase = getSupabaseAdmin();
      const nowISO = new Date().toISOString();

      // Find all dead/perdu prospects OR completed sequence prospects with valid email
      const { data: allProspects, error: queryError } = await supabase
        .from('crm_prospects')
        .select('id, email, company, temperature, status, email_sequence_status')
        .not('email', 'is', null);

      if (queryError) {
        return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
      }

      // Filter: dead/perdu OR sequence completed (pipeline is dry)
      const toReset = (allProspects || []).filter(p =>
        (p.temperature === 'dead' || p.status === 'perdu') ||
        p.email_sequence_status === 'completed'
      );

      if (toReset.length === 0) {
        return NextResponse.json({ ok: true, reset_count: 0, message: 'Aucun prospect à réinitialiser' });
      }

      const deadIds = toReset.filter(p => p.temperature === 'dead' || p.status === 'perdu').map(p => p.id);
      const completedIds = toReset.filter(p => p.email_sequence_status === 'completed' && p.temperature !== 'dead' && p.status !== 'perdu').map(p => p.id);

      // Reset dead/perdu prospects fully
      if (deadIds.length > 0) {
        await supabase
          .from('crm_prospects')
          .update({
            temperature: 'cold',
            status: 'identifie',
            email_sequence_status: 'not_started',
            email_sequence_step: 0,
            updated_at: nowISO,
          })
          .in('id', deadIds);
      }

      // Reset completed sequence prospects (restart their email sequence only)
      if (completedIds.length > 0) {
        await supabase
          .from('crm_prospects')
          .update({
            email_sequence_status: 'not_started',
            email_sequence_step: 0,
            updated_at: nowISO,
          })
          .in('id', completedIds);
      }

      // Log the action
      await supabase.from('agent_logs').insert({
        agent: 'email',
        action: 'reset_dead_prospects',
        data: {
          dead_reset: deadIds.length,
          completed_reset: completedIds.length,
          total_reset: toReset.length,
        },
        created_at: nowISO,
      });

      console.log(`[EmailDaily] Reset ${deadIds.length} dead + ${completedIds.length} completed prospects`);

      return NextResponse.json({
        ok: true,
        reset_count: toReset.length,
        message: `${deadIds.length} dead→cold + ${completedIds.length} séquences terminées relancées`,
      });
    }

    return NextResponse.json({ ok: false, error: `Action inconnue: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[EmailDaily] POST Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
