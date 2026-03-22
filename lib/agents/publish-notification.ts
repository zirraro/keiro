/**
 * Send a publication approval notification email to admin.
 * Admin receives email with visual preview + approve/regenerate buttons.
 */

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
  },
  supabase: any,
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

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
    <h2 style="margin:8px 0 4px;color:#1a1a2e;font-size:18px;">Nouveau post ${platformLabel} pret</h2>
    <p style="margin:0;color:#6b7280;font-size:13px;">${post.scheduled_date} — ${post.format || 'post'}</p>
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
    Si vous ne faites rien, le post sera publie automatiquement au prochain cron.
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
        subject: `${platformLabel}: "${(post.hook || post.caption || 'Nouveau post').substring(0, 50)}" pret a publier`,
        html,
      }),
    });

    if (!res.ok) {
      console.error('[PublishNotification] Resend error:', await res.text());
      return false;
    }

    console.log(`[PublishNotification] Sent approval email for post ${post.id} to ${adminEmail}`);
    return true;
  } catch (err: any) {
    console.error('[PublishNotification] Error:', err.message);
    return false;
  }
}
