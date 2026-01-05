import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    // Initialiser le client Supabase à l'intérieur de la fonction pour éviter les erreurs au build
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Freemium] Missing environment variables');
      return Response.json({
        ok: false,
        error: 'Server configuration error'
      }, { status: 500 });
    }

    // Utiliser la service key pour bypasser RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { email, type } = await request.json();

    if (!email || typeof email !== 'string') {
      return Response.json({
        ok: false,
        error: 'Email is required'
      }, { status: 400 });
    }

    console.log('[Freemium] Capturing email:', email, 'Type:', type);

    // Vérifier si l'email existe déjà
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('freemium_emails')
      .select('*')
      .eq('email', email)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (c'est normal si l'email n'existe pas)
      console.error('[Freemium] Error checking existing email:', selectError);
      return Response.json({
        ok: false,
        error: 'Database error'
      }, { status: 500 });
    }

    if (existing) {
      // L'email existe déjà, incrémenter le compteur approprié
      console.log('[Freemium] Email exists, updating counter');

      const updateData: any = {};
      if (type === 'generation') {
        updateData.generation_count = (existing.generation_count || 0) + 1;
      } else if (type === 'edit') {
        updateData.edit_count = (existing.edit_count || 0) + 1;
      }
      updateData.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('freemium_emails')
        .update(updateData)
        .eq('email', email);

      if (updateError) {
        console.error('[Freemium] Error updating email:', updateError);
        return Response.json({
          ok: false,
          error: 'Failed to update email'
        }, { status: 500 });
      }

      return Response.json({ ok: true, message: 'Email updated' });
    } else {
      // Nouvel email, l'insérer
      console.log('[Freemium] New email, inserting');

      const insertData: any = {
        email,
        generation_count: type === 'generation' ? 1 : 0,
        edit_count: type === 'edit' ? 1 : 0,
      };

      const { error: insertError } = await supabaseAdmin
        .from('freemium_emails')
        .insert([insertData]);

      if (insertError) {
        console.error('[Freemium] Error inserting email:', insertError);
        return Response.json({
          ok: false,
          error: 'Failed to save email'
        }, { status: 500 });
      }

      return Response.json({ ok: true, message: 'Email captured' });
    }
  } catch (error: any) {
    console.error('[Freemium] Error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}
