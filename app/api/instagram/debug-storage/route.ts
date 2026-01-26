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

  const diagnosticResults: any = {
    ok: true,
    timestamp: new Date().toISOString(),
    user_id: user.id,
    tests: []
  };

  try {
    // TEST 1: Vérifier si le bucket existe et est public
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucket = buckets?.find(b => b.name === 'instagram-media');

    diagnosticResults.tests.push({
      test: 'Bucket Configuration',
      status: bucket ? 'PASS' : 'FAIL',
      details: {
        exists: !!bucket,
        public: bucket?.public,
        name: bucket?.name
      }
    });

    if (!bucket) {
      diagnosticResults.ok = false;
      return NextResponse.json(diagnosticResults);
    }

    // TEST 2: Lister les fichiers de l'utilisateur
    const { data: files, error: listError } = await supabase.storage
      .from('instagram-media')
      .list(user.id, {
        limit: 5,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    diagnosticResults.tests.push({
      test: 'Files in Storage',
      status: files && files.length > 0 ? 'PASS' : 'FAIL',
      details: {
        count: files?.length || 0,
        files: files?.map(f => ({
          name: f.name,
          size: f.metadata?.size || 0,
          created: f.created_at
        }))
      }
    });

    if (!files || files.length === 0) {
      diagnosticResults.tests.push({
        test: 'No files found',
        status: 'INFO',
        details: 'Run sync-media first to cache Instagram images'
      });
      return NextResponse.json(diagnosticResults);
    }

    // TEST 3: Tester les URLs publiques
    const testFile = files[0];
    const { data: urlData } = supabase.storage
      .from('instagram-media')
      .getPublicUrl(`${user.id}/${testFile.name}`);

    diagnosticResults.tests.push({
      test: 'Public URL Generation',
      status: 'PASS',
      details: {
        filename: testFile.name,
        publicUrl: urlData.publicUrl
      }
    });

    // TEST 4: Télécharger le fichier et vérifier son contenu
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('instagram-media')
        .download(`${user.id}/${testFile.name}`);

      if (downloadError) {
        diagnosticResults.tests.push({
          test: 'File Download',
          status: 'FAIL',
          details: {
            error: downloadError.message
          }
        });
        diagnosticResults.ok = false;
      } else {
        const fileSize = fileData.size;
        const isValid = fileSize > 1000; // Une vraie image doit faire au moins 1KB

        diagnosticResults.tests.push({
          test: 'File Download & Size Check',
          status: isValid ? 'PASS' : 'FAIL',
          details: {
            fileSize: `${(fileSize / 1024).toFixed(2)} KB`,
            isValidImage: isValid,
            type: fileData.type
          }
        });

        if (!isValid) {
          diagnosticResults.ok = false;
        }
      }
    } catch (err: any) {
      diagnosticResults.tests.push({
        test: 'File Download',
        status: 'ERROR',
        details: {
          error: err.message
        }
      });
      diagnosticResults.ok = false;
    }

    // TEST 5: Tester l'accessibilité HTTP de l'URL
    try {
      const testUrl = urlData.publicUrl;
      const response = await fetch(testUrl, {
        method: 'HEAD',
        cache: 'no-store'
      });

      diagnosticResults.tests.push({
        test: 'HTTP Accessibility',
        status: response.ok ? 'PASS' : 'FAIL',
        details: {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          cacheControl: response.headers.get('cache-control')
        }
      });

      if (!response.ok) {
        diagnosticResults.ok = false;
      }
    } catch (err: any) {
      diagnosticResults.tests.push({
        test: 'HTTP Accessibility',
        status: 'ERROR',
        details: {
          error: err.message
        }
      });
      diagnosticResults.ok = false;
    }

    // TEST 6: Vérifier si les posts ont des cachedUrl
    const { data: postsData } = await supabase
      .from('saved_images')
      .select('id, cached_instagram_url, instagram_media_cached_at')
      .eq('user_id', user.id)
      .not('cached_instagram_url', 'is', null)
      .limit(5);

    diagnosticResults.tests.push({
      test: 'Database Cached URLs',
      status: postsData && postsData.length > 0 ? 'PASS' : 'FAIL',
      details: {
        count: postsData?.length || 0,
        samples: postsData?.slice(0, 2).map(p => ({
          id: p.id,
          cachedUrl: p.cached_instagram_url,
          cachedAt: p.instagram_media_cached_at
        }))
      }
    });

    // Résumé final
    const failedTests = diagnosticResults.tests.filter((t: any) => t.status === 'FAIL' || t.status === 'ERROR');
    diagnosticResults.summary = {
      total: diagnosticResults.tests.length,
      passed: diagnosticResults.tests.filter((t: any) => t.status === 'PASS').length,
      failed: failedTests.length,
      errors: failedTests.map((t: any) => t.test)
    };

    return NextResponse.json(diagnosticResults, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      tests: diagnosticResults.tests
    }, { status: 500 });
  }
}
