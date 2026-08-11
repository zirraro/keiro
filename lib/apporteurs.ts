/**
 * Programme apporteur d'affaires : attribution des clients et calcul des
 * commissions.
 *
 * ── Pourquoi ce programme, et pourquoi CETTE forme ──
 *
 * Chiffré le 2026-08-11, canal par canal. Un client acquis par la publicité
 * Meta coûte environ 100 €, avancés de notre poche avant même de l'avoir. Un
 * apporteur à 20 % pendant douze mois coûte 77 € — et il est payé sur des
 * abonnements déjà encaissés, donc sans aucune avance de trésorerie.
 *
 * L'apporteur ne prend donc pas de la marge : il remplace de la publicité, et
 * moins cher. Le repère n'est pas « combien je lâche » mais « combien me coûte
 * déjà un client autrement ».
 *
 * ── Pourquoi PAS de commission à vie, même si elle motive plus ──
 *
 * À 8 % de perte mensuelle, un client vit treize mois : 30 % pendant douze mois
 * rapporte 116 € à l'apporteur, 20 % à vie lui rapporte 117 €. La motivation
 * est la même, mais la seconde est illimitée — et si on ramène la perte à 3 %,
 * elle lui verse 311 € par client. Une rente perpétuelle nous punirait
 * exactement au moment où l'on réussit sur la rétention.
 *
 * D'où la forme retenue : un pourcentage BORNÉ dans le temps, plus des primes
 * de palier ponctuelles qui ne tombent que sur des clients encore actifs. C'est
 * le seul endroit du contrat où l'intérêt de l'apporteur rejoint le nôtre.
 */

export interface Apporteur {
  id: string;
  nom: string;
  email: string | null;
  code: string;
  taux: number;
  duree_mois: number;
  actif: boolean;
}

/**
 * Les primes de volume.
 *
 * Ponctuelles, pas un relèvement de taux : deux paliers visibles créent plus
 * d'élan qu'un pourcentage un peu plus haut, et le coût reste borné.
 *
 * `moisActifMinimum` est le cœur du dispositif — la prime ne tombe que sur des
 * clients encore là après trois mois. Un apporteur payé à la signature amène
 * des signatures ; un apporteur payé à la rétention amène des clients.
 */
export const PALIERS: Array<{ seuil: number; prime: number; moisActifMinimum: number }> = [
  { seuil: 10, prime: 150, moisActifMinimum: 3 },
  { seuil: 25, prime: 250, moisActifMinimum: 3 },
];

/** Prix mensuel par plan, base de la commission. Toujours HORS TAXE. */
const PRIX_PLAN: Record<string, number> = {
  createur: 49, pro: 99, fondateurs: 79, business: 149, elite: 299, agence: 499,
};

/**
 * Un code lisible et dictable au téléphone.
 *
 * Sans I, O, 0 ni 1 : un apporteur qui épelle son code à un commerçant ne doit
 * pas avoir à préciser « le O de Oscar, pas le zéro ».
 */
export function genererCode(nom: string): string {
  const base = (nom || 'ref').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6) || 'REF';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffixe = '';
  for (let i = 0; i < 3; i++) suffixe += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${base}-${suffixe}`;
}

/**
 * Rattache un client à l'apporteur dont il a utilisé le code.
 *
 * Silencieux et sans effet si le code n'existe pas, si l'apporteur est inactif,
 * ou si le client est DÉJÀ rattaché : une inscription ne doit jamais échouer à
 * cause du programme d'apport, et un client ne peut appartenir qu'à un seul
 * apporteur — sinon on paierait deux fois le même.
 */
export async function attribuerClient(
  supabase: any,
  code: string,
  userId: string,
): Promise<{ attribue: boolean; motif?: string }> {
  const propre = String(code || '').trim().toUpperCase();
  if (!propre || !userId) return { attribue: false, motif: 'code ou client manquant' };

  try {
    const { data: apporteur } = await supabase
      .from('apporteurs').select('id, actif').eq('code', propre).maybeSingle();
    if (!apporteur) return { attribue: false, motif: 'code inconnu' };
    if (!apporteur.actif) return { attribue: false, motif: 'apporteur inactif' };

    const { data: deja } = await supabase
      .from('apporteur_clients').select('id').eq('user_id', userId).maybeSingle();
    if (deja) return { attribue: false, motif: 'client déjà rattaché' };

    const { error } = await supabase.from('apporteur_clients')
      .insert({ apporteur_id: apporteur.id, user_id: userId, code_utilise: propre });
    if (error) return { attribue: false, motif: error.message };
    return { attribue: true };
  } catch (e: any) {
    return { attribue: false, motif: e?.message || 'erreur' };
  }
}

/** Le premier jour du mois, en date ISO — clé d'unicité d'une mensualité. */
function premierDuMois(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function moisEcoules(depuis: string, jusqua = new Date()): number {
  const d = new Date(depuis);
  return (jusqua.getUTCFullYear() - d.getUTCFullYear()) * 12 + (jusqua.getUTCMonth() - d.getUTCMonth());
}

/**
 * Calcule les commissions dues pour le mois en cours.
 *
 * Rejouable sans risque : un index d'unicité en base empêche de compter deux
 * fois la même mensualité. Le passage peut donc tourner tous les jours sans
 * jamais gonfler ce qu'on doit.
 *
 * Ne crédite QUE des clients réellement payants — un compte passé en offre
 * gratuite ou résilié ne génère plus rien le mois suivant, ce qui est
 * exactement la règle annoncée à l'apporteur : il est payé tant que le client
 * paie.
 */
export async function calculerCommissions(supabase: any): Promise<{
  mois: string; lignes: number; montant: number; primes: number;
}> {
  const mois = premierDuMois();
  let lignes = 0, montant = 0, primes = 0;

  const { data: apporteurs } = await supabase
    .from('apporteurs').select('id, nom, taux, duree_mois, actif');
  if (!apporteurs?.length) return { mois, lignes: 0, montant: 0, primes: 0 };

  const { data: rattachements } = await supabase
    .from('apporteur_clients').select('apporteur_id, user_id, signe_le');
  if (!rattachements?.length) return { mois, lignes: 0, montant: 0, primes: 0 };

  const ids = [...new Set(rattachements.map((r: any) => r.user_id))];
  const { data: profils } = await supabase
    .from('profiles').select('id, subscription_plan').in('id', ids);
  const planDe: Record<string, string> = {};
  for (const p of profils || []) planDe[p.id] = String(p.subscription_plan || '').toLowerCase();

  for (const r of rattachements as any[]) {
    const a = (apporteurs as any[]).find(x => x.id === r.apporteur_id);
    if (!a || !a.actif) continue;

    // La commission s'arrête après la durée convenue — jamais de rente.
    const age = moisEcoules(r.signe_le);
    if (age < 0 || age >= a.duree_mois) continue;

    const prix = PRIX_PLAN[planDe[r.user_id]] ?? 0;
    if (prix <= 0) continue;   // plan gratuit ou compte résilié : rien n'est dû

    const dû = Math.round(prix * a.taux * 100) / 100;
    const { error } = await supabase.from('apporteur_commissions').insert({
      apporteur_id: a.id, user_id: r.user_id, mois, type: 'recurrent',
      base_eur: prix, taux: a.taux, montant_eur: dû, statut: 'du',
    });
    if (!error) { lignes++; montant += dû; }
  }

  // ── Les primes de palier ──
  for (const a of apporteurs as any[]) {
    const siens = (rattachements as any[]).filter(r => r.apporteur_id === a.id);
    for (const palier of PALIERS) {
      // On ne compte que les clients tenus assez longtemps ET encore payants.
      const eligibles = siens.filter(r =>
        moisEcoules(r.signe_le) >= palier.moisActifMinimum && (PRIX_PLAN[planDe[r.user_id]] ?? 0) > 0);
      if (eligibles.length < palier.seuil) continue;

      const motif = `palier_${palier.seuil}`;
      const { error } = await supabase.from('apporteur_commissions').insert({
        apporteur_id: a.id, user_id: null, mois: null, type: 'prime',
        base_eur: 0, taux: null, montant_eur: palier.prime, statut: 'du', motif,
      });
      // L'index d'unicité rejette la seconde tentative : une prime ne se verse
      // qu'une fois, même si le passage tourne tous les jours.
      if (!error) { primes++; montant += palier.prime; }
    }
  }

  return { mois, lignes, montant: Math.round(montant * 100) / 100, primes };
}

/** Le relevé d'un apporteur : ce qu'il a apporté, ce qu'on lui doit. */
export async function releve(supabase: any, apporteurId: string) {
  const { data: apporteur } = await supabase
    .from('apporteurs').select('*').eq('id', apporteurId).maybeSingle();
  if (!apporteur) return null;

  const { data: clients } = await supabase
    .from('apporteur_clients').select('user_id, signe_le').eq('apporteur_id', apporteurId);
  const { data: commissions } = await supabase
    .from('apporteur_commissions').select('mois, type, montant_eur, statut, motif, created_at')
    .eq('apporteur_id', apporteurId).order('created_at', { ascending: false }).limit(200);

  const du = (commissions || []).filter((c: any) => c.statut === 'du')
    .reduce((s: number, c: any) => s + Number(c.montant_eur), 0);
  const paye = (commissions || []).filter((c: any) => c.statut === 'paye')
    .reduce((s: number, c: any) => s + Number(c.montant_eur), 0);

  return {
    apporteur,
    clients_apportes: clients?.length || 0,
    du_eur: Math.round(du * 100) / 100,
    paye_eur: Math.round(paye * 100) / 100,
    commissions: commissions || [],
  };
}
