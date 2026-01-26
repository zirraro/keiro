import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { user, error: authError } = await getAuthUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }

  try {
    // Lister les fichiers de l'utilisateur
    const { data: files, error: listError } = await supabase.storage
      .from('instagram-media')
      .list(user.id, {
        limit: 10,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) {
      return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
    }

    // Générer les URLs publiques pour chaque fichier
    const filesWithUrls = files?.map(file => {
      const { data: urlData } = supabase.storage
        .from('instagram-media')
        .getPublicUrl(`${user.id}/${file.name}`);

      return {
        name: file.name,
        size: file.metadata?.size,
        publicUrl: urlData.publicUrl,
        created: file.created_at,
      };
    }) || [];

    // Vérifier le bucket
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucket = buckets?.find(b => b.name === 'instagram-media');

    return NextResponse.json({
      ok: true,
      user_id: user.id,
      bucket: {
        exists: !!bucket,
        public: bucket?.public,
        name: bucket?.name,
      },
      files: filesWithUrls,
      count: files?.length || 0,
      instructions: {
        message: 'Testez les URLs ci-dessus dans votre navigateur',
        note: 'Si elles ne fonctionnent pas, le bucket doit être rendu public dans Supabase Dashboard',
      }
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
