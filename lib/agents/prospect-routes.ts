/**
 * Geo-clustering des prospects qualifiés en TOURNÉES à pied (founder: la sortie
 * de Léo la plus rentable n'est pas un CSV éparpillé mais "8 prospects 70+ d'un
 * même quartier dense, itinéraire à pied de 2h"). Pure, déterministe.
 *
 * Clustering glouton par proximité (haversine) : on agrège les prospects dans
 * un rayon de marche autour d'un point de départ, on prend le cluster le plus
 * dense, puis on recommence. Pas de dépendance externe.
 */

export interface GeoProspect {
  id: string;
  company: string;
  lat: number;
  lng: number;
  score: number;
  [k: string]: any;
}

export interface RouteCluster {
  centroid: { lat: number; lng: number };
  prospects: GeoProspect[];
  count: number;
  avgScore: number;
  walkSpanMeters: number; // diamètre approximatif du cluster
}

const R = 6371000; // rayon Terre (m)
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Build walking routes from qualified prospects.
 * @param prospects qualified prospects WITH lat/lng (filter out those without first)
 * @param opts.radiusMeters walking radius for one cluster (default 700m ≈ quartier)
 * @param opts.minPerRoute drop clusters smaller than this (default 3)
 * @param opts.maxPerRoute cap a route (default 10 — ~2h à pied)
 */
export function buildWalkingRoutes(
  prospects: GeoProspect[],
  opts: { radiusMeters?: number; minPerRoute?: number; maxPerRoute?: number } = {},
): RouteCluster[] {
  const radius = opts.radiusMeters ?? 700;
  const minPer = opts.minPerRoute ?? 3;
  const maxPer = opts.maxPerRoute ?? 10;
  const pts = prospects.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const remaining = [...pts];
  const routes: RouteCluster[] = [];

  while (remaining.length > 0) {
    // Anchor = highest-score remaining prospect (start the route on a strong one).
    remaining.sort((a, b) => b.score - a.score);
    const anchor = remaining[0];
    // Gather everything within walking radius of the anchor.
    const near = remaining.filter(p => haversine(anchor, p) <= radius);
    near.sort((a, b) => b.score - a.score);
    const cluster = near.slice(0, maxPer);
    // Remove clustered from remaining.
    const ids = new Set(cluster.map(c => c.id));
    for (let i = remaining.length - 1; i >= 0; i--) if (ids.has(remaining[i].id)) remaining.splice(i, 1);

    if (cluster.length >= minPer) {
      const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
      let span = 0;
      for (let i = 0; i < cluster.length; i++) for (let j = i + 1; j < cluster.length; j++) span = Math.max(span, haversine(cluster[i], cluster[j]));
      routes.push({
        centroid: { lat, lng }, prospects: cluster, count: cluster.length,
        avgScore: Math.round(cluster.reduce((s, p) => s + p.score, 0) / cluster.length),
        walkSpanMeters: Math.round(span),
      });
    }
  }
  // Best routes first: density × quality.
  return routes.sort((a, b) => (b.count * b.avgScore) - (a.count * a.avgScore));
}
