export function safeHref(u?: string): string {
  if (!u) return "#";
  try {
    const x = new URL(u);
    return x.toString();
  } catch {
    const clean = String(u).trim();
    if (/^https?:\/\//i.test(clean)) return clean;   // déjà absolu
    return "https://" + clean.replace(/^\/+/, "");   // force https
  }
}
