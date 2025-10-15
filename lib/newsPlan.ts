export type QueryPlan = { topic?: string; q?: string; timeframe: string; limit: number };
export function buildQueryPlans(topicLabel: string, timeframe: string, q: string, limit = 30): QueryPlan[] {
  // Placeholder neutre : on pourra enrichir plus tard
  return [{ timeframe, limit }];
}
