'use client';

import { useEffect, useState } from 'react';

export default function DebugCloudConvertPage() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDebugInfo() {
      try {
        // Test 1: Check CloudConvert status
        const debugRes = await fetch('/api/debug/cloudconvert');
        const debugData = await debugRes.json();
        setDebugInfo(debugData);

        // Test 2: Try conversion
        const testRes = await fetch('/api/convert-video-tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: 'https://example.com/test.mp4'
          })
        });
        const testData = await testRes.json();
        setTestResult(testData);
      } catch (error: any) {
        console.error('Debug error:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDebugInfo();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">🔍 Diagnostic CloudConvert</h1>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">🔍 Diagnostic CloudConvert</h1>

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Informations système</h2>
              <div className="bg-gray-50 p-4 rounded space-y-2 font-mono text-sm">
                <div><strong>URL actuelle:</strong> {window.location.href}</div>
                <div><strong>Environnement:</strong> {debugInfo?.environment}</div>
                <div><strong>Vercel ENV:</strong> {debugInfo?.vercel_env}</div>
                <div><strong>Timestamp:</strong> {debugInfo?.timestamp}</div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">Status CloudConvert API</h2>
              <div className={`p-4 rounded ${debugInfo?.cloudconvert_configured ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="font-mono text-sm space-y-2">
                  <div>
                    <strong>Configuré:</strong>{' '}
                    <span className={debugInfo?.cloudconvert_configured ? 'text-green-600' : 'text-red-600'}>
                      {debugInfo?.cloudconvert_configured ? '✅ OUI' : '❌ NON'}
                    </span>
                  </div>
                  <div><strong>Longueur clé:</strong> {debugInfo?.api_key_length} caractères</div>
                  <div><strong>Preview clé:</strong> {debugInfo?.api_key_preview}</div>
                  <div className="mt-2 pt-2 border-t">
                    <strong>Message:</strong> {debugInfo?.message}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">Test de conversion</h2>
              <div className={`p-4 rounded ${testResult?.ok ? 'bg-green-50' : 'bg-yellow-50'}`}>
                <div className="font-mono text-sm space-y-2">
                  <div>
                    <strong>Succès:</strong>{' '}
                    <span className={testResult?.ok ? 'text-green-600' : 'text-yellow-600'}>
                      {testResult?.ok ? '✅ OUI' : '⚠️ NON'}
                    </span>
                  </div>
                  {testResult?.error && (
                    <div><strong>Erreur:</strong> <span className="text-red-600">{testResult.error}</span></div>
                  )}
                  {testResult?.requiresCloudConvertSetup && (
                    <div className="text-red-600 font-semibold">⚠️ La clé CloudConvert n'est pas chargée côté serveur!</div>
                  )}
                  {testResult?.message && (
                    <div className="mt-2 pt-2 border-t">
                      <strong>Message:</strong> <pre className="whitespace-pre-wrap text-xs">{testResult.message}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded">
              <h3 className="font-semibold mb-2">🔧 Diagnostic</h3>
              <div className="text-sm space-y-2">
                {debugInfo?.cloudconvert_configured && testResult?.requiresCloudConvertSetup && (
                  <div className="text-red-600">
                    ❌ <strong>Problème détecté:</strong> L'endpoint /api/debug/cloudconvert voit la clé,
                    mais /api/convert-video-tiktok ne la voit pas!
                    <br/>
                    <strong>Solution:</strong> Le domaine {window.location.hostname} pointe probablement
                    vers un ancien déploiement Vercel. Allez sur Vercel Dashboard et promouvez le dernier déploiement.
                  </div>
                )}
                {!debugInfo?.cloudconvert_configured && (
                  <div className="text-red-600">
                    ❌ <strong>Problème:</strong> La clé CloudConvert n'est pas chargée dans ce déploiement.
                    <br/>
                    <strong>Solution:</strong> Vérifiez que la variable CLOUDCONVERT_API_KEY est bien définie
                    dans Vercel pour l'environnement {debugInfo?.vercel_env}.
                  </div>
                )}
                {debugInfo?.cloudconvert_configured && testResult?.ok && (
                  <div className="text-green-600">
                    ✅ <strong>Tout fonctionne!</strong> CloudConvert est correctement configuré.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t">
              <a
                href="/library"
                className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                ← Retour à la galerie
              </a>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">📝 Données complètes (JSON)</h2>
          <details>
            <summary className="cursor-pointer text-blue-600 hover:text-blue-800">Voir les détails techniques</summary>
            <pre className="mt-4 bg-gray-900 text-green-400 p-4 rounded overflow-auto text-xs">
{JSON.stringify({ debugInfo, testResult }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
