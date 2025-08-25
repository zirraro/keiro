/**
 * Helpers simples pour appeler l'API Graph.
 * NB : on ne gère pas ici les tokens long-lived; pour la prod, ajoute l'échange en 60j si besoin.
 */
const GRAPH = "https://graph.facebook.com/v20.0";

export async function graphGET<T>(path: string, accessToken: string, params: Record<string,string|number|boolean> = {}): Promise<T> {
  const usp = new URLSearchParams({ access_token: accessToken, ...Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)])) });
  const res = await fetch(`${GRAPH}${path}?${usp.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function graphPOST<T>(path: string, accessToken: string, body: Record<string,string|number|boolean> = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: accessToken, ...Object.fromEntries(Object.entries(body).map(([k,v])=>[k,String(v)])) }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export type FbPage = { id: string; name: string; access_token?: string };
export type IgAccount = { id: string; username: string };

export async function getUserPages(userToken: string): Promise<FbPage[]> {
  const data = await graphGET<{ data: FbPage[] }>("/me/accounts", userToken, { fields: "id,name,access_token" });
  return data.data || [];
}

export async function getPageInstagramAccount(pageId: string, pageAccessToken: string): Promise<IgAccount|null> {
  const page = await graphGET<{ instagram_business_account?: { id: string } }>(`/${pageId}`, pageAccessToken, { fields: "instagram_business_account" });
  if (!page.instagram_business_account?.id) return null;
  const ig = await graphGET<IgAccount>(`/${page.instagram_business_account.id}`, pageAccessToken, { fields: "id,username" });
  return ig;
}

export async function publishToFacebookPage(pageId: string, pageAccessToken: string, message: string, link?: string) {
  // Pour une image => POST /{page-id}/photos (avec url) ; pour texte/lien => /feed
  if (link) {
    return graphPOST<{ id: string }>(`/${pageId}/feed`, pageAccessToken, { message, link });
  }
  return graphPOST<{ id: string }>(`/${pageId}/feed`, pageAccessToken, { message });
}

export async function publishImageToInstagram(igUserId: string, pageAccessToken: string, imageUrl: string, caption?: string) {
  // 1) Créer un "container"
  const container = await graphPOST<{ id: string }>(`/${igUserId}/media`, pageAccessToken, {
    image_url: imageUrl,
    caption: caption || "",
  });
  // 2) Publier
  const publish = await graphPOST<{ id: string }>(`/${igUserId}/media_publish`, pageAccessToken, {
    creation_id: container.id,
  });
  return publish;
}
