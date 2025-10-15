"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus } from "lucide-react";

export type NewsItem = {
  id: string;
  source: string;
  category: string;
  title: string;
  snippet: string;
  hot?: boolean;
};

export function NewsCard({ item, onUse }: { item: NewsItem; onUse: (id: string) => void }) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-28 w-full bg-gradient-to-br from-gray-100 to-gray-200" />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground truncate">{item.source}</div>
          <div className="flex items-center gap-1">
            {item.hot && <Badge variant="destructive">Hot</Badge>}
            <Badge variant="secondary">{item.category}</Badge>
          </div>
        </div>
        <div className="text-sm font-medium leading-snug line-clamp-2">{item.title}</div>
        <p className="text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
        <div className="flex items-center justify-between pt-1">
          <Button size="sm" className="h-7" onClick={() => onUse(item.id)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Utiliser cette actu
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <ExternalLink className="h-4 w-4 mr-1" />
            Ouvrir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
