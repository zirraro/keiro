"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type NewsItem = {
  id: string;
  source?: string;
  title: string;
  snippet?: string;
  url?: string;
  published?: string;
  thumbnailUrl?: string | null;
  hot?: boolean;
  score?: number;
};

export function NewsCard({
  item,
  onUse,
}: {
  item: NewsItem;
  onUse: (id: string) => void;
}) {
  return (
    <Card className="h-[320px] w-full overflow-hidden rounded-[10px] border flex flex-col">
      <div className="relative px-2.5 pt-2">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-[8px] bg-gray-100">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {typeof item.score === "number" && <span className="badge-score">{item.score}</span>}
          {item.hot && <span className="badge-hot">hot</span>}
        </div>
      </div>

      <CardContent className="p-2.5 pb-2 flex-1 flex flex-col gap-1.5">
        <div className="text-[10px] text-gray-500 truncate">
          {item.source ?? "—"}
          {item.published ? <> • {new Date(item.published).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" })}</> : null}
        </div>

        <div className="text-[12px] font-medium leading-snug clamp-2">{item.title}</div>
        <p className="text-[11px] text-gray-600 clamp-2">{item.snippet}</p>

        <div className="mt-auto flex items-center justify-between pt-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" asChild>
            <a href={item.url} target="_blank" rel="noreferrer">Ouvrir</a>
          </Button>
          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => onUse(item.id)}>
            Utiliser cette actu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
