import type { NextRequest } from "next/server";

const BAD_HOST_RE = /(gstatic|googleusercontent|news\.google|google\.)/i;

function absolute(base: URL, href?: string | null) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch { return null; }
}

function proxify(raw: string) {
  try {
    const u = new URL(raw);
    // Proxy via weserv (pas de CORS, pas de hotlink) + crop cover
    const path = encodeURIComponent(u.hostname + u.pathname + u.search);
    return `https://images.weserv.nl/?url=${path}&w=1200&h=630&fit=cover&we=1`;
  } catch {
    return null;
  }
}

function pickFirst<T>(...vals: (T | null | undefined)[]) {
  for (const v of vals) if (v) return v as T;
  return null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response(JSON.stringify({ image: null, reason: "missing url" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const target = new URL(url);

  // HEAD : si c'est déjà une image, renvoie direct (proxifiée)
  try {
    const head = await fetch(target, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; KeiroBot/1.0)",
        "accept-language": "fr,fr-FR;q=0.9,en;q=0.8",
      },
    });
    const ctype = head.headers.get("content-type") || "";
    if (head.ok && ctype.startsWith("image/")) {
      const im = proxify(target.toString());
      return new Response(JSON.stringify({ image: im, from: "direct" }), {
        headers: { "content-type": "application/json" },
      });
    }
  } catch { /* ignore */ }

  // GET HTML
  let html = "";
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "accept-language": "fr,fr-FR;q=0.9,en;q=0.8",
        "accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ image: null, reason: `upstream ${res.status}` }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    html = await res.text();
  } catch (e: any) {
    return new Response(JSON.stringify({ image: null, reason: e?.message || "fetch error" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  // Parsers très légers (regex) pour meta & JSON-LD
  const metas = Array.from(html.matchAll(/<meta\s+[^>]*?>/gi)).map(m => m[0]);

  const findMeta = (name: string) => {
    const re = new RegExp(`(property|name)=[\\"']${name}[\\"'][^>]*content=[\\"']([^\\"]+)[\\"']`, "i");
    for (const m of metas) {
      const mm = m.match(re);
      if (mm && mm[2]) return mm[2];
    }
    return null;
  };

  const og = pickFirst(
    findMeta("og:image:secure_url"),
    findMeta("og:image"),
    findMeta("twitter:image"),
    findMeta("twitter:image:src"),
  );

  // JSON-LD "image"
  let ldImage: string | null = null;
  const ldBlocks = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const b of ldBlocks) {
    try {
      const j = JSON.parse(b[1].trim());
      const tryPick = (obj: any): string | null => {
        if (!obj) return null;
        if (typeof obj.image === "string") return obj.image;
        if (obj.image && typeof obj.image.url === "string") return obj.image.url;
        if (Array.isArray(obj.image) && obj.image[0]) {
          const it = obj.image[0];
          if (typeof it === "string") return it;
          if (it && typeof it.url === "string") return it.url;
        }
        return null;
      };
      ldImage = pickFirst(
        tryPick(j),
        ...(Array.isArray(j) ? j.map(tryPick) : [])
      );
      if (ldImage) break;
    } catch { /* ignore */ }
  }

  const candidateRaw = pickFirst(og, ldImage);
  let candidate = candidateRaw ? absolute(target, candidateRaw) : null;

  // Filtrer les thumbs google/gstatic (souvent le "GE bleu")
  if (candidate && BAD_HOST_RE.test(candidate)) candidate = null;

  const final = candidate ? proxify(candidate) : null;

  return new Response(JSON.stringify({
    image: final, raw: candidate, from: candidate ? "meta" : null,
  }), { headers: { "content-type": "application/json" }});
}
