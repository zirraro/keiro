export function getPublicBaseUrl() {
  // Priorité à PUBLIC_BASE_URL si tu la renseignes dans Vercel,
  // sinon on retombe automatiquement sur https://VERCEL_URL
  const envBase = process.env.PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  // Local fallback
  const port = process.env.PORT || '3046';
  return `http://localhost:${port}`;
}
