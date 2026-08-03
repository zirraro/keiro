/**
 * Email de validation d'une publication.
 *
 * 2026-08-03 — Réécrit sur trois demandes du fondateur :
 *
 *   « Je reçois des mails pour publier sur TikTok, pourquoi c'est pas en auto ?
 *     Il me semble que le toggle est activé. Si c'est parce que le token est
 *     invalide, il faut le dire dans l'email : déconnecte-toi et reconnecte-toi
 *     pour reprendre les publications en auto. »
 *
 * L'email ne disait pas POURQUOI il arrivait. Le réglage du client est bien sur
 * « auto », mais un contrôle qualité ou une connexion morte rétrograde la
 * publication en validation manuelle — sans jamais l'expliquer. Le client
 * conclut logiquement que son réglage est ignoré.
 *
 *   « Attention à pas envoyer le mail systématiquement, à envoyer si token non
 *     valide ou toggle désactivé. »
 *
 * L'email n'est donc plus une notification de routine : il ne part que lorsque
 * quelque chose EMPÊCHE la publication automatique, et il dit quoi.
 *
 *   « On facture en crédits l'envoi des emails bien sûr, disons 5 cr, mais à
 *     toi de juger le bon niveau. »
 *
 * Facturation nuancée (cf. COUT_CREDITS ci-dessous) : on ne facture pas un
 * client pour l'informer que NOTRE connexion est tombée.
 */

/**
 * Ce qui empêche la publication automatique. Détermine le message ET la
 * facturation.
 */
export type BlocagePublication =
  | 'connexion_expiree'   // jeton mort : notre problème, jamais facturé
  | 'validation_demandee' // le client a choisi de valider : service rendu
  | 'controle_qualite'    // le post n'a pas passé le contrôle : notre problème
  | 'compte_en_pause';    // pause de sécurité (portée effondrée)

/**
 * Coût en crédits, par motif.
 *
 * Le fondateur proposait 5 crédits ; j'en recommande 2, et zéro dans deux cas.
 * Raison : facturer quelqu'un pour lui annoncer que notre connexion a expiré,
 * ou que notre contrôle qualité a recalé notre propre contenu, revient à lui
 * faire payer nos pannes. Le seul cas légitime est celui où le client a
 * DEMANDÉ à valider chaque post : là, l'email est le service qu'il a choisi.
 *
 * 2 crédits (~0,10€) plutôt que 5 : l'email coûte moins d'un centime à
 * produire, et la notification d'avis Google — même nature — est à 1 crédit.
 * Rester cohérent avec l'existant vaut mieux qu'un tarif isolé.
 */
export const COUT_CREDITS: Record<BlocagePublication, number> = {
  connexion_expiree: 0,
  controle_qualite: 0,
  compte_en_pause: 0,
  validation_demandee: 2,
};

const EXPLICATIONS: Record<BlocagePublication, { titre: string; texte: string; action?: string }> = {
  connexion_expiree: {
    titre: 'Ta connexion a expiré — la publication automatique est en pause',
    texte: "Le réseau a invalidé notre accès à ton compte (ça arrive périodiquement, c'est une sécurité de leur côté). Tant qu'il n'est pas rétabli, on ne peut plus publier à ta place.",
    action: 'Reconnecte ton compte : déconnecte-le puis reconnecte-le depuis tes réglages. La publication automatique reprend immédiatement après, sans rien reprogrammer.',
  },
  validation_demandee: {
    titre: 'Ton post est prêt, il attend ta validation',
    texte: 'Tu as choisi de valider chaque publication avant sa mise en ligne.',
    action: 'Passe en publication automatique dans tes réglages si tu préfères ne plus recevoir ces emails.',
  },
  controle_qualite: {
    titre: "Ce post n'a pas passé notre contrôle qualité",
    texte: 'On préfère te le soumettre plutôt que de publier quelque chose qui pourrait desservir ton compte.',
    action: "Relis-le : s'il te convient, publie-le d'un clic. Sinon, régénère le visuel.",
  },
  compte_en_pause: {
    titre: 'Publication automatique en pause sur ce compte',
    texte: "La portée de ton compte a chuté ; on a suspendu les envois automatiques le temps qu'elle remonte.",
    action: "Tu peux publier manuellement en attendant — c'est même ce qui aide le plus à la reprise.",
  },
};

export function generateApprovalToken(postId: string): string {
  return Buffer.from(`${postId}:${process.env.CRON_SECRET || 'keiro'}`).toString('base64url').slice(0, 16);
}

export async function sendPublishNotification(
  post: {
    id: string;
    platform: string;
    caption: string;
    visual_url: string | null;
    hook: string | null;
    scheduled_date: string;
    format: string;
    user_id?: string | null;
  },
  supabase: any,
  /** Ce qui empêche la publication auto. Par défaut : le client valide lui-même. */
  motif: BlocagePublication = 'validation_demandee',
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const explication = EXPLICATIONS[motif] || EXPLICATIONS.validation_demandee;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'https://keiroai.com';
  const token = generateApprovalToken(post.id);
  const approveUrl = `${siteUrl}/api/admin/approve-publish?postId=${post.id}&action=approve&token=${token}`;
  const regenerateUrl = `${siteUrl}/api/admin/approve-publish?postId=${post.id}&action=regenerate&token=${token}`;

  const platformLabel = post.platform === 'tiktok' ? 'TikTok' : post.platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  const captionPreview = (post.caption || post.hook || '').substring(0, 200);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f4f7;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
  <div style="text-align:center;margin-bottom:16px;">
    <span style="font-size:28px;">${post.platform === 'tiktok' ? '🎬' : post.platform === 'linkedin' ? '💼' : '📷'}</span>
    <h2 style="margin:8px 0 4px;color:#1a1a2e;font-size:18px;">${explication.titre}</h2>
    <p style="margin:0;color:#6b7280;font-size:13px;">${platformLabel} · ${post.scheduled_date} — ${post.format || 'post'}</p>
  </div>

  <div style="background:${motif === 'connexion_expiree' ? '#fef2f2' : '#f0f9ff'};border-left:3px solid ${motif === 'connexion_expiree' ? '#dc2626' : '#0284c7'};padding:12px 16px;border-radius:6px;margin:16px 0;">
    <p style="margin:0;font-size:13px;color:#374151;">${explication.texte}</p>
    ${explication.action ? `<p style="margin:8px 0 0;font-size:13px;color:#111827;"><strong>${explication.action}</strong></p>` : ''}
  </div>

  ${post.visual_url ? `<div style="text-align:center;margin:16px 0;">
    <img src="${post.visual_url}" alt="Visual preview" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid #e5e7eb;" />
  </div>` : ''}

  <div style="background:#f9fafb;padding:12px 16px;border-radius:8px;margin:16px 0;">
    <p style="margin:0;font-size:13px;color:#374151;"><strong>Caption:</strong></p>
    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${captionPreview}${(post.caption || '').length > 200 ? '...' : ''}</p>
  </div>

  <div style="text-align:center;margin:24px 0 16px;">
    <a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:bold;font-size:15px;margin-right:12px;">
      Publier maintenant
    </a>
    <a href="${regenerateUrl}" style="display:inline-block;background:#fff;color:#7c3aed;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:14px;border:2px solid #7c3aed;">
      Regenerer le visuel
    </a>
  </div>

  <p style="text-align:center;font-size:11px;color:#9ca3af;">
    ${motif === 'connexion_expiree'
      ? 'Tant que le compte n\'est pas reconnecté, ce post ne partira pas tout seul.'
      : 'Sans action de ta part, le post part automatiquement au prochain passage.'}
  </p>
</div>
<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">
  <a href="${siteUrl}/admin/dm-queue?tab=pub_instagram" style="color:#7c3aed;text-decoration:none;">Voir tous les posts</a> · KeiroAI Agent Contenu
</div></div></body></html>`;

  try {
    // Get admin email from profiles
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('is_admin', true)
      .limit(1)
      .single();

    const adminEmail = adminProfile?.email || 'contact@keiroai.com';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lena — Content KeiroAI <content@keiroai.com>',
        to: [adminEmail],
        subject: motif === 'connexion_expiree'
          ? `⚠️ ${platformLabel} déconnecté — reconnecte pour reprendre la publication auto`
          : `${platformLabel} : "${(post.hook || post.caption || 'Nouveau post').substring(0, 45)}" attend ta validation`,
        html,
      }),
    });

    if (!res.ok) {
      console.error('[PublishNotification] Resend error:', await res.text());
      return false;
    }

    // Facturé seulement si l'email rend un service demandé — jamais quand il
    // signale une panne de notre côté. Et seulement après un envoi réussi.
    const cout = COUT_CREDITS[motif] ?? 0;
    if (cout > 0 && post.user_id) {
      try {
        const { deductCredits } = await import('@/lib/credits/server');
        await deductCredits(post.user_id, 'agent_chat', `Email de validation ${platformLabel}`, undefined, cout);
      } catch { /* la facturation ne doit jamais empêcher la notification */ }
    }

    console.log(`[PublishNotification] email envoyé (motif: ${motif}, ${cout} cr) pour ${post.id} → ${adminEmail}`);
    return true;
  } catch (err: any) {
    console.error('[PublishNotification] Error:', err.message);
    return false;
  }
}
