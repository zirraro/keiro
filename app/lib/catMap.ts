import { slugFromAny, UI_OPTIONS } from "@/app/lib/newsCategories";
export { UI_OPTIONS };
export function buildNewsUrlFixed(categoryDisplay: string, period: string, limit: number) {
  const cat = slugFromAny(categoryDisplay);
  return `/api/news/search?cat=${encodeURIComponent(cat)}&timeframe=${encodeURIComponent(period)}&limit=${limit}`;
}
