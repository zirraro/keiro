// Channel-aware copy rules for Léna (content agent).
//
// Léna writes ONE post at a time, targeted at ONE platform. The voice,
// length, hook style, and what she can REFERENCE differ by network.
// Without this, she leaks LinkedIn-isms ("dans le feed pro", "algo
// LinkedIn", "decision-makers") into Instagram captions, or talks about
// "FYP" on a LinkedIn post — both immediately break the post for the
// audience that sees it.
//
// The rule of thumb: a post on platform X must read like it was
// written BY a native of platform X, not by someone explaining
// platform X.

export type Channel = 'instagram' | 'tiktok' | 'linkedin';

export function channelVoiceBlock(platform: string): string {
  const p = (platform || 'instagram').toLowerCase() as Channel;

  if (p === 'instagram') {
    return `
━━━ COMMUNICATION PAR CANAL — INSTAGRAM ━━━
Tu écris pour des humains qui scrollent leur feed perso. Voix lifestyle, chaleureuse, visuelle.
- Hook = visuel d'abord, mots ensuite. La caption complète l'image, ne la décrit pas.
- Ton naturel, presque copine/copain. Tutoiement systématique. Emojis stratégiques (pas plus de 5-6 dans toute la caption).
- Longueur : 80–250 mots max. Aérée. Sauts de ligne fréquents. JAMAIS de pavé.
- CTA léger : "save", "tag un ami", "DM-moi", "lien en bio". Pas "cliquez ici" ni "découvrez sur notre site".
- INTERDIT : mentions de "LinkedIn", "FYP", "B2B", "decision-makers", "thought leadership", "ROI", "pipeline", "conversion".
- INTERDIT : "algo Instagram", "reach", "impressions" — on parle PAS d'algorithme aux clients d'Instagram.
- Hashtags : 5-10 dans le champ "hashtags" (PAS dans la caption).
- Si tu mentionnes une tendance, elle doit être grand public (pas tech/marketing pro).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  if (p === 'tiktok') {
    return `
━━━ COMMUNICATION PAR CANAL — TIKTOK ━━━
Tu écris pour la For You Page. Voix punchy, jeune, directe. La vidéo PORTE le message — la caption est secondaire.
- Hook = 3 premiers mots ULTRA accrocheurs (sinon swipe).
- Ton décontracté, tutoiement, slang léger OK ("pov", "hot take", "vrai ou pas ?").
- Longueur : 50–150 mots MAX. Plus court c'est mieux. Une seule idée par caption.
- CTA TikTok-natifs uniquement : "follow pour la suite", "comment si t'es d'accord", "save ce sound", "duo si tu veux ajouter". JAMAIS "lien en bio" sauf urgence.
- INTERDIT : mentions de "LinkedIn", "Instagram algo", "B2B", "professional network".
- Tu peux référencer une tendance TikTok (sound viral, format POV, challenge) si pertinente.
- Hashtags : 3-6 (#fyp #pourtoi en premier, puis 2-3 thématiques + 1 niche).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  if (p === 'linkedin') {
    return `
━━━ COMMUNICATION PAR CANAL — LINKEDIN ━━━
Tu écris pour un feed professionnel. Voix experte, posée, qui apporte de la valeur. Pas de fun gratuit.
- Hook = première ligne forte (3 lignes max avant le "...voir plus" du feed). Provocation douce, chiffre, contre-intuitif.
- Ton : pro mais humain. "Vous" possible mais "tu" passe maintenant si la marque est jeune. Pas d'emojis en début de ligne (un seul, sobre, en accent OK).
- Longueur : 120–400 mots. Sauts de ligne tous les 1-2 phrases (le formattage est CLÉ sur LinkedIn).
- Structure idéale : hook → contexte → 3 points → réflexion → CTA discret (question ouverte).
- CTA LinkedIn-natifs : "qu'en pensez-vous ?", "partagez si vous êtes d'accord", "ça vous parle ?". JAMAIS "lien en bio" (ça n'existe pas), JAMAIS "DM-moi" (on dit "MP").
- INTERDIT : "FYP", "pourtoi", "TikTok trend", langage trop ado.
- Hashtags : 3-5 maximum, à la fin, professionnels (pas #love #fyp).
- Tu PEUX évoquer le ROI, l'algorithme LinkedIn, le marché, les tendances B2B — c'est attendu ici.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  return '';
}
