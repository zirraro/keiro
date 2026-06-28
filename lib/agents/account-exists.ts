/**
 * Vérification live d'existence d'un compte social (TikTok / Instagram).
 * Founder : on ne propose JAMAIS un compte à suivre qui n'existe pas — sinon le
 * client clique et tombe dans le vide. Cache en mémoire pour borner le coût.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const existsCache = new Map<string, boolean>();

export async function accountExists(platform: string, handleRaw: string): Promise<boolean> {
  const handle = String(handleRaw || '').replace(/^@/, '').trim();
  if (!handle || !/^[a-zA-Z0-9._]{2,30}$/.test(handle)) return false;
  if (platform !== 'tiktok' && platform !== 'instagram') return true; // pas de vérif fiable (ex: linkedin)
  const key = `${platform}:${handle.toLowerCase()}`;
  const cached = existsCache.get(key);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const url = platform === 'instagram' ? `https://www.instagram.com/${handle}/` : `https://www.tiktok.com/@${handle}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(6000), redirect: 'follow' });
    if (r.status === 200) {
      const html = (await r.text()).slice(0, 400_000);
      const h = handle.toLowerCase();
      const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (platform === 'tiktok') {
        const notFound = /couldn['’]t find this account|aucun résultat trouvé|video currently unavailable/i.test(html);
        ok = !notFound && new RegExp(`"uniqueId"\\s*:\\s*"${esc}"`, 'i').test(html);
      } else {
        const notFound = /Page Not Found|Sorry, this page isn|isn['’]t available/i.test(html);
        ok = !notFound && (new RegExp(`instagram\\.com/${esc}`, 'i').test(html) || html.toLowerCase().includes(`"alternate_name":"@${h}"`));
      }
    }
  } catch { ok = false; }
  existsCache.set(key, ok);
  return ok;
}

/** Vérifie une liste de handles en parallèle (capée) → renvoie l'ensemble des existants (lowercase, sans @). */
export async function filterExisting(platform: string, handles: string[], cap = 24): Promise<Set<string>> {
  const uniq = Array.from(new Set(handles.map(h => String(h || '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean))).slice(0, cap);
  const results = await Promise.all(uniq.map(async h => ({ h, ok: await accountExists(platform, h) })));
  return new Set(results.filter(r => r.ok).map(r => r.h));
}
