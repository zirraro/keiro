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

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    userId: user.id,
    steps: []
  };

  try {
    // 1. Vérifier le bucket
    diagnostics.steps.push({ step: 1, action: 'Checking storage bucket' });
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      diagnostics.steps.push({ step: 1, error: bucketsError.message });
      return NextResponse.json({ ok: false, diagnostics });
    }

    const bucket = buckets?.find(b => b.name === 'instagram-media');
    diagnostics.steps.push({
      step: 1,
      result: bucket ? `Bucket exists: ${bucket.name} (public: ${bucket.public})` : 'Bucket NOT found'
    });

    // 2. Vérifier le profil Instagram
    diagnostics.steps.push({ step: 2, action: 'Checking Instagram profile' });
    const { data: profile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, instagram_username')
      .eq('id', user.id)
      .single();

    diagnostics.steps.push({
      step: 2,
      result: {
        hasBusinessId: !!profile?.instagram_business_account_id,
        hasToken: !!profile?.instagram_access_token,
        username: profile?.instagram_username || 'N/A'
      }
    });

    if (!profile?.instagram_business_account_id || !profile?.instagram_access_token) {
      diagnostics.steps.push({ step: 2, error: 'Missing Instagram credentials' });
      return NextResponse.json({ ok: false, diagnostics });
    }

    // 3. Tester l'API Instagram
    diagnostics.steps.push({ step: 3, action: 'Testing Instagram Graph API' });
    const fields = 'id,media_url,thumbnail_url,media_type';
    const instagramApiUrl = `https://graph.facebook.com/v20.0/${profile.instagram_business_account_id}/media?fields=${fields}&limit=3&access_token=${profile.instagram_access_token}`;

    const response = await fetch(instagramApiUrl);
    const data = await response.json();

    if (data.error) {
      diagnostics.steps.push({ step: 3, error: data.error });
      return NextResponse.json({ ok: false, diagnostics });
    }

    diagnostics.steps.push({
      step: 3,
      result: `Found ${data.data?.length || 0} posts`
    });

    // 4. Tester le téléchargement d'une image
    if (data.data && data.data.length > 0) {
      const testPost = data.data[0];
      const imageUrl = testPost.media_url || testPost.thumbnail_url;

      diagnostics.steps.push({
        step: 4,
        action: `Testing image download for post ${testPost.id}`,
        imageUrl
      });

      try {
        const imageResponse = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*',
          }
        });

        diagnostics.steps.push({
          step: 4,
          result: {
            status: imageResponse.status,
            statusText: imageResponse.statusText,
            contentType: imageResponse.headers.get('content-type'),
            contentLength: imageResponse.headers.get('content-length'),
          }
        });

        if (imageResponse.ok) {
          const arrayBuffer = await imageResponse.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          diagnostics.steps.push({
            step: 4,
            result: `Downloaded ${buffer.length} bytes`
          });

          // 5. Tester l'upload vers Storage
          if (bucket) {
            diagnostics.steps.push({ step: 5, action: 'Testing Storage upload' });

            const fileName = `${user.id}/test_${Date.now()}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('instagram-media')
              .upload(fileName, buffer, {
                contentType: 'image/jpeg',
                upsert: true,
              });

            if (uploadError) {
              diagnostics.steps.push({ step: 5, error: uploadError });
            } else {
              const { data: { publicUrl } } = supabase.storage
                .from('instagram-media')
                .getPublicUrl(fileName);

              diagnostics.steps.push({
                step: 5,
                result: {
                  uploaded: true,
                  fileName,
                  publicUrl
                }
              });

              // Nettoyer le fichier test
              await supabase.storage
                .from('instagram-media')
                .remove([fileName]);
            }
          }
        }
      } catch (downloadError: any) {
        diagnostics.steps.push({
          step: 4,
          error: downloadError.message
        });
      }
    }

    // 6. Lister les fichiers existants
    if (bucket) {
      diagnostics.steps.push({ step: 6, action: 'Listing existing files' });
      const { data: files, error: listError } = await supabase.storage
        .from('instagram-media')
        .list(user.id, {
          limit: 10,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (listError) {
        diagnostics.steps.push({ step: 6, error: listError });
      } else {
        diagnostics.steps.push({
          step: 6,
          result: {
            fileCount: files?.length || 0,
            files: files?.map(f => ({ name: f.name, size: f.metadata?.size })) || []
          }
        });
      }
    }

    return NextResponse.json({
      ok: true,
      diagnostics,
      summary: 'Diagnostic completed - check steps for details'
    });

  } catch (error: any) {
    diagnostics.steps.push({
      error: 'Fatal error',
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json({ ok: false, diagnostics }, { status: 500 });
  }
}
