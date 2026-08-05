import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { peutGenererApercu, messageApercu } from '@/lib/prospects/apercu';
import { normaliserNumero } from '@/lib/prospects/telephone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Envoi WhatsApp depuis la fiche CRM — et passage de relais à Stella.
 *
 * Demande du fondateur (2026-08-05) : « depuis la fiche du client CRM, avoir un
 * bouton envoyer sur WhatsApp : je mets le numéro, ça envoie à partir du numéro
 * enregistré sur l'agent WhatsApp, et il reprend la conversation. »
 *
 * ── Le passage de relais ──
 *
 * C'est le point qui fait la valeur. Le message part du numéro de l'agent, donc
 * la réponse du prospect arrive sur le webhook existant : Stella prend la suite
 * sans qu'on ait rien à faire. On enregistre la conversation AVEC le
 * `prospect_id` pour qu'elle sache à qui elle parle et de quoi il a été
 * question — sans ce lien, elle répondrait à un numéro inconnu.
 *
 * ── La fenêtre de 24 heures ──
 *
 * Meta interdit le message libre vers quelqu'un qui ne nous a pas écrit dans
 * les 24 heures : il faut un modèle pré-approuvé. On détecte donc l'état de la
 * fenêtre et on bascule automatiquement. Ce n'est pas un détail contournable —
 * ignorer la règle fait suspendre le numéro.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}


/**
 * L'expéditeur est-il en état d'écrire à un inconnu ?
 *
 * Un numéro de TEST Meta ne peut joindre que cinq destinataires pré-enregistrés
 * dans la console. Le message part sans erreur visible côté application, mais
 * n'arrive jamais chez un prospect. Autant le dire ici, clairement, plutôt que
 * de laisser croire à un envoi réussi.
 */
async function verifierExpediteur(): Promise<{ pret: boolean; numero?: string; blocage?: string }> {
  const pn = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!pn || !token) return { pret: false, blocage: "L'agent WhatsApp n'est pas configuré (numéro ou jeton manquant)." };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pn}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    const d = await res.json();
    if (d?.error) return { pret: false, blocage: `Meta refuse le numéro : ${d.error.message}` };

    const estTest = String(d?.verified_name || '').toLowerCase().includes('test');
    if (estTest) {
      return {
        pret: false,
        numero: d.display_phone_number,
        blocage: `Le numéro configuré (${d.display_phone_number}) est un numéro de TEST Meta : il ne peut écrire qu'à 5 destinataires pré-enregistrés dans la console. Pour prospecter, il faut enregistrer un vrai numéro professionnel et faire approuver un modèle de premier contact.`,
      };
    }
    return { pret: true, numero: d.display_phone_number };
  } catch (e: any) {
    return { pret: false, blocage: `Vérification impossible : ${String(e?.message || e).slice(0, 150)}` };
  }
}

/** La fenêtre de 24 h est-elle ouverte avec ce numéro ? */
async function fenetreOuverte(supabase: any, numero: string): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_conversations')
    .select('created_at')
    .eq('phone_number', numero)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.created_at) return false;
  return Date.now() - new Date(data.created_at).getTime() < 24 * 3600 * 1000;
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prospectId = String(body?.prospect_id || '');
  const numeroSaisi = String(body?.numero || '');
  if (!prospectId) return NextResponse.json({ ok: false, error: 'prospect_id requis' }, { status: 400 });

  const supabase = sb();
  const { data: p } = await supabase
    .from('crm_prospects')
    .select('id, company, ville, type, phone, whatsapp_phone, apercu_url, google_rating, google_reviews, instagram, ig_status')
    .eq('id', prospectId)
    .maybeSingle();
  if (!p) return NextResponse.json({ ok: false, error: 'Prospect introuvable' }, { status: 404 });

  const numero = normaliserNumero(numeroSaisi || (p as any).whatsapp_phone || (p as any).phone || '');
  if (!numero) {
    return NextResponse.json({ ok: false, error: 'Numéro invalide ou absent de la fiche' }, { status: 400 });
  }

  // Contrôle de l'expéditeur AVANT toute écriture : mieux vaut refuser
  // clairement que consigner un envoi qui n'arrivera nulle part.
  const expediteur = await verifierExpediteur();
  if (!expediteur.pret) {
    return NextResponse.json({ ok: false, bloque: true, raison: expediteur.blocage }, { status: 422 });
  }

  const donnees = {
    nom: (p as any).company, ville: (p as any).ville, typeActivite: (p as any).type,
    note: (p as any).google_rating, avis: (p as any).google_reviews,
    instagram: (p as any).instagram, igStatut: (p as any).ig_status,
  };

  // Le message par défaut est celui de l'aperçu : on montre avant de demander.
  // S'il n'y a pas d'aperçu, on n'invente pas de promesse — on écrit court.
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://keiroai.com';
  const lien = (p as any).apercu_url ? `${base}/apercu/${String((p as any).apercu_url).split('/apercus/')[1]?.replace('.jpg', '')}` : null;
  const texte = String(body?.message || '').trim()
    || (lien && peutGenererApercu(donnees).possible ? messageApercu(donnees, lien).whatsapp : null)
    || `Bonjour ${donnees.nom || ''}, je me permets de vous écrire au sujet de votre présence en ligne. Puis-je vous expliquer en deux minutes ?`;

  const ouverte = await fenetreOuverte(supabase, numero);
  let envoi: { success: boolean; messageId?: string };

  if (ouverte) {
    envoi = await sendWhatsAppMessage(numero, texte);
  } else {
    // Hors fenêtre : modèle obligatoire. Sans modèle approuvé configuré, on
    // refuse plutôt que d'envoyer un message libre qui serait rejeté par Meta
    // et compterait contre la réputation du numéro.
    const modele = process.env.WHATSAPP_TEMPLATE_PREMIER_CONTACT;
    if (!modele) {
      return NextResponse.json({
        ok: false, bloque: true,
        raison: "Ce prospect ne nous a pas écrit dans les 24 dernières heures : Meta impose un modèle pré-approuvé pour un premier contact. Aucun modèle n'est configuré (WHATSAPP_TEMPLATE_PREMIER_CONTACT).",
      }, { status: 422 });
    }
    envoi = await sendWhatsAppTemplate(numero, modele, [String(donnees.nom || '').slice(0, 60)], 'fr');
  }

  if (!envoi.success) {
    return NextResponse.json({ ok: false, error: "Meta a refusé l'envoi — vérifie le numéro et l'état du compte." }, { status: 502 });
  }

  // ── Le passage de relais à Stella ──
  //
  // On consigne le message sortant AVEC le prospect : à la réponse, le webhook
  // retrouve la conversation, Stella sait à qui elle parle et reprend le fil.
  // Sans cette ligne, elle découvrirait un numéro inconnu et repartirait de zéro.
  const { data: profil } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  const { resolveOrgId } = await import('@/lib/tenant');
  const orgId = await resolveOrgId(supabase, (profil as any)?.id || user.id);

  await supabase.from('whatsapp_conversations').insert({
    phone_number: numero,
    prospect_id: prospectId,
    org_id: orgId,
    role: 'assistant',
    message: texte,
    message_type: ouverte ? 'text' : 'template',
    whatsapp_message_id: envoi.messageId || null,
    created_at: new Date().toISOString(),
  });

  await supabase.from('crm_prospects').update({
    whatsapp_phone: numero,
    whatsapp_last_message_at: new Date().toISOString(),
    last_contacted_at: new Date().toISOString(),
    last_contact_channel: 'whatsapp',
    active_channel: 'whatsapp',
    updated_at: new Date().toISOString(),
  }).eq('id', prospectId);

  return NextResponse.json({
    ok: true,
    envoye_depuis: expediteur.numero,
    vers: numero,
    mode: ouverte ? 'message libre (fenêtre ouverte)' : 'modèle (premier contact)',
    stella_prend_la_suite: true,
    message: texte,
  });
}
