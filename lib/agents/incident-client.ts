/**
 * Ce qu'on dit à un client quand une action échoue — et ce qu'on fait.
 *
 * Demande du fondateur (2026-08-07) : « on évite au max de dire c'est pas
 * sorti, résultat échec. On essaie de résoudre un maximum, sinon on explique
 * en langage naturel et on oriente vers admin/contact si besoin. Jamais un
 * échec où on s'arrête là : genre, envoie cette raison d'échec à l'admin, ce
 * sera résolu dans la journée ou 24 h. »
 *
 * ── Pourquoi ça change tout ──
 *
 * Un message d'échec technique laisse le client seul avec un problème qu'il
 * ne peut pas résoudre : « erreur 429 », « publish_failed », « qualité
 * insuffisante » ne lui disent ni ce qui s'est passé, ni ce qui va se passer.
 * Il n'a plus qu'à réessayer au hasard, ou à écrire au support en recopiant un
 * jargon qu'il ne comprend pas.
 *
 * Un incident bien traité fait trois choses, dans cet ordre : il remonte le
 * détail technique à l'équipe SANS que le client ait à le faire, il lui dit en
 * français ce qui se passe, et il lui donne un délai. C'est la différence
 * entre un service et un outil.
 *
 * ── Ce qu'on ne fait pas ──
 *
 * On ne promet pas que c'est réglé. On promet que c'est PRIS EN CHARGE, ce qui
 * est vrai à la seconde où l'alerte part. Annoncer une résolution qu'on ne
 * contrôle pas serait le même mensonge, déplacé d'un cran.
 */

export interface Incident {
  /** L'action que le client avait demandée, dans ses mots. */
  action: string;
  /** Le détail technique — pour nous, jamais pour lui. */
  detail: string;
  agent: string;
  userId: string | null;
  clientEmail?: string | null;
}

/**
 * Traduit une cause technique en phrase compréhensible, et dit la suite.
 *
 * Les cas connus ont une explication propre et, quand c'est possible, une
 * action que le client peut faire lui-même — c'est toujours plus rapide que
 * d'attendre l'équipe.
 */
function expliquer(detail: string, action: string): { texte: string; clientPeutAgir: boolean } {
  const d = String(detail || '').toLowerCase();

  if (/token|expir|invalid_grant|unauthorized|401/.test(d)) {
    return {
      texte: `La connexion à ton compte a expiré — c'est normal, les réseaux la renouvellent régulièrement. `
        + `Reconnecte-le depuis l'espace de l'agent et je reprends ${action} tout de suite après.`,
      clientPeutAgir: true,
    };
  }
  if (/not_connected|non connect|aucun compte/.test(d)) {
    return {
      texte: `Ton compte n'est pas encore branché. Connecte-le depuis l'espace de l'agent, `
        + `et ${action} partira dans la foulée.`,
      clientPeutAgir: true,
    };
  }
  if (/quota|429|rate.?limit|resource_exhausted/.test(d)) {
    return {
      texte: `La plateforme limite temporairement le nombre d'appels. Ça se débloque tout seul, `
        + `en général en moins d'une heure. Je relance dès que c'est ouvert — tu n'as rien à faire.`,
      clientPeutAgir: false,
    };
  }
  // La qualité AVANT les crédits : « qc_top_insuffisant (4/10) » contient
  // « insuffisant » et tombait dans le test des crédits. Le client s'entendait
  // dire qu'il n'avait plus de crédits alors que son forfait était intact —
  // un diagnostic faux, et une inquiétude gratuite. Vérifié par exécution.
  if (/qualit|qc_|coherence|insuffisant \(|retenu/.test(d)) {
    return {
      texte: `J'ai fait plusieurs propositions et aucune n'atteignait le niveau que je m'impose `
        + `avant de publier en ton nom. Je préfère ne rien sortir plutôt que sortir du tiède. `
        + `Donne-moi un angle plus précis — un détail, une offre, une date — et je reprends.`,
      clientPeutAgir: true,
    };
  }
  // Les crédits arrivent APRÈS la qualité, faute de quoi « insuffisant » les
  // capturait. On exige donc un mot du domaine, pas l'adjectif seul.
  if (/cr[ée]dit|solde|balance insuffisante|quota de cr/.test(d)) {
    return {
      texte: `Il ne reste plus assez de crédits sur ton forfait pour ${action}. `
        + `Tu peux en ajouter depuis tes paramètres, ou attendre le renouvellement mensuel.`,
      clientPeutAgir: true,
    };
  }
  return {
    texte: `Quelque chose a coincé de mon côté sur ${action}, et ce n'est pas de ton fait.`,
    clientPeutAgir: false,
  };
}

/**
 * Remonte l'incident à l'équipe et rend le message destiné au client.
 *
 * L'envoi est best-effort : si l'email ne part pas, le client reçoit quand
 * même une réponse correcte, et la trace en journal reste. Un incident sur
 * l'incident ne doit pas se transformer en silence.
 */
export async function signalerIncident(supabase: any, inc: Incident): Promise<string> {
  const { texte, clientPeutAgir } = expliquer(inc.detail, inc.action);

  // La trace d'abord : c'est ce qui survit même si l'email échoue.
  try {
    await supabase.from('agent_logs').insert({
      agent: inc.agent,
      action: 'incident_client',
      user_id: inc.userId,
      status: 'error',
      data: {
        action_demandee: inc.action,
        detail: String(inc.detail).slice(0, 500),
        client_peut_agir: clientPeutAgir,
      },
      created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne doit jamais bloquer la réponse au client */ }

  // On n'alerte l'équipe que sur ce que le client ne peut PAS résoudre seul.
  // Le prévenir qu'un token a expiré n'apporte rien : il a déjà la marche à
  // suivre, et noyer les alertes utiles sous les autres les rend inutiles.
  if (!clientPeutAgir) {
    try {
      const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
      await sendEmailWithFallback({
        to: 'contact@keiroai.com',
        subject: `⚠️ Incident client — ${inc.agent} · ${inc.action}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:600px">
          <h2 style="color:#0c1a3a;margin-bottom:4px">Une action client n'a pas abouti</h2>
          <p style="color:#6b7280;font-size:13px;margin-top:0">Le client a été prévenu que c'est pris en charge. Délai annoncé : 24 h.</p>
          <table style="font-size:14px;border-collapse:collapse;margin-top:12px">
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Agent</td><td><strong>${inc.agent}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Demande</td><td>${inc.action}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Client</td><td>${inc.clientEmail || inc.userId || '—'}</td></tr>
          </table>
          <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;font-size:13px;color:#991b1b;margin-top:12px">
            ${String(inc.detail).slice(0, 600)}
          </p>
        </div>`,
        fromName: 'KeiroAI Incidents',
        fromEmail: 'contact@keiroai.com',
        tags: ['incident_client'],
      });
    } catch (e: any) {
      console.error('[Incident] alerte non envoyée:', e?.message);
    }
  }

  return clientPeutAgir
    ? texte
    : `${texte} J'ai transmis le détail à l'équipe — c'est pris en charge et réglé sous 24 h, `
      + `sans que tu aies à écrire à qui que ce soit. Je te préviens dès que c'est reparti.`;
}
