'use client';

/**
 * Preview/demo data for each agent — shown when agent is not connected.
 * Realistic French data to show the client what they'll get.
 */

// ─── DM Instagram (Jade) ───────────────────────────────────────────
export const DEMO_DM_CONVERSATIONS = [
  {
    id: 'demo_1',
    participant: { username: 'marie_beaute_paris', id: 'demo_1' },
    updated_time: new Date(Date.now() - 2 * 3600000).toISOString(),
    messages: [
      { message: 'Salut ! J\'ai vu vos prestations, vous faites des balayages ?', from: 'marie_beaute_paris', fromMe: false, created_time: new Date(Date.now() - 3 * 3600000).toISOString() },
      { message: 'Salut Marie ! Oui bien sur, on est specialistes du balayage californien. Tu veux prendre rdv ? On a un creneau dispo jeudi a 14h', from: 'moi', fromMe: true, created_time: new Date(Date.now() - 2.5 * 3600000).toISOString(), status: 'sent' },
      { message: 'Jeudi ca me va ! C\'est combien ?', from: 'marie_beaute_paris', fromMe: false, created_time: new Date(Date.now() - 2 * 3600000).toISOString() },
    ],
  },
  {
    id: 'demo_2',
    participant: { username: 'resto_levrai_lyon', id: 'demo_2' },
    updated_time: new Date(Date.now() - 5 * 3600000).toISOString(),
    messages: [
      { message: 'Bonjour, vous proposez des menus pour les groupes ?', from: 'resto_levrai_lyon', fromMe: false, created_time: new Date(Date.now() - 6 * 3600000).toISOString() },
      { message: 'Bonjour ! Absolument, on a un menu groupe a partir de 10 personnes. Je t\'envoie la carte ?', from: 'moi', fromMe: true, created_time: new Date(Date.now() - 5 * 3600000).toISOString(), status: 'sent' },
    ],
  },
  {
    id: 'demo_3',
    participant: { username: 'coach_alex_fit', id: 'demo_3' },
    updated_time: new Date(Date.now() - 24 * 3600000).toISOString(),
    messages: [
      { message: 'Super contenu ! Tu fais des coachings en ligne ?', from: 'coach_alex_fit', fromMe: false, created_time: new Date(Date.now() - 25 * 3600000).toISOString() },
      { message: 'Merci ! Oui, j\'ai un programme de 12 semaines en ligne. Tu veux que je t\'envoie les details ?', from: 'moi', fromMe: true, created_time: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'sent' },
    ],
  },
];

// ─── Email (Hugo) ──────────────────────────────────────────────────
export const DEMO_EMAILS = [
  { prospect_id: 'demo_1', prospect: 'Boulangerie Dupont', email: 'contact@boulangerie-dupont.fr', type: 'step_1', status: 'ouvert', direction: 'outgoing', message: 'Bonjour, j\'ai decouvert votre boulangerie sur Google Maps...', date: new Date(Date.now() - 2 * 86400000).toISOString() },
  { prospect_id: 'demo_1', prospect: 'Boulangerie Dupont', email: 'contact@boulangerie-dupont.fr', type: 'reponse_recue', status: 'repondu', direction: 'incoming', message: 'Merci pour votre message, ca nous interesse ! On peut en discuter ?', date: new Date(Date.now() - 1 * 86400000).toISOString() },
  { prospect_id: 'demo_2', prospect: 'Salon Elegance', email: 'info@salon-elegance.fr', type: 'step_1', status: 'envoye', direction: 'outgoing', message: 'Bonjour, je vous contacte car j\'ai remarque que votre salon...', date: new Date(Date.now() - 3 * 86400000).toISOString() },
  { prospect_id: 'demo_3', prospect: 'Coach Fitness Pro', email: 'alex@coachfitnesspro.com', type: 'step_2', status: 'clique', direction: 'outgoing', message: 'Suite a mon premier message, je voulais vous montrer...', date: new Date(Date.now() - 4 * 86400000).toISOString() },
  { prospect_id: 'demo_4', prospect: 'Fleuriste Rose & Co', email: 'bonjour@roseetco.fr', type: 'auto_reply', status: 'ouvert', direction: 'outgoing', message: 'Merci pour votre interet ! Voici notre catalogue...', date: new Date(Date.now() - 5 * 86400000).toISOString() },
];

// ─── Content (Lena) ────────────────────────────────────────────────
export const DEMO_CONTENT_POSTS = [
  { id: 'demo_1', platform: 'instagram', format: 'reel', status: 'draft', hook: 'Les 3 erreurs que font 90% des restaurants sur Instagram', caption: 'Tu postes des photos de plats mais personne ne like ? Voici pourquoi...', scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), scheduled_time: '12:00', visual_url: null },
  { id: 'demo_2', platform: 'instagram', format: 'carrousel', status: 'approved', hook: '5 astuces pour doubler ton engagement en 1 semaine', caption: 'Astuce 1: Poste quand tes followers sont actifs...', scheduled_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), scheduled_time: '18:00', visual_url: null },
  { id: 'demo_3', platform: 'tiktok', format: 'video', status: 'published', hook: 'Cette technique a fait exploser mon compte en 30 jours', caption: 'Je suis passe de 200 a 5000 followers en utilisant cette strategie...', scheduled_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), published_at: new Date(Date.now() - 86400000).toISOString(), engagement_data: { likes: 342, comments: 28, shares: 15 }, visual_url: null },
  { id: 'demo_4', platform: 'instagram', format: 'post', status: 'published', hook: 'Nouveau menu d\'hiver : les clients adorent', caption: 'Notre chef a prepare un menu special pour cet hiver...', scheduled_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), published_at: new Date(Date.now() - 2 * 86400000).toISOString(), engagement_data: { likes: 847, comments: 43, shares: 12 }, visual_url: null },
];

// ─── Google Reviews (Theo) ─────────────────────────────────────────
export const DEMO_REVIEWS = [
  { name: 'demo_1', author: 'Sophie M.', rating: 5, text: 'Excellent service ! L\'equipe est tres accueillante et le resultat est top. Je recommande vivement.', date: new Date(Date.now() - 2 * 86400000).toISOString(), replied: false },
  { name: 'demo_2', author: 'Thomas L.', rating: 4, text: 'Tres bien dans l\'ensemble, bon rapport qualite prix. Un peu d\'attente a l\'entree mais ca vaut le coup.', date: new Date(Date.now() - 5 * 86400000).toISOString(), replied: true },
  { name: 'demo_3', author: 'Julie R.', rating: 3, text: 'Correct mais peut mieux faire. Le service etait un peu lent ce jour-la.', date: new Date(Date.now() - 10 * 86400000).toISOString(), replied: false },
  { name: 'demo_4', author: 'Pierre D.', rating: 5, text: 'Le meilleur de la ville ! On y retourne chaque semaine. Bravo a toute l\'equipe.', date: new Date(Date.now() - 15 * 86400000).toISOString(), replied: true },
];

// ─── Commercial (Leo) ──────────────────────────────────────────────
export const DEMO_CRM_STATS = {
  total: 47, hot: 5, warm: 12, cold: 30, converted: 3, conversionRate: 6.4,
};

// ─── Instagram Comments ────────────────────────────────────────────
export const DEMO_COMMENTS = [
  { author: 'sarah_lifestyle', text: 'Trop beau ! Vous etes ou exactement ?', rating: 0, date: new Date(Date.now() - 3600000).toISOString(), replied: false },
  { author: 'foodie_paris', text: 'Ca donne trop envie ! Je viens ce weekend', rating: 0, date: new Date(Date.now() - 7200000).toISOString(), replied: true },
  { author: 'marco_travel', text: 'Incroyable ! C\'est quel quartier ?', rating: 0, date: new Date(Date.now() - 86400000).toISOString(), replied: false },
];

// ─── SEO (Oscar) ───────────────────────────────────────────────────
export const DEMO_SEO_STATS = {
  organicTraffic: 1240, topKeywords: 8, pagesIndexed: 23, averagePosition: 12.4,
};

// ─── TikTok Comments (Axel) ───────────────────────────────────────
export const DEMO_TIKTOK_STATS = {
  videosPosted: 12, totalViews: 45200, avgEngagement: 8.7, followers: 2340,
};
