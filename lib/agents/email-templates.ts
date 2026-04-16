// KeiroAI Agent System - Email Templates
// 6 categories x 3 emails + 1 warm template
// Sender: "Victor de KeiroAI" / contact@keiroai.com

import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe-token';

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
  attachmentName?: string;
}

// ---------------------------------------------------------------------------
// Inline CSS email wrapper (same gradient style as support/contact emails)
// ---------------------------------------------------------------------------

function wrapHtmlEmail(subject: string, bodyHtml: string): string {
  // Style "écrit à la main" — pas de header coloré, pas de cadre, pas de pub
  // Ressemble à un vrai email personnel envoyé depuis Gmail
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#222;margin:0;padding:0;">
  <div style="max-width:580px;margin:0 auto;padding:20px 10px;">
    ${bodyHtml}
    <p style="margin-top:28px;color:#222;">Victor</p>
    <p style="margin:2px 0;color:#555;font-size:13px;">KeiroAI — keiroai.com</p>
    <p style="margin:16px 0 0 0;font-size:11px;color:#aaa;">Pour ne plus recevoir ces emails, <a href="{{unsubscribe_url}}" style="color:#aaa;">cliquez ici</a>.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceVars(template: string, v: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(v)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escapeHtml(value || ''));
  }
  // Clean up leading comma when first_name empty: ", question sur X" → "Question sur X"
  result = result.replace(/^[,\s]+/gm, (m) => '');
  // "Bonjour ," or "Salut ," → clean greeting when name is empty
  result = result.replace(/(?:Bonjour|Salut)\s*,\s*\n/g, 'Bonjour,\n');
  // Orphan comma on its own line (from empty first_name)
  result = result.replace(/^\s*,\s*$/gm, '');
  // Fix <strong> tags escaped in text parts of html
  result = result.replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>');
  // Capitalize first letter after cleanup
  result = result.replace(/^([a-zàâéèêëïîôùûüç])/gm, (m) => m.toUpperCase());
  // Clean up sentences with empty quartier variable
  result = result.replace(/\bdu\s*([.,<\n])/g, '$1');
  result = result.replace(/\bdu\s*$/gm, '');
  // "dans le " → remove "dans le" before punctuation/tags/spaces
  result = result.replace(/\bdans le\s*([.,—<\n])/g, '$1');
  result = result.replace(/\bdans le\s+—/g, '—');
  result = result.replace(/\bdans le\s*$/gm, '');
  // "en cherchant les meilleurs restos du [empty]" → "en ligne"
  result = result.replace(/en cherchant les meilleurs restos du\s*([.,<\n])/g, 'en ligne$1');
  // "vos concurrents dans le postent" → "vos concurrents postent"
  result = result.replace(/concurrents dans le\s+(postent|montrent)/g, 'concurrents $1');
  // "d'autres coachs/salons/fleuristes dans le attirent" → without "dans le"
  result = result.replace(/dans le\s+(attirent|montrent|postent)/g, '$1');
  // "[Company] dans le — ..." → "[Company] — ..."
  result = result.replace(/(<\/strong>)\s*dans le\s*—/g, '$1 —');
  result = result.replace(/(\w)\s+dans le\s*—/g, '$1 —');
  // "de " before punctuation
  result = result.replace(/\bde\s+un\s+de\b/g, 'de');
  // Subject lines: "Restaurant  — " → "Restaurant — "
  result = result.replace(/(\w)\s{2,}—/g, '$1 —');
  // Empty Google note cleanup
  result = result.replace(/\s+sur Google, c'est top\.\s*/g, '. ');
  result = result.replace(/,\s*sur Google\b/g, '');
  result = result.replace(/Restaurant\s+—/g, 'Votre restaurant —');
  result = result.replace(/Boutique\s+—/g, 'Votre boutique —');
  result = result.replace(/Coach\s+—/g, 'Coach —');
  result = result.replace(/Salon\s+—/g, 'Votre salon —');
  result = result.replace(/Caviste\s+—/g, 'Votre cave —');
  result = result.replace(/Fleuriste\s+—/g, 'Votre boutique —');
  result = result.replace(/\s{2,}/g, ' ');
  // Replace unsubscribe placeholder — tokenized per prospect when possible
  const unsubUrl = v.prospect_id
    ? buildUnsubscribeUrl(v.prospect_id)
    : 'https://keiroai.com/unsubscribe';
  result = result.replace(/\{\{unsubscribe_url\}\}/g, unsubUrl);
  return result;
}

// ---------------------------------------------------------------------------
// Shared CTA and social proof elements for "superstar" emails
// ---------------------------------------------------------------------------

// Style "email perso" — pas de bouton coloré, juste un lien texte naturel
function ctaButtonHtml(text: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `<p style="margin:16px 0;font-size:15px;"><a href="${safeUrl}" style="color:#0066cc;text-decoration:underline;">keiroai.com</a></p>`;
}

function socialProofHtml(): string {
  // Supprimé — trop marketing pour un email perso
  return '';
}

function psLineHtml(text: string): string {
  const safeText = escapeHtml(text);
  return `<p style="margin:16px 0 0 0;font-size:14px;color:#666;"><em>P.S. ${safeText}</em></p>`;
}

function psLineText(text: string): string {
  return `\n\nP.S. ${text}`;
}

// ---------------------------------------------------------------------------
// Subject variants per category (email 1 only)
// ---------------------------------------------------------------------------

const SUBJECT_VARIANTS: Record<string, string[]> = {
  restaurant: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, +40% de r\u00E9servations en 7 jours ?',
    '{{company}} \u2014 j\u2019ai vu votre Google, j\u2019ai un truc',
    'Ce que font vos concurrents sur Instagram (et pas vous)',
  ],
  boutique: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, vos produits vus par 5 000 personnes ?',
    '{{company}} \u2014 une vitrine Instagram en 3 min',
    '3 ventes en plus ce mois-ci, \u00E7a vous int\u00E9resse ?',
  ],
  coach: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, remplir votre planning en 1 semaine ?',
    '{{company}} \u2014 3 clients en plus sans publicit\u00E9',
    'Ce que vos concurrents font sur Instagram',
  ],
  coiffeur: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, remplir votre planning la semaine prochaine ?',
    '{{company}} \u2014 5 RDV en plus gr\u00E2ce \u00E0 Instagram',
    'Vos cr\u00E9ations m\u00E9ritent d\u2019\u00EAtre vues',
  ],
  caviste: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, vos vins vus par 5 000 amateurs ?',
    '{{company}} \u2014 2 paniers en plus cette semaine',
    'Ce que font les caves qui cartonnent sur Insta',
  ],
  fleuriste: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, vos bouquets vus par 5 000 personnes ?',
    '{{company}} \u2014 3 commandes en plus cette semaine',
    'Ce que font les fleuristes qui cartonnent sur Insta',
  ],
  freelance: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, 3 clients en plus ce mois-ci ?',
    '{{company}} \u2014 votre expertise m\u00E9rite d\u2019\u00EAtre visible',
    'Ce qui diff\u00E9rencie les freelances qui trouvent des clients',
  ],
  services: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, 3 devis en plus ce mois-ci ?',
    '{{company}} \u2014 visible en 3 minutes sur Instagram',
    'Vos concurrents postent d\u00E9j\u00E0 sur les r\u00E9seaux',
  ],
  professionnel: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, votre image en ligne en 3 minutes',
    '{{company}} \u2014 la visibilit\u00E9 qui vous manque',
    'Ce que font les pros qui attirent des clients en ligne',
  ],
  agence: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, 2h gagn\u00E9es par client par semaine',
    '{{company}} \u2014 automatisez le contenu de vos clients',
    'L\u2019outil que vos concurrents utilisent d\u00E9j\u00E0',
  ],
  pme: [
    'Question rapide sur {{company}} ?',
    'J\u2019ai une id\u00E9e pour {{company}}',
    '{{first_name}}, votre comm\u2019 pro en 3 minutes ?',
    '{{company}} \u2014 marque employeur + r\u00E9seaux sociaux',
    'Ce qui diff\u00E9rencie les PME visibles en ligne',
  ],
};

/**
 * Returns the subject line variants for email 1 of a given category.
 */
export function getSubjectVariants(category: string): string[] {
  return SUBJECT_VARIANTS[category] ?? SUBJECT_VARIANTS.pme;
}

// ---------------------------------------------------------------------------
// Template bodies per category
// ---------------------------------------------------------------------------

interface BodyTemplate {
  text: string;
  html: string;
  attachmentName?: string;
}

interface TemplateSet {
  subjects: string[];
  bodies: BodyTemplate[];
}

function restaurantTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.restaurant,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} en cherchant les meilleurs restos du {{quartier}}.

{{note_google}} sur Google, c\u2019est top. Mais saviez-vous que 72% des 18-35 ans choisissent leur restaurant sur Instagram AVANT de r\u00E9server ?

Le probl\u00E8me : cr\u00E9er du contenu pro entre deux services, c\u2019est impossible.

Avec KeiroAI, vous g\u00E9n\u00E9rez des visuels et vid\u00E9os pro de vos plats en 3 minutes. Pas besoin de photographe, pas besoin de graphiste.

5 couverts en plus par mois et c\u2019est rentabilis\u00E9. Le reste, c\u2019est du profit pur.

\u2192 Voyez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> en cherchant les meilleurs restos du {{quartier}}.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{note_google}} sur Google</strong>, c\u2019est top. Mais saviez-vous que <strong>72% des 18-35 ans</strong> choisissent leur restaurant sur Instagram AVANT de r\u00E9server ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">Le probl\u00E8me : cr\u00E9er du contenu pro entre deux services, c\u2019est impossible.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous g\u00E9n\u00E9rez des visuels et vid\u00E9os pro de vos plats en <strong>3 minutes</strong>. Pas besoin de photographe, pas besoin de graphiste.</p>
<p style="margin:0 0 14px 0;font-size:15px;background:#f9fafb;padding:12px;border-radius:6px;"><strong>5 couverts en plus par mois et c\u2019est rentabilis\u00E9. Le reste, c\u2019est du profit pur.</strong></p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=restaurant')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai pris 2 minutes pour cr\u00E9er un visuel type pour un resto comme {{company}}.

Cliquez ici pour voir le r\u00E9sultat : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=restaurant_e2

Imaginez \u00E7a avec VOTRE logo, VOS plats, VOS couleurs. G\u00E9n\u00E9r\u00E9 en 3 min. Pr\u00EAt \u00E0 poster sur Instagram.

5 couverts en plus par mois et c\u2019est pay\u00E9. Tout le reste, c\u2019est du profit pur.

\u2192 Testez avec vos propres plats : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai pris 2 minutes pour cr\u00E9er un visuel type pour un resto comme <strong>{{company}}</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Voici le genre de r\u00E9sultat que vous pourriez obtenir \u2014 <strong>en 3 min</strong>, sans graphiste.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez \u00E7a avec <strong>VOTRE</strong> logo, <strong>VOS</strong> plats, <strong>VOS</strong> couleurs. G\u00E9n\u00E9r\u00E9 en 3 min. Pr\u00EAt \u00E0 poster sur Instagram.</p>
<p style="margin:0 0 14px 0;font-size:15px;background:#f9fafb;padding:12px;border-radius:6px;"><strong>5 couverts en plus par mois et c\u2019est pay\u00E9. Tout le reste, c\u2019est du profit pur.</strong></p>
${ctaButtonHtml('Testez gratuitement avec vos plats \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=restaurant_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : vos concurrents dans le {{quartier}} postent d\u00E9j\u00E0 sur Instagram et TikTok. Chaque jour sans contenu, ce sont des clients qui d\u00E9couvrent un autre resto.

La bonne nouvelle ? En 10 min par semaine, vous pouvez avoir plus de contenu que la plupart des restos.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les restos qui postent 3x/semaine voient +40% de r\u00E9servations via les r\u00E9seaux. C\u2019est pas moi qui le dis, c\u2019est l\u2019\u00E9tude Zenchef 2025.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : vos concurrents dans le {{quartier}} postent d\u00E9j\u00E0 sur Instagram et TikTok. <strong>Chaque jour sans contenu, ce sont des clients qui d\u00E9couvrent un autre resto.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">La bonne nouvelle ? En <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que la plupart des restos.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=restaurant_e3')}
${psLineHtml('Les restos qui postent 3x/semaine voient <strong>+40% de r\u00E9servations</strong> via les r\u00E9seaux. C\u2019est pas moi qui le dis, c\u2019est l\u2019\u00E9tude Zenchef 2025.')}`,
      },
    ],
  };
}

function boutiqueTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.boutique,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} dans le {{quartier}} \u2014 vos produits m\u00E9ritent d\u2019\u00EAtre vus par plus de monde.

80% des d\u00E9couvertes de boutiques se font sur Instagram et TikTok. Vos produits sont beaux, mais si personne ne les voit en ligne, c\u2019est comme si ils n\u2019existaient pas.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour vos produits en 3 minutes. Sans photographe, sans graphiste.

UNE vente en plus par mois et c\u2019est pay\u00E9.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> dans le {{quartier}} \u2014 vos produits m\u00E9ritent d\u2019\u00EAtre vus par plus de monde.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>80% des d\u00E9couvertes de boutiques</strong> se font sur Instagram et TikTok. Vos produits sont beaux, mais si personne ne les voit en ligne, c\u2019est comme si ils n\u2019existaient pas.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour vos produits en <strong>3 minutes</strong>. Sans photographe, sans graphiste.</p>
<p style="margin:0 0 14px 0;font-size:15px;background:#f9fafb;padding:12px;border-radius:6px;"><strong>UNE vente en plus par mois et c\u2019est pay\u00E9.</strong></p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=boutique')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel type pour une boutique comme la v\u00F4tre.

Testez par vous-m\u00EAme ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=boutique_e2

Imaginez vos produits mis en valeur comme \u00E7a, avec votre identit\u00E9 visuelle. G\u00E9n\u00E9r\u00E9 en 3 min. Pr\u00EAt \u00E0 poster.

1 vente en plus. 1 seule. Et votre abonnement est rembours\u00E9.

\u2192 Testez avec vos propres produits : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel type pour une boutique comme la v\u00F4tre \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez vos produits mis en valeur comme \u00E7a, avec <strong>votre identit\u00E9 visuelle</strong>. G\u00E9n\u00E9r\u00E9 en 3 min. Pr\u00EAt \u00E0 poster.</p>
<p style="margin:0 0 14px 0;font-size:15px;background:#f9fafb;padding:12px;border-radius:6px;"><strong>1 vente en plus. 1 seule. Et votre abonnement est rembours\u00E9.</strong></p>
${ctaButtonHtml('Testez avec vos produits \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=boutique_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer
      {
        text: `{{first_name}},

Je serai direct : pendant que vous lisez cet email, vos concurrents dans le {{quartier}} postent sur Instagram et TikTok. Chaque jour sans contenu, ce sont des clients qui ach\u00E8tent ailleurs.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des boutiques.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les boutiques qui postent r\u00E9guli\u00E8rement sur Instagram vendent en moyenne 35% de plus en ligne. Source : Shopify 2025.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : pendant que vous lisez cet email, vos concurrents dans le {{quartier}} postent sur Instagram et TikTok. <strong>Chaque jour sans contenu, ce sont des clients qui ach\u00E8tent ailleurs.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des boutiques.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=boutique_e3')}
${psLineHtml('Les boutiques qui postent r\u00E9guli\u00E8rement sur Instagram vendent en moyenne <strong>35% de plus en ligne</strong>. Source : Shopify 2025.')}`,
      },
    ],
  };
}

function coachTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.coach,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

J\u2019ai vu que {{company}} propose des s\u00E9ances dans le {{quartier}} \u2014 super concept.

Le probl\u00E8me de la plupart des coachs ? Trouver de nouveaux clients sans y passer des heures sur les r\u00E9seaux.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pour Instagram et TikTok en 3 min. 1 s\u00E9ance en plus et c\u2019est rembours\u00E9.

Et un client coaching reste en moyenne 8 \u00E0 12 mois. Le ROI est \u00E9norme.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai vu que <strong>{{company}}</strong> propose des s\u00E9ances dans le {{quartier}} \u2014 super concept.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Le probl\u00E8me de la plupart des coachs ? Trouver de nouveaux clients sans y passer des heures sur les r\u00E9seaux.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pour Instagram et TikTok en <strong>3 min</strong>. <strong>1 s\u00E9ance en plus et c\u2019est rembours\u00E9.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Et un client coaching reste en moyenne <strong>8 \u00E0 12 mois</strong>. Le ROI est \u00E9norme.</p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=coach')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai cr\u00E9\u00E9 un exemple de visuel pour un coach \u2014 testez vous-m\u00EAme ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=coach_e2

Imaginez \u00E7a avec votre marque, vos couleurs, votre offre. 3 min chrono.

1 nouveau client = 8 mois de s\u00E9ances. C\u2019est le meilleur investissement marketing possible.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai cr\u00E9\u00E9 un exemple de visuel pour un coach \u2014 testez vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez \u00E7a avec <strong>votre marque</strong>, <strong>vos couleurs</strong>, <strong>votre offre</strong>. 3 min chrono.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 nouveau client = 8 mois de s\u00E9ances.</strong> C\u2019est le meilleur investissement marketing possible.</p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=coach_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : d\u2019autres coachs dans le {{quartier}} attirent d\u00E9j\u00E0 des clients via Instagram. Chaque jour sans contenu, ce sont des clients qui trouvent un autre coach.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des coachs.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les coachs qui postent 3x/semaine ont en moyenne 60% de clients en plus. Le personal branding, c\u2019est le nouveau bouche-\u00E0-oreille.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : d\u2019autres coachs dans le {{quartier}} attirent d\u00E9j\u00E0 des clients via Instagram. <strong>Chaque jour sans contenu, ce sont des clients qui trouvent un autre coach.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des coachs.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=coach_e3')}
${psLineHtml('Les coachs qui postent 3x/semaine ont en moyenne <strong>60% de clients en plus</strong>. Le personal branding, c\u2019est le nouveau bouche-\u00E0-oreille.')}`,
      },
    ],
  };
}

function coiffeurTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.coiffeur,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

{{company}} dans le {{quartier}}, {{note_google}} sur Google \u2014 vos clients sont fans.

Mais Instagram c\u2019est l\u00E0 o\u00F9 les nouveaux clients vous d\u00E9couvrent. Et cr\u00E9er du contenu entre deux coupes, c\u2019est mission impossible.

Avec KeiroAI : visuels + vid\u00E9os en 3 min. 3 coupes en plus par mois et c\u2019est pay\u00E9.

Un client fid\u00E8le en coiffure, c\u2019est 1000\u20AC sur 2 ans.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{company}}</strong> dans le {{quartier}}, <strong>{{note_google}} sur Google</strong> \u2014 vos clients sont fans.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Mais Instagram c\u2019est l\u00E0 o\u00F9 les nouveaux clients vous d\u00E9couvrent. Et cr\u00E9er du contenu entre deux coupes, c\u2019est mission impossible.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI : visuels + vid\u00E9os en <strong>3 min</strong>. <strong>3 coupes en plus par mois et c\u2019est pay\u00E9.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Un client fid\u00E8le en coiffure, c\u2019est <strong>1000\u20AC sur 2 ans</strong>.</p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=coiffeur')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel pour un salon comme le v\u00F4tre \u2014 testez ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=coiffeur_e2

Avec vos r\u00E9alisations et votre logo, \u00E7a d\u00E9chire. 3 min de cr\u00E9ation.

3 coupes en plus. Client fid\u00E8le = 1000\u20AC sur 2 ans.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel pour un salon comme le v\u00F4tre \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec vos r\u00E9alisations et votre logo, \u00E7a d\u00E9chire. <strong>3 min</strong> de cr\u00E9ation.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>3 coupes en plus. Client fid\u00E8le = 1000\u20AC sur 2 ans.</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=coiffeur_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : d\u2019autres salons dans le {{quartier}} montrent d\u00E9j\u00E0 leurs cr\u00E9ations. Chaque jour sans contenu, ce sont des clients qui prennent RDV ailleurs.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des salons.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Un client fid\u00E8le en coiffure, c\u2019est 1000\u20AC sur 2 ans. 3 coupes en plus par mois et votre abonnement est pay\u00E9 10 fois.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : d\u2019autres salons dans le {{quartier}} montrent d\u00E9j\u00E0 leurs cr\u00E9ations. <strong>Chaque jour sans contenu, ce sont des clients qui prennent RDV ailleurs.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des salons.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=coiffeur_e3')}
${psLineHtml('Un client fid\u00E8le en coiffure, c\u2019est <strong>1000\u20AC sur 2 ans</strong>. 3 coupes en plus par mois et votre abonnement est pay\u00E9 10 fois.')}`,
      },
    ],
  };
}

function cavisteTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.caviste,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

{{company}} dans le {{quartier}} \u2014 belle s\u00E9lection.

Les cavistes qui postent r\u00E9guli\u00E8rement sur Instagram vendent 30% de plus aux p\u00E9riodes cl\u00E9s (No\u00EBl, f\u00EAtes). Mais qui a le temps de cr\u00E9er du contenu ?

KeiroAI g\u00E9n\u00E8re vos visuels et vid\u00E9os en 3 min. 2 paniers en plus et c\u2019est pay\u00E9.

Avant No\u00EBl, 1 post bien fait = 10 commandes minimum.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{company}}</strong> dans le {{quartier}} \u2014 belle s\u00E9lection.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Les cavistes qui postent r\u00E9guli\u00E8rement sur Instagram vendent <strong>30% de plus</strong> aux p\u00E9riodes cl\u00E9s (No\u00EBl, f\u00EAtes). Mais qui a le temps de cr\u00E9er du contenu ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">KeiroAI g\u00E9n\u00E8re vos visuels et vid\u00E9os en <strong>3 min</strong>. <strong>2 paniers en plus et c\u2019est pay\u00E9.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Avant No\u00EBl, 1 post bien fait = 10 commandes minimum.</p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=caviste')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel pour un caviste \u2014 testez ici avec vos bouteilles : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=caviste_e2

2 paniers en plus par mois. Avant No\u00EBl, 1 post = 10 commandes.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel pour un caviste \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>2 paniers en plus par mois. Avant No\u00EBl, 1 post = 10 commandes.</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=caviste_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : d\u2019autres cavistes attirent des clients avec des contenus inspirants. Chaque jour sans contenu, la p\u00E9riode des f\u00EAtes n\u2019attend pas.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des cavistes.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les cavistes actifs sur Instagram vendent 30% de plus pendant les f\u00EAtes. La prochaine p\u00E9riode cl\u00E9 approche.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : d\u2019autres cavistes attirent des clients avec des contenus inspirants. <strong>Chaque jour sans contenu, la p\u00E9riode des f\u00EAtes n\u2019attend pas.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des cavistes.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=caviste_e3')}
${psLineHtml('Les cavistes actifs sur Instagram vendent <strong>30% de plus</strong> pendant les f\u00EAtes. La prochaine p\u00E9riode cl\u00E9 approche.')}`,
      },
    ],
  };
}

function fleuristeTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.fleuriste,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

{{company}} dans le {{quartier}} \u2014 vos cr\u00E9ations sont magnifiques.

Instagram est LE r\u00E9seau des fleuristes. Mais entre les commandes et les compositions, qui a le temps de poster ?

KeiroAI g\u00E9n\u00E8re vos visuels en 3 min. 2 bouquets en plus et c\u2019est pay\u00E9. F\u00EAte des m\u00E8res = jackpot.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{company}}</strong> dans le {{quartier}} \u2014 vos cr\u00E9ations sont magnifiques.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Instagram est <strong>LE</strong> r\u00E9seau des fleuristes. Mais entre les commandes et les compositions, qui a le temps de poster ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">KeiroAI g\u00E9n\u00E8re vos visuels en <strong>3 min</strong>. <strong>2 bouquets en plus et c\u2019est pay\u00E9. F\u00EAte des m\u00E8res = jackpot.</strong></p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=fleuriste')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel pour un fleuriste \u2014 testez ici avec vos compositions : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=fleuriste_e2

2 bouquets en plus par mois. Et la f\u00EAte des m\u00E8res arrive...

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel pour un fleuriste \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>2 bouquets en plus par mois. Et la f\u00EAte des m\u00E8res arrive...</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=fleuriste_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : d\u2019autres fleuristes dans le {{quartier}} montrent d\u00E9j\u00E0 leurs compositions. Chaque jour sans contenu, ce sont des clients qui commandent ailleurs.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des fleuristes.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Instagram est le r\u00E9seau #1 des fleuristes. 2 bouquets en plus par mois et c\u2019est pay\u00E9.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : d\u2019autres fleuristes dans le {{quartier}} montrent d\u00E9j\u00E0 leurs compositions. <strong>Chaque jour sans contenu, ce sont des clients qui commandent ailleurs.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des fleuristes.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=fleuriste_e3')}
${psLineHtml('Instagram est le r\u00E9seau <strong>#1 des fleuristes</strong>. 2 bouquets en plus par mois et c\u2019est pay\u00E9.')}`,
      },
    ],
  };
}

function freelanceTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.freelance,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} \u2014 votre expertise m\u00E9rite clairement plus de visibilit\u00E9.

LinkedIn et Instagram sont les meilleurs canaux pour un freelance, mais cr\u00E9er du contenu prend un temps fou quand on g\u00E8re d\u00E9j\u00E0 ses clients.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour votre personal branding en 3 min.

1 client en plus gr\u00E2ce \u00E0 vos posts et c\u2019est pay\u00E9 pour 3 mois. Le personal branding, c\u2019est le meilleur investissement.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> \u2014 votre expertise m\u00E9rite clairement plus de visibilit\u00E9.</p>
<p style="margin:0 0 14px 0;font-size:15px;">LinkedIn et Instagram sont les meilleurs canaux pour un freelance, mais cr\u00E9er du contenu prend un temps fou quand on g\u00E8re d\u00E9j\u00E0 ses clients.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour votre personal branding en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 client en plus gr\u00E2ce \u00E0 vos posts et c\u2019est pay\u00E9 pour 3 mois.</strong> Le personal branding, c\u2019est le meilleur investissement.</p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=freelance')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel pour un freelance \u2014 testez ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=freelance_e2

Imaginez \u00E7a avec votre marque personnelle. G\u00E9n\u00E9r\u00E9 en 3 min.

1 client en plus = des mois de missions. C\u2019est le meilleur investissement marketing possible.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel pour un freelance \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez \u00E7a avec <strong>votre marque personnelle</strong>. G\u00E9n\u00E9r\u00E9 en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 client en plus = des mois de missions.</strong> C\u2019est le meilleur investissement marketing possible.</p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=freelance_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : d\u2019autres freelances dans votre domaine publient d\u00E9j\u00E0 sur LinkedIn et Instagram. Chaque jour sans contenu, ce sont des missions qui vont \u00E0 un concurrent plus visible.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des freelances.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les freelances actifs sur LinkedIn re\u00E7oivent 3x plus de demandes de devis. Le personal branding, c\u2019est le meilleur investissement.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : d\u2019autres freelances dans votre domaine publient d\u00E9j\u00E0 sur LinkedIn et Instagram. <strong>Chaque jour sans contenu, ce sont des missions qui vont \u00E0 un concurrent plus visible.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des freelances.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=freelance_e3')}
${psLineHtml('Les freelances actifs sur LinkedIn re\u00E7oivent <strong>3x plus de demandes de devis</strong>. Le personal branding, c\u2019est le meilleur investissement.')}`,
      },
    ],
  };
}

function servicesTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.services,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} dans le {{quartier}} \u2014 vos r\u00E9alisations parlent d\u2019elles-m\u00EAmes.

Les photos avant/apr\u00E8s sur les r\u00E9seaux, c\u2019est ce qui g\u00E9n\u00E8re le plus de demandes de devis. +30% en moyenne. Mais cr\u00E9er du contenu entre deux chantiers, c\u2019est mission impossible.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros en 3 min.

1 devis en plus et c\u2019est pay\u00E9.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> dans le {{quartier}} \u2014 vos r\u00E9alisations parlent d\u2019elles-m\u00EAmes.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Les photos avant/apr\u00E8s sur les r\u00E9seaux, c\u2019est ce qui g\u00E9n\u00E8re le plus de demandes de devis. <strong>+30% en moyenne</strong>. Mais cr\u00E9er du contenu entre deux chantiers, c\u2019est mission impossible.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 devis en plus et c\u2019est pay\u00E9.</strong></p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=services')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel pour mettre en valeur vos r\u00E9alisations \u2014 testez ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=services_e2

Imaginez vos chantiers et votre savoir-faire pr\u00E9sent\u00E9s comme \u00E7a. G\u00E9n\u00E9r\u00E9 en 3 min.

1 devis en plus par mois et c\u2019est rembours\u00E9.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel pour mettre en valeur vos r\u00E9alisations \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez vos chantiers et votre savoir-faire pr\u00E9sent\u00E9s comme \u00E7a. G\u00E9n\u00E9r\u00E9 en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 devis en plus par mois et c\u2019est rembours\u00E9.</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=services_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : vos concurrents dans le {{quartier}} montrent d\u00E9j\u00E0 leurs r\u00E9alisations. Chaque jour sans contenu, ce sont des devis qui vont \u00E0 un concurrent plus visible.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des artisans.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les artisans qui postent des avant/apr\u00E8s re\u00E7oivent +30% de demandes de devis. Source : \u00E9tude BTP Digital 2025.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : vos concurrents dans le {{quartier}} montrent d\u00E9j\u00E0 leurs r\u00E9alisations. <strong>Chaque jour sans contenu, ce sont des devis qui vont \u00E0 un concurrent plus visible.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des artisans.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=services_e3')}
${psLineHtml('Les artisans qui postent des avant/apr\u00E8s re\u00E7oivent <strong>+30% de demandes de devis</strong>. Source : \u00E9tude BTP Digital 2025.')}`,
      },
    ],
  };
}

function professionnelTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.professionnel,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} dans le {{quartier}} \u2014 votre image professionnelle est cl\u00E9.

Aujourd\u2019hui, la confiance passe par la visibilit\u00E9 en ligne. Vos patients ou clients vous cherchent sur Google et les r\u00E9seaux. Une communication sobre et pro fait toute la diff\u00E9rence.

Avec KeiroAI, vous cr\u00E9ez des visuels professionnels en 3 min, pas en 3 heures.

1 consultation en plus et c\u2019est rembours\u00E9.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> dans le {{quartier}} \u2014 votre image professionnelle est cl\u00E9.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Aujourd\u2019hui, la confiance passe par la visibilit\u00E9 en ligne. Vos patients ou clients vous cherchent sur Google et les r\u00E9seaux. Une communication sobre et pro fait toute la diff\u00E9rence.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels professionnels en <strong>3 min</strong>, pas en 3 heures.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 consultation en plus et c\u2019est rembours\u00E9.</strong></p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=professionnel')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

J\u2019ai imagin\u00E9 un visuel pour un professionnel comme vous \u2014 testez ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=professionnel_e2

Imaginez votre image de marque mise en valeur comme \u00E7a. G\u00E9n\u00E9r\u00E9 en 3 min.

Une pr\u00E9sence en ligne professionnelle attire la confiance et les nouveaux clients.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai imagin\u00E9 un visuel pour un professionnel comme vous \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez votre image de marque mise en valeur comme \u00E7a. G\u00E9n\u00E9r\u00E9 en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>Une pr\u00E9sence en ligne professionnelle attire la confiance et les nouveaux clients.</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=professionnel_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : vos confr\u00E8res ont d\u00E9j\u00E0 une pr\u00E9sence en ligne professionnelle. Chaque jour sans contenu, ce sont des patients/clients qui trouvent un autre praticien.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des professionnels.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('72% des patients cherchent leur praticien en ligne avant de prendre RDV. La confiance passe par la visibilit\u00E9.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : vos confr\u00E8res ont d\u00E9j\u00E0 une pr\u00E9sence en ligne professionnelle. <strong>Chaque jour sans contenu, ce sont des patients/clients qui trouvent un autre praticien.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des professionnels.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=professionnel_e3')}
${psLineHtml('72% des patients cherchent leur praticien en ligne avant de prendre RDV. <strong>La confiance passe par la visibilit\u00E9.</strong>')}`,
      },
    ],
  };
}

function agenceTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.agence,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} \u2014 vous g\u00E9rez le contenu de plusieurs clients, et je sais que \u00E7a prend un temps fou.

Imaginez pouvoir automatiser la cr\u00E9ation de visuels et vid\u00E9os pour chacun de vos clients. 2h gagn\u00E9es par client par semaine.

Avec KeiroAI, vous pouvez scaler votre offre contenu sans embaucher. 3 min par visuel, qualit\u00E9 pro.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> \u2014 vous g\u00E9rez le contenu de plusieurs clients, et je sais que \u00E7a prend un temps fou.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez pouvoir automatiser la cr\u00E9ation de visuels et vid\u00E9os pour chacun de vos clients. <strong>2h gagn\u00E9es par client par semaine</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous pouvez scaler votre offre contenu sans embaucher. <strong>3 min</strong> par visuel, qualit\u00E9 pro.</p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=agence')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

Testez par vous-m\u00EAme ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=agence_e2 \u2014 imaginez du contenu pour vos clients en 3 min.

Vous pourriez livrer du contenu de qualit\u00E9 \u00E0 chaque client, montrer votre portfolio, et gagner du temps.

2h gagn\u00E9es par client par semaine = plus de clients sans embaucher.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Testez par vous-m\u00EAme \u2014 imaginez du contenu pour vos clients en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Vous pourriez livrer du contenu de qualit\u00E9 \u00E0 chaque client, montrer votre portfolio, et gagner du temps.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>2h gagn\u00E9es par client par semaine = plus de clients sans embaucher.</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=agence_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : d\u2019autres agences automatisent d\u00E9j\u00E0 la cr\u00E9ation de contenu. Chaque jour sans automatisation, c\u2019est du temps que vous pourriez facturer.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des agences.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les agences qui automatisent le contenu gagnent 2h par client par semaine. C\u2019est du temps que vous pouvez facturer.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : d\u2019autres agences automatisent d\u00E9j\u00E0 la cr\u00E9ation de contenu. <strong>Chaque jour sans automatisation, c\u2019est du temps que vous pourriez facturer.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des agences.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=agence_e3')}
${psLineHtml('Les agences qui automatisent le contenu gagnent <strong>2h par client par semaine</strong>. C\u2019est du temps que vous pouvez facturer.')}`,
      },
    ],
  };
}

function pmeTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.pme,
    bodies: [
      // Email 1 — Hook + social proof + CTA
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} \u2014 votre communication m\u00E9rite d\u2019\u00EAtre \u00E0 la hauteur de votre entreprise.

La marque employeur et la visibilit\u00E9 sur les r\u00E9seaux sociaux sont devenues indispensables. Mais cr\u00E9er du contenu corporate prend du temps.

Avec KeiroAI : communication pro en 3 min, pas en 3 heures.

Marque employeur + r\u00E9seaux = recrutement et visibilit\u00E9.

\u2192 Testez gratuitement : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> \u2014 votre communication m\u00E9rite d\u2019\u00EAtre \u00E0 la hauteur de votre entreprise.</p>
<p style="margin:0 0 14px 0;font-size:15px;">La marque employeur et la visibilit\u00E9 sur les r\u00E9seaux sociaux sont devenues indispensables. Mais cr\u00E9er du contenu corporate prend du temps.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI : <strong>communication pro en 3 min</strong>, pas en 3 heures.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>Marque employeur + r\u00E9seaux = recrutement et visibilit\u00E9.</strong></p>
${ctaButtonHtml('Voir un exemple gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=pme')}
${socialProofHtml()}
${psLineHtml('Essai gratuit 7 jours, tous les agents d\u00E9bloqu\u00E9s. Carte requise, aucun d\u00E9bit.')}`,
      },
      // Email 2 — Visual proof + ROI + CTA
      {
        text: `{{first_name}},

Testez par vous-m\u00EAme ici : https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=pme_e2 \u2014 imaginez votre marque sur tous les r\u00E9seaux.

Une image professionnelle coh\u00E9rente, g\u00E9n\u00E9r\u00E9e en 3 min.

Communication corporate pro = confiance, recrutement et visibilit\u00E9.

\u2192 Testez par vous-m\u00EAme : https://keiroai.com

Victor
KeiroAI${psLineText('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Testez par vous-m\u00EAme \u2014 imaginez votre marque sur tous les r\u00E9seaux.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Une image professionnelle coh\u00E9rente, g\u00E9n\u00E9r\u00E9e en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>Communication corporate pro = confiance, recrutement et visibilit\u00E9.</strong></p>
${ctaButtonHtml('Testez gratuitement \u2192', 'https://keiroai.com/generate?utm_source=email&utm_medium=cold&utm_campaign=pme_e2')}
${psLineHtml('Essai gratuit 7 jours — tous les agents IA débloqués. Carte requise, 0€ débité.')}`,
      },
      // Email 3 — Urgency closer + FOMO
      {
        text: `{{first_name}},

Je serai direct : vos concurrents communiquent d\u00E9j\u00E0 sur les r\u00E9seaux. Chaque jour sans contenu, c\u2019est une visibilit\u00E9 que vous laissez \u00E0 d\u2019autres.

Bonne nouvelle : en 10 min par semaine, vous pouvez avoir plus de contenu que 90% des PME.

Ce que je vous propose :
\u2192 3 cr\u00E9ations gratuites pour tester (aucune carte bancaire)
\u2192 Ou l\u2019essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)

Apr\u00E8s, vous d\u00E9ciderez.

Victor
KeiroAI${psLineText('Les PME actives sur les r\u00E9seaux voient +25% de candidatures et +40% de demandes entrantes.')}`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je serai direct : vos concurrents communiquent d\u00E9j\u00E0 sur les r\u00E9seaux. <strong>Chaque jour sans contenu, c\u2019est une visibilit\u00E9 que vous laissez \u00E0 d\u2019autres.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Bonne nouvelle : en <strong>10 min par semaine</strong>, vous pouvez avoir plus de contenu que 90% des PME.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Ce que je vous propose :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">\u2192 <strong>Essai gratuit 7 jours</strong> : tous les agents IA d\u00E9bloqu\u00E9s<br/>\u2192 <strong>Carte requise, 0\u20AC d\u00E9bit\u00E9</strong> \u2014 annulation \u00E0 tout moment</p>
${ctaButtonHtml('Cr\u00E9er mon premier visuel gratuit \u2192', 'https://keiroai.com?utm_source=email&utm_medium=cold&utm_campaign=pme_e3')}
${psLineHtml('Les PME actives sur les r\u00E9seaux voient <strong>+25% de candidatures</strong> et <strong>+40% de demandes entrantes</strong>.')}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// ROI phrases (used in warm template)
// ---------------------------------------------------------------------------

const ROI_PHRASES: Record<string, string> = {
  restaurant:
    '5 couverts en plus par mois et votre abonnement est rentabilis\u00E9. Tout le reste, c\u2019est du profit pur.',
  boutique:
    'UNE vente en plus par mois. Une seule. Et votre abonnement est rembours\u00E9.',
  coach:
    'UNE s\u00E9ance en plus et c\u2019est rembours\u00E9. Et un client coaching reste en moyenne 8 \u00E0 12 mois.',
  coiffeur:
    '3 coupes en plus par mois. Un client fid\u00E8le en coiffure, c\u2019est 1000\u20AC sur 2 ans.',
  caviste:
    '2 paniers en plus. Avant No\u00EBl, 1 post bien fait = 10 commandes minimum.',
  fleuriste:
    '2 bouquets en plus par mois. Et la f\u00EAte des m\u00E8res ? C\u2019est le jackpot.',
  traiteur:
    '1 contrat \u00E9v\u00E9nementiel en plus et c\u2019est pay\u00E9 pour 6 mois.',
  freelance:
    '1 client en plus gr\u00E2ce \u00E0 vos r\u00E9seaux et c\u2019est pay\u00E9 pour 3 mois. Le personal branding, c\u2019est le meilleur investissement.',
  services:
    '1 devis en plus par mois. Une photo avant/apr\u00E8s bien post\u00E9e = +30% de demandes.',
  professionnel:
    '1 consultation en plus et c\u2019est rembours\u00E9. L\u2019image de marque attire la confiance.',
  agence:
    '2h gagn\u00E9es par client par semaine. Contenu automatis\u00E9 = plus de clients sans embaucher.',
  pme:
    'Communication corporate pro en 3 min. Marque employeur + r\u00E9seaux = recrutement et visibilit\u00E9.',
};

// ---------------------------------------------------------------------------
// Warm template (from chatbot lead -> email follow-up, step=10)
// ---------------------------------------------------------------------------

function warmTemplateBody(roiPhrase: string): BodyTemplate {
  return {
    text: `{{first_name}},

Suite \u00E0 notre \u00E9change sur le site, j\u2019ai pr\u00E9par\u00E9 quelque chose pour {{company}} \u2014 testez ici : https://keiroai.com/generate?utm_source=email&utm_medium=warm&utm_campaign=chatbot

${roiPhrase}

Deux options pour d\u00E9marrer :
- Essai gratuit 7 jours (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)
- D\u00E9mo de 15 min avec moi

\u2192 Commencer maintenant : https://keiroai.com/pricing

R\u00E9pondez \u00E0 cet email et je m\u2019occupe de tout.

Victor
KeiroAI${psLineText('Plus de 200 entrepreneurs utilisent d\u00E9j\u00E0 KeiroAI pour leur marketing. Rejoignez-les.')}`,
    html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Suite \u00E0 notre \u00E9change sur le site, j\u2019ai pr\u00E9par\u00E9 quelque chose pour <strong>{{company}}</strong> \u2014 testez par vous-m\u00EAme en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>${roiPhrase}</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Deux options pour d\u00E9marrer :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">&bull; <strong>Essai gratuit 7 jours</strong> (tous les agents IA, carte requise, 0\u20AC d\u00E9bit\u00E9)<br/>&bull; <strong>D\u00E9mo de 15 min</strong> avec moi</p>
${ctaButtonHtml('Commencer maintenant \u2192', 'https://keiroai.com/pricing?utm_source=email&utm_medium=warm&utm_campaign=chatbot')}
<p style="margin:0 0 14px 0;font-size:15px;">R\u00E9pondez \u00E0 cet email et je m\u2019occupe de tout.</p>
${psLineHtml('Plus de 200 entrepreneurs utilisent d\u00E9j\u00E0 KeiroAI pour leur marketing. Rejoignez-les.')}`,
  };
}

// ---------------------------------------------------------------------------
// Category -> Template Set mapping
// ---------------------------------------------------------------------------

function getTemplateSet(category: string): TemplateSet {
  switch (category) {
    case 'restaurant':
      return restaurantTemplates();
    case 'boutique':
      return boutiqueTemplates();
    case 'coach':
      return coachTemplates();
    case 'coiffeur':
      return coiffeurTemplates();
    case 'caviste':
      return cavisteTemplates();
    case 'fleuriste':
      return fleuristeTemplates();
    case 'freelance':
      return freelanceTemplates();
    case 'services':
      return servicesTemplates();
    case 'professionnel':
      return professionnelTemplates();
    case 'agence':
      return agenceTemplates();
    case 'pme':
      return pmeTemplates();
    default:
      return pmeTemplates();
  }
}

// ---------------------------------------------------------------------------
// Main export: getEmailTemplate
// ---------------------------------------------------------------------------

/**
 * Get an email template for a given category, sequence step, and variables.
 *
 * @param category       - Business category (restaurant, boutique, coach, coiffeur, caviste, fleuriste)
 * @param step           - Email step: 1, 2, or 3 for cold sequence; 10 for warm follow-up
 * @param vars           - Template variables: {{company}}, {{first_name}}, {{type}}, {{note_google}}, {{quartier}}
 * @param subjectVariant - For step 1: which subject variant (0, 1, or 2). Defaults to 0.
 * @returns EmailTemplate with subject, htmlBody, textBody, and optional attachmentName
 */
export function getEmailTemplate(
  category: string,
  step: number,
  vars: Record<string, string>,
  subjectVariant: number = 0
): EmailTemplate {
  // Warm follow-up after chatbot interaction (step=10)
  if (step === 10) {
    const roiPhrase = ROI_PHRASES[category] ?? ROI_PHRASES.pme;
    const body = warmTemplateBody(roiPhrase);
    const warmSubjects = [
      '{{first_name}}, votre visuel est pr\u00EAt \u2014 suite \u00E0 notre \u00E9change',
      'Re: {{company}} \u2014 j\u2019ai fait le visuel dont on a parl\u00E9',
      '{{first_name}}, c\u2019est pr\u00EAt ! Votre visuel {{company}}',
    ];
    const subject = replaceVars(warmSubjects[subjectVariant % warmSubjects.length], vars);

    return {
      subject,
      htmlBody: wrapHtmlEmail(subject, replaceVars(body.html, vars)),
      textBody: replaceVars(body.text, vars),
      attachmentName: body.attachmentName
        ? replaceVars(body.attachmentName, vars)
        : undefined,
    };
  }

  // Cold sequence (steps 1-3)
  const templates = getTemplateSet(category);
  const stepIndex = Math.max(0, Math.min(2, step - 1)); // clamp to 0-2
  const body = templates.bodies[stepIndex];

  // Subject selection
  let subject: string;
  if (step === 1) {
    const variantIndex = Math.max(
      0,
      Math.min(templates.subjects.length - 1, subjectVariant)
    );
    subject = replaceVars(templates.subjects[variantIndex], vars);
  } else if (step === 2) {
    const step2Subjects = [
      '{{first_name}}, j\u2019ai cr\u00E9\u00E9 un visuel pour {{company}}',
      'Re: {{company}} \u2014 votre visuel gratuit est pr\u00EAt',
      '{{first_name}}, 2 minutes pour voir ce que \u00E7a donne ?',
    ];
    subject = replaceVars(step2Subjects[subjectVariant % step2Subjects.length], vars);
  } else if (step === 3) {
    const step3Subjects = [
      '{{first_name}}, derni\u00E8re question sur {{company}}',
      'J\u2019ai remarqu\u00E9 un truc sur {{company}}...',
      '{{company}} + IA = ? (r\u00E9ponse en 3 min)',
    ];
    subject = replaceVars(step3Subjects[subjectVariant % step3Subjects.length], vars);
  } else if (step === 4) {
    const step4Subjects = [
      '{{first_name}}, on ferme le dossier {{company}} ?',
      'Dernier message \u2014 ensuite je vous laisse tranquille',
      '{{company}} \u2014 7 jours d\u2019essai gratuit (derni\u00E8re chance)',
    ];
    subject = replaceVars(step4Subjects[subjectVariant % step4Subjects.length], vars);
  } else {
    subject = replaceVars('{{first_name}}, on reste en contact ?', vars);
  }

  return {
    subject,
    htmlBody: wrapHtmlEmail(subject, replaceVars(body.html, vars)),
    textBody: replaceVars(body.text, vars),
    attachmentName: body.attachmentName
      ? replaceVars(body.attachmentName, vars)
      : undefined,
  };
}

/**
 * Generate HTML block with showcase images for a business type.
 * Used by email/DM agents to show "here's what we can do for you".
 */
export function getShowcaseImagesHtml(images: Array<{ image_url: string; title?: string }>): string {
  if (!images || images.length === 0) return '';
  const imgHtml = images.slice(0, 3).map(img =>
    `<div style="flex:1;min-width:150px;max-width:200px;text-align:center;">
      <img src="${img.image_url}" alt="${img.title || 'Exemple KeiroAI'}" style="width:100%;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
      ${img.title ? `<p style="font-size:11px;color:#888;margin:4px 0 0;">${img.title}</p>` : ''}
    </div>`
  ).join('');
  return `<div style="margin:16px 0;"><p style="font-size:13px;font-weight:bold;margin-bottom:8px;">Exemples de ce qu'on peut creer pour vous :</p><div style="display:flex;gap:12px;flex-wrap:wrap;">${imgHtml}</div></div>`;
}
