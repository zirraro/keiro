import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/support/contact
 * Envoyer un message de support par email
 */
export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message, technicalDetails } = await req.json();

    // Validation
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { ok: false, error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'Email invalide' },
        { status: 400 }
      );
    }

    // Construire le corps de l'email
    const emailBody = `
Nouvelle demande de support - Keiro

De: ${name} <${email}>
Sujet: ${subject}

Message:
${message}

${technicalDetails ? `
---
Détails techniques:
${technicalDetails}
` : ''}

---
Date: ${new Date().toLocaleString('fr-FR')}
IP: ${req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'Unknown'}
User-Agent: ${req.headers.get('user-agent') || 'Unknown'}
    `.trim();

    console.log('[Support] New contact request:', {
      name,
      email,
      subject,
      timestamp: new Date().toISOString()
    });

    // TODO: Implémenter l'envoi d'email réel
    // Options:
    // 1. Resend API (https://resend.com)
    // 2. SendGrid
    // 3. Nodemailer avec SMTP
    // 4. AWS SES

    // Pour l'instant, on utilise un service comme Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (RESEND_API_KEY) {
      // Utiliser Resend pour envoyer l'email
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Keiro Support <support@keiroai.com>',
          to: ['contact@keiroai.com'],
          reply_to: email,
          subject: `[Support] ${subject}`,
          text: emailBody,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(to right, #9333ea, #2563eb); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .info { background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
    .label { font-weight: bold; color: #6b7280; }
    .technical { background: #f3f4f6; padding: 10px; border-left: 4px solid #9333ea; margin-top: 15px; font-family: monospace; font-size: 12px; }
    .footer { background: #f9fafb; padding: 15px; text-align: center; color: #6b7280; font-size: 12px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">📧 Nouvelle demande de support</h2>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Keiro Support</p>
    </div>

    <div class="content">
      <div class="info">
        <p><span class="label">De:</span> ${name}</p>
        <p><span class="label">Email:</span> <a href="mailto:${email}">${email}</a></p>
        <p><span class="label">Sujet:</span> ${subject}</p>
      </div>

      <div class="info">
        <p class="label">Message:</p>
        <p style="white-space: pre-wrap;">${message}</p>
      </div>

      ${technicalDetails ? `
      <div class="technical">
        <p class="label">Détails techniques:</p>
        <pre style="white-space: pre-wrap; margin: 5px 0 0 0;">${technicalDetails}</pre>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>Date: ${new Date().toLocaleString('fr-FR')}</p>
      <p>IP: ${req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'Unknown'}</p>
    </div>
  </div>
</body>
</html>
          `
        })
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error('[Support] Resend API error:', errorText);
        throw new Error('Erreur lors de l\'envoi de l\'email');
      }

      const resendData = await resendResponse.json();
      console.log('[Support] Email sent via Resend:', resendData.id);
    } else {
      // Fallback: Log uniquement (mode développement)
      console.log('[Support] Email would be sent (no RESEND_API_KEY configured):');
      console.log(emailBody);
      console.log('\n---\nNote: Configure RESEND_API_KEY in .env to send real emails');
    }

    return NextResponse.json({
      ok: true,
      message: 'Message envoyé avec succès. Nous vous répondrons sous 24h.'
    });

  } catch (error: any) {
    console.error('[Support] Error sending contact message:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de l\'envoi du message' },
      { status: 500 }
    );
  }
}
