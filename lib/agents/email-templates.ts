// KeiroAI Agent System - Email Templates
// 6 categories x 3 emails + 1 warm template
// Sender: "Oussama -- KeiroAI" / contact@keiroai.com

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
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background-color:#f4f4f7;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(to right,#9333ea,#2563eb);color:white;padding:24px 20px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">${subject}</h2>
    </div>
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e5e7eb;border-top:none;">
      ${bodyHtml}
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:14px;color:#6b7280;">
        <p style="margin:0;">Oussama</p>
        <p style="margin:2px 0;color:#9333ea;font-weight:bold;">KeiroAI</p>
        <p style="margin:2px 0;font-size:13px;">contact@keiroai.com</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;color:#9ca3af;font-size:12px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
      <p style="margin:0;">KeiroAI &mdash; Marketing IA pour entrepreneurs et PME</p>
      <p style="margin:4px 0 0 0;"><a href="https://keiroai.com" style="color:#9333ea;text-decoration:none;">keiroai.com</a></p>
      <p style="margin:8px 0 0 0;font-size:11px;color:#c0c0c0;">Si vous ne souhaitez plus recevoir nos emails, <a href="{{unsubscribe_url}}" style="color:#c0c0c0;">cliquez ici</a>.</p>
    </div>
  </div>
</body>
</html>`;
}

function replaceVars(template: string, v: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(v)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  // Clean up sentences with empty variables (e.g., "du ." → remove entire phrase)
  result = result.replace(/\s+du\s+\.\s*/g, '. ');
  result = result.replace(/\s+sur Google, c'est top\.\s*/g, '. ');
  result = result.replace(/Restaurant\s+—/g, 'Votre restaurant —');
  result = result.replace(/Boutique\s+—/g, 'Votre boutique —');
  result = result.replace(/Coach\s+—/g, 'Coach —');
  result = result.replace(/Salon\s+—/g, 'Votre salon —');
  result = result.replace(/Caviste\s+—/g, 'Votre cave —');
  result = result.replace(/Fleuriste\s+—/g, 'Votre boutique —');
  result = result.replace(/\s{2,}/g, ' ');
  // Replace unsubscribe placeholder with Brevo default
  result = result.replace(/\{\{unsubscribe_url\}\}/g, 'https://keiroai.com/unsubscribe');
  return result;
}

// ---------------------------------------------------------------------------
// Subject variants per category (email 1 only)
// ---------------------------------------------------------------------------

const SUBJECT_VARIANTS: Record<string, string[]> = {
  restaurant: [
    '{{company}} \u2014 une id\u00E9e pour vos r\u00E9seaux',
    '{{company}} \u2014 vos clients vous adorent mais Instagram ne le sait pas',
    'Restaurant {{quartier}} \u2014 une question rapide',
  ],
  boutique: [
    '{{company}} \u2014 vos produits m\u00E9ritent d\u2019\u00EAtre vus',
    '{{company}} \u2014 1 vente en plus et c\u2019est pay\u00E9',
    'Boutique {{quartier}} \u2014 une id\u00E9e',
  ],
  coach: [
    '{{company}} \u2014 vos s\u00E9ances m\u00E9ritent plus de visibilit\u00E9',
    '{{company}} \u2014 1 client en plus et c\u2019est rembours\u00E9',
    'Coach {{quartier}} \u2014 une question rapide',
  ],
  coiffeur: [
    '{{company}} \u2014 une id\u00E9e pour remplir votre planning',
    '{{company}} \u2014 3 coupes en plus et c\u2019est pay\u00E9',
    'Salon {{quartier}} \u2014 une question rapide',
  ],
  caviste: [
    '{{company}} \u2014 vos vins m\u00E9ritent d\u2019\u00EAtre vus',
    '{{company}} \u2014 2 paniers en plus et c\u2019est pay\u00E9',
    'Caviste {{quartier}} \u2014 une id\u00E9e',
  ],
  fleuriste: [
    '{{company}} \u2014 vos cr\u00E9ations m\u00E9ritent Instagram',
    '{{company}} \u2014 2 bouquets en plus et c\u2019est pay\u00E9',
    'Fleuriste {{quartier}} \u2014 une id\u00E9e',
  ],
  freelance: [
    '{{company}} \u2014 votre expertise m\u00E9rite plus de visibilit\u00E9',
    '{{company}} \u2014 1 client en plus gr\u00E2ce aux r\u00E9seaux',
    'Freelance {{quartier}} \u2014 une id\u00E9e pour vous',
  ],
  services: [
    '{{company}} \u2014 vos r\u00E9alisations m\u00E9ritent d\u2019\u00EAtre vues',
    '{{company}} \u2014 1 devis en plus et c\u2019est pay\u00E9',
    '{{type}} {{quartier}} \u2014 une question rapide',
  ],
  professionnel: [
    '{{company}} \u2014 votre image de marque en ligne',
    '{{company}} \u2014 la confiance passe par la visibilit\u00E9',
    '{{type}} {{quartier}} \u2014 une id\u00E9e',
  ],
  agence: [
    '{{company}} \u2014 automatisez le contenu de vos clients',
    '{{company}} \u2014 2h gagn\u00E9es par client par semaine',
    'Agence {{quartier}} \u2014 une id\u00E9e',
  ],
  pme: [
    '{{company}} \u2014 votre communication m\u00E9rite mieux',
    '{{company}} \u2014 marque employeur + r\u00E9seaux sociaux',
    '{{type}} {{quartier}} \u2014 une question rapide',
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
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} en cherchant les meilleurs restos du {{quartier}}.

{{note_google}} sur Google, c\u2019est top. Mais saviez-vous que 72% des 18-35 ans choisissent leur restaurant sur Instagram ?

On aide les restos comme le v\u00F4tre \u00E0 transformer leur pr\u00E9sence en ligne en couverts. En 3 minutes, pas en 3 heures.

Je peux vous montrer un exemple concret avec votre carte ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> en cherchant les meilleurs restos du {{quartier}}.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{note_google}} sur Google</strong>, c\u2019est top. Mais saviez-vous que 72% des 18-35 ans choisissent leur restaurant sur Instagram ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">On aide les restos comme le v\u00F4tre \u00E0 transformer leur pr\u00E9sence en ligne en couverts. En 3 minutes, pas en 3 heures.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je peux vous montrer un exemple concret avec votre carte ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

J\u2019ai pris 2 minutes pour cr\u00E9er un visuel type pour un resto comme {{company}}.

C\u2019est en pi\u00E8ce jointe \u2014 dites-moi ce que vous en pensez.

Imaginez \u00E7a avec VOTRE logo, VOS plats, VOS couleurs. G\u00E9n\u00E9r\u00E9 en 3 min.

5 couverts en plus par mois et c\u2019est pay\u00E9. Tout le reste, c\u2019est du profit pur.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai pris 2 minutes pour cr\u00E9er un visuel type pour un resto comme <strong>{{company}}</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;">C\u2019est en pi\u00E8ce jointe \u2014 dites-moi ce que vous en pensez.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez \u00E7a avec <strong>VOTRE</strong> logo, <strong>VOS</strong> plats, <strong>VOS</strong> couleurs. G\u00E9n\u00E9r\u00E9 en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>5 couverts en plus par mois et c\u2019est pay\u00E9. Tout le reste, c\u2019est du profit pur.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Je ne vais pas vous emb\u00EAter plus. Juste une derni\u00E8re question :

Si vous pouviez poster 3 fois par semaine sur Instagram et TikTok, avec des visuels et vid\u00E9os pros, sans y passer plus de 10 min... vous le feriez ?

Si oui, on en parle 15 min. Si non, aucun souci \u2014 je vous souhaite une belle saison.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je ne vais pas vous emb\u00EAter plus. Juste une derni\u00E8re question :</p>
<p style="margin:0 0 14px 0;font-size:15px;">Si vous pouviez poster 3 fois par semaine sur Instagram et TikTok, avec des visuels et vid\u00E9os pros, sans y passer plus de 10 min... vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">Si oui, <a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">On en parle 15 min</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Si non, aucun souci \u2014 je vous souhaite une belle saison.</p>`,
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

Aujourd\u2019hui 80% des d\u00E9couvertes de boutiques se font sur les r\u00E9seaux sociaux. Le probl\u00E8me ? Cr\u00E9er du contenu prend un temps fou.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour vos produits en 3 minutes.

UNE vente en plus par mois et c\u2019est pay\u00E9. Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> dans le {{quartier}} \u2014 vos produits m\u00E9ritent d\u2019\u00EAtre vus par plus de monde.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Aujourd\u2019hui 80% des d\u00E9couvertes de boutiques se font sur les r\u00E9seaux sociaux. Le probl\u00E8me ? Cr\u00E9er du contenu prend un temps fou.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour vos produits en <strong>3 minutes</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>UNE vente en plus par mois et c\u2019est pay\u00E9.</strong> Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

J\u2019ai cr\u00E9\u00E9 un visuel type pour une boutique comme la v\u00F4tre \u2014 c\u2019est en pi\u00E8ce jointe.

Imaginez vos produits mis en valeur comme \u00E7a, avec votre identit\u00E9 visuelle. G\u00E9n\u00E9r\u00E9 en 3 min.

1 vente en plus. 1 seule. Et votre abonnement est rembours\u00E9.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai cr\u00E9\u00E9 un visuel type pour une boutique comme la v\u00F4tre \u2014 c\u2019est en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez vos produits mis en valeur comme \u00E7a, avec <strong>votre identit\u00E9 visuelle</strong>. G\u00E9n\u00E9r\u00E9 en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 vente en plus. 1 seule. Et votre abonnement est rembours\u00E9.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question et je ne vous emb\u00EAte plus :

Vos concurrents postent d\u00E9j\u00E0 sur Insta et TikTok. Si vous pouviez faire pareil en 10 min/semaine, vous le feriez ?

15 min pour vous montrer. Sinon, pas de souci \u2014 bonne continuation !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question et je ne vous emb\u00EAte plus :</p>
<p style="margin:0 0 14px 0;font-size:15px;">Vos concurrents postent d\u00E9j\u00E0 sur Insta et TikTok. Si vous pouviez faire pareil en 10 min/semaine, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min pour vous montrer</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, pas de souci \u2014 bonne continuation !</p>`,
      },
    ],
  };
}

function coachTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.coach,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

J\u2019ai vu que {{company}} propose des s\u00E9ances dans le {{quartier}} \u2014 super concept.

Le probl\u00E8me de la plupart des coachs ? Trouver de nouveaux clients sans y passer des heures sur les r\u00E9seaux.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pour Instagram et TikTok en 3 min. 1 s\u00E9ance en plus et c\u2019est rembours\u00E9.

Et un client coaching reste en moyenne 8 \u00E0 12 mois. Le ROI est \u00E9norme.

Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai vu que <strong>{{company}}</strong> propose des s\u00E9ances dans le {{quartier}} \u2014 super concept.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Le probl\u00E8me de la plupart des coachs ? Trouver de nouveaux clients sans y passer des heures sur les r\u00E9seaux.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pour Instagram et TikTok en <strong>3 min</strong>. <strong>1 s\u00E9ance en plus et c\u2019est rembours\u00E9.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Et un client coaching reste en moyenne <strong>8 \u00E0 12 mois</strong>. Le ROI est \u00E9norme.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

Voici un exemple de visuel type pour un coach \u2014 en pi\u00E8ce jointe.

Imaginez \u00E7a avec votre marque, vos couleurs, votre offre. 3 min chrono.

1 nouveau client = 8 mois de s\u00E9ances. C\u2019est le meilleur investissement marketing possible.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Voici un exemple de visuel type pour un coach \u2014 en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez \u00E7a avec <strong>votre marque</strong>, <strong>vos couleurs</strong>, <strong>votre offre</strong>. 3 min chrono.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 nouveau client = 8 mois de s\u00E9ances.</strong> C\u2019est le meilleur investissement marketing possible.</p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : si vous pouviez avoir du contenu pro pour vos r\u00E9seaux sans effort, vous le feriez ?

15 min de d\u00E9mo. Sinon, je vous souhaite plein de r\u00E9ussite !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : si vous pouviez avoir du contenu pro pour vos r\u00E9seaux sans effort, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, je vous souhaite plein de r\u00E9ussite !</p>`,
      },
    ],
  };
}

function coiffeurTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.coiffeur,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

{{company}} dans le {{quartier}}, {{note_google}} sur Google \u2014 vos clients sont fans.

Mais Instagram c\u2019est l\u00E0 o\u00F9 les nouveaux clients vous d\u00E9couvrent. Et cr\u00E9er du contenu entre deux coupes, c\u2019est mission impossible.

Avec KeiroAI : visuels + vid\u00E9os en 3 min. 3 coupes en plus par mois et c\u2019est pay\u00E9.

Un client fid\u00E8le en coiffure, c\u2019est 1000\u20AC sur 2 ans. Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{company}}</strong> dans le {{quartier}}, <strong>{{note_google}} sur Google</strong> \u2014 vos clients sont fans.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Mais Instagram c\u2019est l\u00E0 o\u00F9 les nouveaux clients vous d\u00E9couvrent. Et cr\u00E9er du contenu entre deux coupes, c\u2019est mission impossible.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI : visuels + vid\u00E9os en <strong>3 min</strong>. <strong>3 coupes en plus par mois et c\u2019est pay\u00E9.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Un client fid\u00E8le en coiffure, c\u2019est <strong>1000\u20AC sur 2 ans</strong>. Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

Un visuel type pour un salon comme le v\u00F4tre en pi\u00E8ce jointe.

Avec vos r\u00E9alisations et votre logo, \u00E7a d\u00E9chire. 3 min de cr\u00E9ation.

3 coupes en plus. Client fid\u00E8le = 1000\u20AC sur 2 ans.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Un visuel type pour un salon comme le v\u00F4tre en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec vos r\u00E9alisations et votre logo, \u00E7a d\u00E9chire. <strong>3 min</strong> de cr\u00E9ation.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>3 coupes en plus. Client fid\u00E8le = 1000\u20AC sur 2 ans.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question et promis je ne vous emb\u00EAte plus :

Vos clients adorent votre travail. Si vous pouviez le montrer au monde entier en 10 min par semaine... vous le feriez ?

15 min pour une d\u00E9mo. Sinon, bonne continuation !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question et promis je ne vous emb\u00EAte plus :</p>
<p style="margin:0 0 14px 0;font-size:15px;">Vos clients adorent votre travail. Si vous pouviez le montrer au monde entier en 10 min par semaine... vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, bonne continuation !</p>`,
      },
    ],
  };
}

function cavisteTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.caviste,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

{{company}} dans le {{quartier}} \u2014 belle s\u00E9lection.

Les cavistes qui postent r\u00E9guli\u00E8rement sur Instagram vendent 30% de plus aux p\u00E9riodes cl\u00E9s (No\u00EBl, f\u00EAtes). Mais qui a le temps de cr\u00E9er du contenu ?

KeiroAI g\u00E9n\u00E8re vos visuels et vid\u00E9os en 3 min. 2 paniers en plus et c\u2019est pay\u00E9.

Avant No\u00EBl, 1 post bien fait = 10 commandes minimum. On en parle ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{company}}</strong> dans le {{quartier}} \u2014 belle s\u00E9lection.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Les cavistes qui postent r\u00E9guli\u00E8rement sur Instagram vendent <strong>30% de plus</strong> aux p\u00E9riodes cl\u00E9s (No\u00EBl, f\u00EAtes). Mais qui a le temps de cr\u00E9er du contenu ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">KeiroAI g\u00E9n\u00E8re vos visuels et vid\u00E9os en <strong>3 min</strong>. <strong>2 paniers en plus et c\u2019est pay\u00E9.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Avant No\u00EBl, 1 post bien fait = 10 commandes minimum. On en parle ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

Un visuel type pour un caviste en pi\u00E8ce jointe \u2014 imaginez \u00E7a avec vos bouteilles.

2 paniers en plus par mois. Avant No\u00EBl, 1 post = 10 commandes.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Un visuel type pour un caviste en pi\u00E8ce jointe \u2014 imaginez \u00E7a avec vos bouteilles.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>2 paniers en plus par mois. Avant No\u00EBl, 1 post = 10 commandes.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : la p\u00E9riode des f\u00EAtes approche. Si vous pouviez avoir du contenu pr\u00EAt en 3 min pour booster vos ventes, vous le feriez ?

15 min pour une d\u00E9mo rapide. Sinon, bonnes ventes !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : la p\u00E9riode des f\u00EAtes approche. Si vous pouviez avoir du contenu pr\u00EAt en 3 min pour booster vos ventes, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, bonnes ventes !</p>`,
      },
    ],
  };
}

function fleuristeTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.fleuriste,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

{{company}} dans le {{quartier}} \u2014 vos cr\u00E9ations sont magnifiques.

Instagram est LE r\u00E9seau des fleuristes. Mais entre les commandes et les compositions, qui a le temps de poster ?

KeiroAI g\u00E9n\u00E8re vos visuels en 3 min. 2 bouquets en plus et c\u2019est pay\u00E9. F\u00EAte des m\u00E8res = jackpot.

Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>{{company}}</strong> dans le {{quartier}} \u2014 vos cr\u00E9ations sont magnifiques.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Instagram est <strong>LE</strong> r\u00E9seau des fleuristes. Mais entre les commandes et les compositions, qui a le temps de poster ?</p>
<p style="margin:0 0 14px 0;font-size:15px;">KeiroAI g\u00E9n\u00E8re vos visuels en <strong>3 min</strong>. <strong>2 bouquets en plus et c\u2019est pay\u00E9. F\u00EAte des m\u00E8res = jackpot.</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

Un visuel type pour un fleuriste en pi\u00E8ce jointe \u2014 imaginez avec vos compositions.

2 bouquets en plus par mois. Et la f\u00EAte des m\u00E8res arrive...

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Un visuel type pour un fleuriste en pi\u00E8ce jointe \u2014 imaginez avec vos compositions.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>2 bouquets en plus par mois. Et la f\u00EAte des m\u00E8res arrive...</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Vos compositions sont d\u00E9j\u00E0 magnifiques. Si vous pouviez les montrer \u00E0 des milliers de personnes chaque semaine, en 10 min... vous le feriez ?

15 min pour une d\u00E9mo. Sinon, belle saison !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Vos compositions sont d\u00E9j\u00E0 magnifiques. Si vous pouviez les montrer \u00E0 des milliers de personnes chaque semaine, en 10 min... vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, belle saison !</p>`,
      },
    ],
  };
}

function freelanceTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.freelance,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} \u2014 votre expertise m\u00E9rite clairement plus de visibilit\u00E9.

LinkedIn et Instagram sont les meilleurs canaux pour un freelance, mais cr\u00E9er du contenu prend un temps fou quand on g\u00E8re d\u00E9j\u00E0 ses clients.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour votre personal branding en 3 min.

1 client en plus gr\u00E2ce \u00E0 vos posts et c\u2019est pay\u00E9 pour 3 mois. Le personal branding, c\u2019est le meilleur investissement.

Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> \u2014 votre expertise m\u00E9rite clairement plus de visibilit\u00E9.</p>
<p style="margin:0 0 14px 0;font-size:15px;">LinkedIn et Instagram sont les meilleurs canaux pour un freelance, mais cr\u00E9er du contenu prend un temps fou quand on g\u00E8re d\u00E9j\u00E0 ses clients.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros pour votre personal branding en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 client en plus gr\u00E2ce \u00E0 vos posts et c\u2019est pay\u00E9 pour 3 mois.</strong> Le personal branding, c\u2019est le meilleur investissement.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

J\u2019ai cr\u00E9\u00E9 un visuel type pour un freelance \u2014 c\u2019est en pi\u00E8ce jointe.

Imaginez \u00E7a avec votre marque personnelle. G\u00E9n\u00E9r\u00E9 en 3 min.

1 client en plus = des mois de missions. C\u2019est le meilleur investissement marketing possible.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai cr\u00E9\u00E9 un visuel type pour un freelance \u2014 c\u2019est en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez \u00E7a avec <strong>votre marque personnelle</strong>. G\u00E9n\u00E9r\u00E9 en 3 min.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 client en plus = des mois de missions.</strong> C\u2019est le meilleur investissement marketing possible.</p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : si vous pouviez avoir du contenu pro sans effort, vous le feriez ?

15 min de d\u00E9mo. Sinon, je vous souhaite plein de r\u00E9ussite !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : si vous pouviez avoir du contenu pro sans effort, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, je vous souhaite plein de r\u00E9ussite !</p>`,
      },
    ],
  };
}

function servicesTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.services,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} dans le {{quartier}} \u2014 vos r\u00E9alisations parlent d\u2019elles-m\u00EAmes.

Les photos avant/apr\u00E8s sur les r\u00E9seaux, c\u2019est ce qui g\u00E9n\u00E8re le plus de demandes de devis. +30% en moyenne. Mais cr\u00E9er du contenu entre deux chantiers, c\u2019est mission impossible.

Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros en 3 min.

1 devis en plus et c\u2019est pay\u00E9. Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> dans le {{quartier}} \u2014 vos r\u00E9alisations parlent d\u2019elles-m\u00EAmes.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Les photos avant/apr\u00E8s sur les r\u00E9seaux, c\u2019est ce qui g\u00E9n\u00E8re le plus de demandes de devis. <strong>+30% en moyenne</strong>. Mais cr\u00E9er du contenu entre deux chantiers, c\u2019est mission impossible.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels et vid\u00E9os pros en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 devis en plus et c\u2019est pay\u00E9.</strong> Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

J\u2019ai cr\u00E9\u00E9 un visuel type pour mettre en valeur vos r\u00E9alisations \u2014 c\u2019est en pi\u00E8ce jointe.

Imaginez vos chantiers et votre savoir-faire pr\u00E9sent\u00E9s comme \u00E7a. G\u00E9n\u00E9r\u00E9 en 3 min.

1 devis en plus par mois et c\u2019est rembours\u00E9.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai cr\u00E9\u00E9 un visuel type pour mettre en valeur vos r\u00E9alisations \u2014 c\u2019est en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez vos chantiers et votre savoir-faire pr\u00E9sent\u00E9s comme \u00E7a. G\u00E9n\u00E9r\u00E9 en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 devis en plus par mois et c\u2019est rembours\u00E9.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : vos concurrents postent d\u00E9j\u00E0 sur les r\u00E9seaux. Si vous pouviez faire pareil en 10 min/semaine, vous le feriez ?

15 min pour une d\u00E9mo. Sinon, bonne continuation !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : vos concurrents postent d\u00E9j\u00E0 sur les r\u00E9seaux. Si vous pouviez faire pareil en 10 min/semaine, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, bonne continuation !</p>`,
      },
    ],
  };
}

function professionnelTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.professionnel,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} dans le {{quartier}} \u2014 votre image professionnelle est cl\u00E9.

Aujourd\u2019hui, la confiance passe par la visibilit\u00E9 en ligne. Vos patients ou clients vous cherchent sur Google et les r\u00E9seaux. Une communication sobre et pro fait toute la diff\u00E9rence.

Avec KeiroAI, vous cr\u00E9ez des visuels professionnels en 3 min, pas en 3 heures.

1 consultation en plus et c\u2019est rembours\u00E9. Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> dans le {{quartier}} \u2014 votre image professionnelle est cl\u00E9.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Aujourd\u2019hui, la confiance passe par la visibilit\u00E9 en ligne. Vos patients ou clients vous cherchent sur Google et les r\u00E9seaux. Une communication sobre et pro fait toute la diff\u00E9rence.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous cr\u00E9ez des visuels professionnels en <strong>3 min</strong>, pas en 3 heures.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>1 consultation en plus et c\u2019est rembours\u00E9.</strong> Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

J\u2019ai cr\u00E9\u00E9 un visuel type pour un professionnel comme vous \u2014 c\u2019est en pi\u00E8ce jointe.

Imaginez votre image de marque mise en valeur comme \u00E7a. G\u00E9n\u00E9r\u00E9 en 3 min.

Une pr\u00E9sence en ligne professionnelle attire la confiance et les nouveaux clients.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">J\u2019ai cr\u00E9\u00E9 un visuel type pour un professionnel comme vous \u2014 c\u2019est en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez votre image de marque mise en valeur comme \u00E7a. G\u00E9n\u00E9r\u00E9 en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>Une pr\u00E9sence en ligne professionnelle attire la confiance et les nouveaux clients.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : les patients et clients modernes cherchent en ligne. Si vous pouviez avoir une pr\u00E9sence pro sans effort, vous le feriez ?

15 min de d\u00E9mo. Sinon, bonne continuation !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : les patients et clients modernes cherchent en ligne. Si vous pouviez avoir une pr\u00E9sence pro sans effort, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, bonne continuation !</p>`,
      },
    ],
  };
}

function agenceTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.agence,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} \u2014 vous g\u00E9rez le contenu de plusieurs clients, et je sais que \u00E7a prend un temps fou.

Imaginez pouvoir automatiser la cr\u00E9ation de visuels et vid\u00E9os pour chacun de vos clients. 2h gagn\u00E9es par client par semaine.

Avec KeiroAI, vous pouvez scaler votre offre contenu sans embaucher. 3 min par visuel, qualit\u00E9 pro.

Je vous montre comment \u00E7a marche ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> \u2014 vous g\u00E9rez le contenu de plusieurs clients, et je sais que \u00E7a prend un temps fou.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Imaginez pouvoir automatiser la cr\u00E9ation de visuels et vid\u00E9os pour chacun de vos clients. <strong>2h gagn\u00E9es par client par semaine</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI, vous pouvez scaler votre offre contenu sans embaucher. <strong>3 min</strong> par visuel, qualit\u00E9 pro.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je vous montre comment \u00E7a marche ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

Voici un visuel type en pi\u00E8ce jointe \u2014 imaginez du contenu pour vos clients en 3 min.

Vous pourriez livrer du contenu de qualit\u00E9 \u00E0 chaque client, montrer votre portfolio, et gagner du temps.

2h gagn\u00E9es par client par semaine = plus de clients sans embaucher.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Voici un visuel type en pi\u00E8ce jointe \u2014 imaginez du contenu pour vos clients en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Vous pourriez livrer du contenu de qualit\u00E9 \u00E0 chaque client, montrer votre portfolio, et gagner du temps.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>2h gagn\u00E9es par client par semaine = plus de clients sans embaucher.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : si vous pouviez livrer du contenu \u00E0 chaque client sans effort, vous le feriez ?

15 min de d\u00E9mo. Sinon, bonne continuation !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : si vous pouviez livrer du contenu \u00E0 chaque client sans effort, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, bonne continuation !</p>`,
      },
    ],
  };
}

function pmeTemplates(): TemplateSet {
  return {
    subjects: SUBJECT_VARIANTS.pme,
    bodies: [
      // Email 1
      {
        text: `Bonjour {{first_name}},

Je suis tomb\u00E9 sur {{company}} \u2014 votre communication m\u00E9rite d\u2019\u00EAtre \u00E0 la hauteur de votre entreprise.

La marque employeur et la visibilit\u00E9 sur les r\u00E9seaux sociaux sont devenues indispensables. Mais cr\u00E9er du contenu corporate prend du temps.

Avec KeiroAI : communication pro en 3 min, pas en 3 heures.

Marque employeur + r\u00E9seaux = recrutement et visibilit\u00E9. Je vous montre ?

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">Bonjour {{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Je suis tomb\u00E9 sur <strong>{{company}}</strong> \u2014 votre communication m\u00E9rite d\u2019\u00EAtre \u00E0 la hauteur de votre entreprise.</p>
<p style="margin:0 0 14px 0;font-size:15px;">La marque employeur et la visibilit\u00E9 sur les r\u00E9seaux sociaux sont devenues indispensables. Mais cr\u00E9er du contenu corporate prend du temps.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Avec KeiroAI : <strong>communication pro en 3 min</strong>, pas en 3 heures.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>Marque employeur + r\u00E9seaux = recrutement et visibilit\u00E9.</strong> Je vous montre ?</p>`,
      },
      // Email 2
      {
        text: `{{first_name}},

Voici un visuel type en pi\u00E8ce jointe \u2014 imaginez votre marque sur tous les r\u00E9seaux.

Une image professionnelle coh\u00E9rente, g\u00E9n\u00E9r\u00E9e en 3 min.

Communication corporate pro = confiance, recrutement et visibilit\u00E9.

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Voici un visuel type en pi\u00E8ce jointe \u2014 imaginez votre marque sur tous les r\u00E9seaux.</p>
<p style="margin:0 0 14px 0;font-size:15px;">Une image professionnelle coh\u00E9rente, g\u00E9n\u00E9r\u00E9e en <strong>3 min</strong>.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>Communication corporate pro = confiance, recrutement et visibilit\u00E9.</strong></p>`,
        attachmentName: 'visuel-vitrine-{{company}}.png',
      },
      // Email 3
      {
        text: `{{first_name}},

Derni\u00E8re question : vos concurrents communiquent d\u00E9j\u00E0 sur les r\u00E9seaux. Si vous pouviez faire pareil en 10 min/semaine, vous le feriez ?

15 min pour une d\u00E9mo. Sinon, bonne continuation !

Oussama
KeiroAI`,
        html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Derni\u00E8re question : vos concurrents communiquent d\u00E9j\u00E0 sur les r\u00E9seaux. Si vous pouviez faire pareil en 10 min/semaine, vous le feriez ?</p>
<p style="margin:0 0 14px 0;font-size:15px;"><a href="https://keiroai.com/pricing" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:15px;">15 min de d\u00E9mo</a></p>
<p style="margin:0 0 14px 0;font-size:15px;">Sinon, bonne continuation !</p>`,
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

Suite \u00E0 notre \u00E9change sur le site, j\u2019ai pr\u00E9par\u00E9 un visuel pour {{company}} \u2014 c\u2019est en pi\u00E8ce jointe.

${roiPhrase}

Deux options pour d\u00E9marrer :
- Sprint \u00E0 4.99\u20AC (3 jours pour tester)
- D\u00E9mo de 15 min avec moi

R\u00E9pondez \u00E0 cet email et je m\u2019occupe de tout.

Oussama
KeiroAI`,
    html: `<p style="margin:0 0 14px 0;font-size:15px;">{{first_name}},</p>
<p style="margin:0 0 14px 0;font-size:15px;">Suite \u00E0 notre \u00E9change sur le site, j\u2019ai pr\u00E9par\u00E9 un visuel pour <strong>{{company}}</strong> \u2014 c\u2019est en pi\u00E8ce jointe.</p>
<p style="margin:0 0 14px 0;font-size:15px;"><strong>${roiPhrase}</strong></p>
<p style="margin:0 0 14px 0;font-size:15px;">Deux options pour d\u00E9marrer :</p>
<p style="margin:0 0 14px 0;font-size:15px;padding-left:16px;">&bull; <strong>Sprint \u00E0 4.99\u20AC</strong> (3 jours pour tester)<br/>&bull; <strong>D\u00E9mo de 15 min</strong> avec moi</p>
<p style="margin:0 0 14px 0;font-size:15px;">R\u00E9pondez \u00E0 cet email et je m\u2019occupe de tout.</p>`,
    attachmentName: 'visuel-{{company}}.png',
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
    const subject = replaceVars(
      'Suite \u00E0 notre \u00E9change \u2014 un visuel pour {{company}}',
      vars
    );

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
    subject = replaceVars(
      `Re: un visuel pour un ${category} de {{quartier}}`,
      vars
    );
  } else {
    subject = replaceVars('Derni\u00E8re question pour {{company}}', vars);
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
