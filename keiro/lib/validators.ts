import { z } from "zod";

export const NewsItemSchema = z.object({
  id: z.string(),
  source: z.string().optional().default(""),
  category: z.string().optional().default(""),
  title: z.string(),
  snippet: z.string().optional().default(""),
  hot: z.boolean().optional(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export const GeneratePayloadSchema = z.object({
  audience: z.string(),
  objective: z.string(),
  ton: z.string(),
  brand: z.string().optional().default(""),
  format: z.string(),
  lang: z.enum(["fr", "en", "it"]).default("fr"),
  safeMode: z.boolean().default(true),
  selectedNews: z.array(NewsItemSchema.pick({ id: true, title: true, snippet: true, source: true })).min(1, "Sélectionne au moins 1 actu"),
});
export type GeneratePayload = z.infer<typeof GeneratePayloadSchema>;
