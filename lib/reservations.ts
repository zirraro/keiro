/**
 * Le carnet de réservations, alimenté par tous les canaux.
 *
 * ── Pourquoi ce module ──
 *
 * Fondateur, 2026-08-11 : « le CRM sert uniquement à la prospection ; on doit
 * pouvoir, si un client d'un resto réserve via DM, WhatsApp, TikTok ou email,
 * consigner la demande, prévenir le gérant, et tout résumer dans cet outil. »
 *
 * Le CRM suit un PROSPECT dans un cycle de vente. Une réservation est
 * l'inverse : un engagement daté, pris par un client déjà acquis. Les mêler
 * donnerait un objet qui répond mal aux deux questions.
 *
 * ── Le vocabulaire suit le métier ──
 *
 * Un restaurateur pense « table » et « couverts », un hôtelier « chambre » et
 * « nuits », une esthéticienne « prestation » et « créneau ». Le moteur est le
 * même ; ce qui change est ce qu'on affiche et ce qu'on demande. Le métier
 * vient de l'onboarding, on ne le redemande jamais.
 */

export type CanalReservation = 'dm_instagram' | 'whatsapp' | 'email' | 'tiktok' | 'telephone' | 'site' | 'manuel';

export interface ProfilMetier {
  /** Le mot du métier pour ce qu'on réserve. */
  objet: string;
  /** Ce que compte `quantite`. */
  unite: string;
  /** Ce qu'il faut avoir avant de confirmer. */
  champsRequis: Array<'date_prevue' | 'heure_prevue' | 'quantite' | 'client_nom'>;
  /** Comment le résumer en une ligne, sur le téléphone du gérant. */
  gabaritAlerte: string;
}

/**
 * Les métiers qu'on sait servir aujourd'hui.
 *
 * Le repli n'est pas un défaut : un métier inconnu obtient un carnet
 * générique qui fonctionne, plutôt qu'un message « non pris en charge ». On
 * affine ensuite au vu des vrais clients.
 */
const PROFILS: Record<string, ProfilMetier> = {
  restaurant: {
    objet: 'table', unite: 'couverts',
    champsRequis: ['date_prevue', 'heure_prevue', 'quantite'],
    gabaritAlerte: 'Table {quantite} pers. — {date} à {heure} — {nom}',
  },
  hotel: {
    objet: 'chambre', unite: 'nuits',
    champsRequis: ['date_prevue', 'quantite', 'client_nom'],
    gabaritAlerte: 'Chambre {quantite} nuit(s) — arrivée {date} — {nom}',
  },
  institut_beaute: {
    objet: 'prestation', unite: 'personnes',
    champsRequis: ['date_prevue', 'heure_prevue'],
    gabaritAlerte: '{objet} — {date} à {heure} — {nom}',
  },
  coiffeur: {
    objet: 'rendez-vous', unite: 'personnes',
    champsRequis: ['date_prevue', 'heure_prevue'],
    gabaritAlerte: '{objet} — {date} à {heure} — {nom}',
  },
  boutique: {
    objet: 'article mis de côté', unite: 'articles',
    champsRequis: ['client_nom'],
    gabaritAlerte: '{objet} × {quantite} mis de côté — {nom}',
  },
  coach: {
    objet: 'séance', unite: 'personnes',
    champsRequis: ['date_prevue', 'heure_prevue'],
    gabaritAlerte: 'Séance — {date} à {heure} — {nom}',
  },
};

/** Rattache un type d'activité libre à un profil connu. */
export function profilPour(businessType?: string | null): ProfilMetier {
  const t = String(businessType || '').toLowerCase();
  if (/restau|brasserie|bistro|pizz|traiteur|bar\b|café|cafe/.test(t)) return PROFILS.restaurant;
  if (/h[oô]tel|chambre d|gîte|gite|auberge/.test(t)) return PROFILS.hotel;
  if (/institut|beaut|ongle|spa|esth/.test(t)) return PROFILS.institut_beaute;
  if (/coiff|barbier/.test(t)) return PROFILS.coiffeur;
  if (/coach|sport|yoga|pilates|kin[eé]/.test(t)) return PROFILS.coach;
  if (/boutique|magasin|pr[eê]t-[aà]-porter|fleur|libraire/.test(t)) return PROFILS.boutique;
  return {
    objet: 'rendez-vous', unite: 'personnes',
    champsRequis: ['date_prevue'],
    gabaritAlerte: '{objet} — {date} {heure} — {nom}',
  };
}

export interface DemandeReservation {
  clientNom?: string | null;
  clientTelephone?: string | null;
  clientEmail?: string | null;
  canal: CanalReservation;
  conversationRef?: string | null;
  datePrevue?: string | null;
  heurePrevue?: string | null;
  quantite?: number | null;
  objet?: string | null;
  details?: Record<string, any>;
  demandeBrute?: string | null;
}

/** Ce qu'il manque encore pour pouvoir confirmer. */
export function champsManquants(d: DemandeReservation, profil: ProfilMetier): string[] {
  const manque: string[] = [];
  for (const c of profil.champsRequis) {
    if (c === 'date_prevue' && !d.datePrevue) manque.push('la date');
    if (c === 'heure_prevue' && !d.heurePrevue) manque.push("l'heure");
    if (c === 'quantite' && !d.quantite) manque.push(`le nombre de ${profil.unite}`);
    if (c === 'client_nom' && !d.clientNom) manque.push('le nom');
  }
  return manque;
}

/** La ligne que le gérant lira sur son téléphone. Courte, décidable d'un coup d'œil. */
export function resumeAlerte(d: DemandeReservation, profil: ProfilMetier): string {
  return profil.gabaritAlerte
    .replace('{quantite}', String(d.quantite ?? '?'))
    .replace('{date}', d.datePrevue ? new Date(`${d.datePrevue}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'date à préciser')
    .replace('{heure}', d.heurePrevue ? String(d.heurePrevue).slice(0, 5) : '')
    .replace('{nom}', d.clientNom || 'client')
    .replace('{objet}', d.objet || profil.objet)
    .replace(/\s+—\s+$/, '')
    .trim();
}

/**
 * Consigne une demande de réservation et prévient le gérant.
 *
 * Enregistre TOUJOURS, même incomplète : une demande à moitié comprise vaut
 * infiniment mieux qu'une demande perdue. Ce qui manque est signalé au gérant
 * et redemandé au client dans la conversation d'origine — jamais dans un
 * formulaire, que personne ne remplit.
 *
 * Ne lève jamais : un agent en conversation ne doit pas s'interrompre parce
 * que le carnet a un souci.
 */
export async function consignerReservation(
  supabase: any,
  userId: string,
  d: DemandeReservation,
  businessType?: string | null,
): Promise<{ ok: boolean; id?: string; manquants: string[]; resume: string }> {
  const profil = profilPour(businessType);
  const manquants = champsManquants(d, profil);
  const resume = resumeAlerte(d, profil);

  try {
    const { data, error } = await supabase.from('reservations').upsert({
      user_id: userId,
      client_nom: d.clientNom || null,
      client_telephone: d.clientTelephone || null,
      client_email: d.clientEmail || null,
      canal: d.canal,
      conversation_ref: d.conversationRef || null,
      date_prevue: d.datePrevue || null,
      heure_prevue: d.heurePrevue || null,
      quantite: d.quantite ?? null,
      objet: d.objet || profil.objet,
      details: d.details || {},
      demande_brute: (d.demandeBrute || '').slice(0, 2000) || null,
      statut: 'a_confirmer',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,conversation_ref' }).select('id').single();

    if (error) return { ok: false, manquants, resume };

    void prevenirGerant(supabase, userId, resume, manquants, data.id);
    return { ok: true, id: data.id, manquants, resume };
  } catch {
    return { ok: false, manquants, resume };
  }
}

/**
 * Prévient le gérant, là où il regarde vraiment.
 *
 * WhatsApp d'abord : il l'a dans la poche, et une conversation ouverte par le
 * client ne coûte rien. Sinon une notification dans l'application. Le SMS
 * viendra quand un fournisseur sera branché — l'annoncer avant serait mentir.
 *
 * Le message est technique et destiné au commerçant lui-même : il échappe au
 * contrôle qualité éditorial, qui n'a rien à juger ici.
 */
async function prevenirGerant(
  supabase: any, userId: string, resume: string, manquants: string[], reservationId: string,
): Promise<void> {
  const texte = manquants.length
    ? `📅 Nouvelle demande : ${resume}\n⚠️ Manque ${manquants.join(', ')} — on relance le client.`
    : `📅 Nouvelle réservation : ${resume}`;

  let canal = 'notification';
  try {
    const { data: prof } = await supabase.from('profiles')
      .select('whatsapp_number, phone').eq('id', userId).maybeSingle();
    const numero = prof?.whatsapp_number || prof?.phone;
    if (numero) {
      const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
      const r = await sendWhatsAppMessage(numero, texte, { sansControle: true });
      if (r.success) canal = 'whatsapp';
    }
  } catch { /* on retombe sur la notification dans l'application */ }

  try {
    await supabase.from('notifications').insert({
      user_id: userId, agent: 'reservations', type: 'action',
      title: manquants.length ? 'Demande de réservation à compléter' : 'Nouvelle réservation',
      message: texte, created_at: new Date().toISOString(),
    });
  } catch { /* la notification est un confort */ }

  try {
    await supabase.from('reservations')
      .update({ alerte_envoyee_le: new Date().toISOString(), alerte_canal: canal })
      .eq('id', reservationId);
  } catch { /* la trace ne bloque pas */ }
}
