import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Facebook Data Deletion Callback
// https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get('signed_request');

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    const [encodedSig, payload] = signedRequest.split('.');
    const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '';

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('base64url');

    if (encodedSig !== expectedSig) {
      console.error('[FacebookDataDeletion] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    // Decode payload
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const userId = decoded.user_id;

    console.log('[FacebookDataDeletion] Data deletion request for user:', userId);

    // Generate a unique confirmation code
    const confirmationCode = crypto.randomUUID();

    // Return the required response format
    // Facebook expects a JSON with url and confirmation_code
    const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://keiroai.com'}/legal/data-deletion?code=${confirmationCode}`;

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (error: any) {
    console.error('[FacebookDataDeletion] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
