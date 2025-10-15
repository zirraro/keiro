export function absolutize(urlLike: string, base: string): string | null {
  try {
    return new URL(urlLike, base).toString();
  } catch { return null; }
}

function findMetaContent(html: string, propertyNames: string[]): string | null {
  for (const prop of propertyNames) {
    // <meta property="og:image" content="...">
    const re = new RegExp(`<meta[^>]+(?:property|name)=[\"']${prop}[\"'][^>]*?>`, "i");
    const m = html.match(re);
    if (!m) continue;
    const tag = m[0];
    const cm = tag.match(/content=["']([^"']+)["']/i);
    if (cm && cm[1]) return cm[1].trim();
  }
  return null;
}

function findFirstImg(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  return m ? m[1].trim() : null;
}

/** Essaie d’extraire une image pertinente du HTML. */
export function pickImageFromHtml(html: string, pageUrl: string): string | null {
  // 1) og:image / twitter:image
  const meta = findMetaContent(html, ["og:image", "twitter:image", "image"]);
  if (meta) {
    const abs = absolutize(meta, pageUrl);
    if (abs) return abs;
  }
  // 2) première <img>
  const img = findFirstImg(html);
  if (img) {
    const abs = absolutize(img, pageUrl);
    if (abs) return abs;
  }
  return null;
}
