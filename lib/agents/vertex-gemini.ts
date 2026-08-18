import crypto from 'crypto';

/**
 * Gemini par Vertex AI, sur une région européenne.
 *
 * ── Pourquoi cette voie existe ──
 *
 * Le 17 août à 08 h 21, le dernier appel Gemini réussi part du VPS. Ensuite,
 * l'API AI Studio (`generativelanguage.googleapis.com`) répond :
 *
 *   400 FAILED_PRECONDITION — User location is not supported for the API use
 *
 * La même clé fonctionne depuis un poste en France. Ce n'est donc pas un
 * blocage par pays, mais par PLAGE D'ADRESSES : Google restreint l'API AI
 * Studio depuis les adresses de datacenters, et celle d'OVH est passée du
 * mauvais côté. Rien n'a changé chez nous ; la classification a changé chez
 * eux — d'où le « d'un coup ».
 *
 * Vertex AI est l'entrée entreprise du même modèle. Elle s'authentifie par
 * compte de service et non par clé d'API, elle est explicitement régionalisée
 * (`europe-west1` ici), et elle n'applique pas ce filtrage.
 *
 * ── Ce qu'il manque, et qui n'est pas dans le code ──
 *
 * Une clé de compte de service, à créer une fois dans la console Google Cloud
 * (rôle « Utilisateur Vertex AI »), puis déposée dans `GOOGLE_VERTEX_SA_JSON`.
 * Tant qu'elle est absente, ce module se déclare indisponible et la chaîne
 * passe au fournisseur suivant : rien ne casse, rien ne bloque.
 *
 * Attention au nom : `GOOGLE_SERVICE_ACCOUNT_JSON` existe déjà mais contient un
 * client OAuth web (`{"web":{...}}`), sans clé privée — il ne convient pas.
 * Et le `GOOGLE_REFRESH_TOKEN` du parc ne porte que la portée Search Console.
 */

export const REGION_VERTEX = process.env.GOOGLE_VERTEX_REGION || 'europe-west1';

interface CompteService {
  client_email: string;
  private_key: string;
  project_id: string;
}

function compteService(): CompteService | null {
  const brut = process.env.GOOGLE_VERTEX_SA_JSON;
  if (!brut) return null;
  try {
    // On accepte le JSON direct ou encodé en base64 : les deux circulent selon
    // la façon dont la variable a été posée sur la machine.
    const texte = brut.trim().startsWith('{') ? brut : Buffer.from(brut, 'base64').toString('utf8');
    const j = JSON.parse(texte);
    if (!j.client_email || !j.private_key || !j.project_id) return null;
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, '\n'), project_id: j.project_id };
  } catch {
    return null;
  }
}

export function vertexDisponible(): boolean {
  return !!compteService();
}

// Un jeton Google vit une heure. On le garde pour ne pas repayer une
// signature et un aller-retour à chaque image jugée.
let jetonCache = { valeur: '', expireA: 0 };

async function jeton(sa: CompteService): Promise<string | null> {
  if (jetonCache.valeur && Date.now() < jetonCache.expireA) return jetonCache.valeur;

  const maintenant = Math.floor(Date.now() / 1000);
  const entete = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const charge = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: maintenant + 3600,
    iat: maintenant,
  })).toString('base64url');

  const signature = crypto.createSign('RSA-SHA256')
    .update(`${entete}.${charge}`)
    .sign(sa.private_key, 'base64url');

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${entete}.${charge}.${signature}`,
      }),
    });
    const j: any = await r.json();
    if (!j.access_token) {
      console.warn('[Vertex] jeton refusé :', JSON.stringify(j).slice(0, 200));
      return null;
    }
    // Une minute de marge : un jeton qui expire en vol coûte un appel raté.
    jetonCache = { valeur: j.access_token, expireA: Date.now() + ((j.expires_in || 3600) - 60) * 1000 };
    return jetonCache.valeur;
  } catch (e: any) {
    console.warn('[Vertex] échange de jeton impossible :', e?.message);
    return null;
  }
}

/**
 * Un appel de vision à Gemini via Vertex, avec réponse JSON contrainte.
 *
 * Rend `null` quand la voie n'est pas disponible — jamais une exception : la
 * chaîne d'appel doit pouvoir passer au fournisseur suivant sans rien attraper.
 */
export async function visionVertex(opts: {
  system: string;
  imageBase64: string;
  mediaType: string;
  texte: string;
  maxTokens: number;
  schema?: any;
}): Promise<any | null> {
  const sa = compteService();
  if (!sa) return null;
  const jwt = await jeton(sa);
  if (!jwt) return null;

  const modele = process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash';
  const url = `https://${REGION_VERTEX}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${REGION_VERTEX}/publishers/google/models/${modele}:generateContent`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: opts.mediaType, data: opts.imageBase64 } },
            { text: opts.texte },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: opts.maxTokens,
          // Le modèle dépense sinon son budget de sortie à « réfléchir » et rend
          // une réponse vide — panne silencieuse déjà rencontrée sur AI Studio.
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          ...(opts.schema ? { responseSchema: opts.schema } : {}),
        },
      }),
    });
    if (!r.ok) {
      console.warn('[Vertex] HTTP', r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const j: any = await r.json();
    try {
      const { logApiCost } = await import('@/lib/admin/api-cost-logger');
      void logApiCost({
        provider: 'gemini', kind: 'vertex_vision', agent: 'content',
        units: j.usageMetadata?.totalTokenCount || 0,
        cost_eur: ((j.usageMetadata?.promptTokenCount || 0) * 0.3 + (j.usageMetadata?.candidatesTokenCount || 0) * 2.5) / 1e6 * 0.92,
      } as any).catch(() => {});
    } catch { /* la trace de coût ne bloque jamais un contrôle */ }
    const txt = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join('');
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (e: any) {
    console.warn('[Vertex] appel en échec :', e?.message);
    return null;
  }
}
