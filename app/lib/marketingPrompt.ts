// app/lib/marketingPrompt.ts
export type PromptData = {
  marque?: string;
  secteur?: string;
  objectif?: string;
  audience?: string;
  canal?: string;
  format?: string;
  ton?: string;
  style?: string;
  cta?: string;
  avoid?: string;

  // Nouveaux champs émotionnels
  emotion?: string;        // p.ex. Séduction, Urgence, FOMO, Confiance, Aspiration, Soulagement, Preuve sociale
  painPoints?: string;     // douleurs / frustrations client
  desiredFeeling?: string; // émotion à ressentir après l'exposition (confiance, soulagement, excitation…)
};

export function buildPrompt(data: PromptData, article?: any) {
  return `
Crée un contenu ${data.format || 'social'} pour ${data.marque || 'une marque inconnue'}
dans le secteur ${data.secteur || 'non spécifié'}.

🎯 Objectif business : ${data.objectif || 'notoriété'}.
👥 Audience : ${data.audience || 'grand public'}.
📣 Canal : ${data.canal || 'Instagram'}.
🎚️ Ton : ${data.ton || 'moderne et engageant'}.
🎨 Style visuel : ${data.style || 'professionnel'}.
🧲 Angle émotionnel : ${data.emotion || 'non défini'}.
😣 Douleurs/obstacles à adresser : ${data.painPoints || 'non précisé'}.
💗 Émotion à faire ressentir après lecture/visionnage : ${data.desiredFeeling || 'confiance'}.
🧭 À éviter : ${data.avoid || 'aucune contrainte'}.
👉 Appel à l’action (CTA) : ${data.cta || 'Découvrir maintenant'}.

Inspire-toi de l’actualité suivante si elle est fournie :
${article?.title ? (`• "${article.title}" — source: ${article?.source || 'inconnue'}`) : '(aucune actualité sélectionnée)'}

Exigences :
- 1 hook d’ouverture punchy lié à l’angle émotionnel choisi
- 1 à 3 bénéfices concrets reliés aux douleurs mentionnées
- 1 preuve (sociale, chiffre, autorité ou analogie) si pertinent
- 1 CTA clair et orienté action
- Texte court, clair, sans jargon. HashTags optionnels si pertinents au canal.
`.trim();
}
