"use client";
import { useEffect } from "react";

type NewsLite = { title?: string; summary?: string; topic?: string; url?: string };

export function useGenerateInterceptor(
  selectedNews?: NewsLite | null,
  activeTopic?: string
) {
  useEffect(() => {
    const orig: any = (window as any).fetch;

    (window as any).fetch = async (input: any, init?: any) => {
      try {
        const url = typeof input === "string" ? input : (input?.url ?? "");
        if (url.includes("/api/generate") && init?.method === "POST" && init?.body) {
          const body = JSON.parse(init.body as string);

          if (!body.news || !body.news.title) {
            const cand = selectedNews ?? null;
            if (cand?.title) {
              body.news = {
                title: cand.title,
                summary: cand.summary ?? "",
                topic: cand.topic ?? activeTopic ?? "business",
                url: cand.url ?? ""
              };
              init.body = JSON.stringify(body);
            }
          }
        }
      } catch {}
      return orig(input, init);
    };

    return () => { (window as any).fetch = orig; };
  }, [selectedNews, activeTopic]);
}
