"use client";
import * as React from "react";
import OgImg from "@/components/og-img";

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
  topic?: string;
};

export function NewsCard({
  item,
  onUse,
}: {
  item: NewsItem;
  onUse?: (n: NewsItem) => void;
}) {
  const d =
    item.published ? new Date(item.published) : null;
  const dateText = d
    ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Score / Hot */}
      <div className="flex items-center gap-2 px-3 pt-3 text-[12px] text-gray-500">
        {typeof item.score === "number" && (
          <div className="rounded-md bg-gray-100 px-2 py-0.5">{item.score}</div>
        )}
        {item.hot && (
          <div className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-600">hot</div>
        )}
      </div>

      {/* Aperçu */}
      <div className="mx-3 my-2 h-[150px] overflow-hidden rounded-md border bg-gray-50">
        <OgImg
          url={item.url}
          title={item.title}
          topic={item.topic || "news"}
          fallback={item.thumbnailUrl || null}
        />
      </div>

      {/* Source / date */}
      <div className="flex items-center justify-between gap-2 px-3 text-[12px] text-gray-500">
        <div className="truncate">{item.source || ""}</div>
        <div>{dateText}</div>
      </div>

      {/* Titre */}
      <div className="line-clamp-3 px-3 pb-2 pt-1 text-[14px] font-medium text-gray-900">
        {item.title}
      </div>

      {/* Tags éducatifs (existant) */}
      <div className="px-3 pb-2 text-[11px]">
        <div className="mb-1 inline-flex rounded-md bg-gray-100 px-2 py-0.5">Educational: 3 key takeaways</div>
        <div className="mb-1 inline-flex rounded-md bg-gray-100 px-2 py-0.5">Consumer benefits: why it matters daily</div>
        <div className="inline-flex rounded-md bg-gray-100 px-2 py-0.5">Product link: concrete use case</div>
      </div>

      {/* CTA */}
      <div className="mt-auto flex items-center gap-2 px-3 pb-3">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Voir la source
          </a>
        ) : (
          <span className="rounded-md border px-3 py-1.5 text-sm text-gray-400">Source indisponible</span>
        )}
        <button
          onClick={() => onUse?.(item)}
          className="ml-auto rounded-md bg-black px-3 py-1.5 text-sm text-white hover:bg-black/90"
        >
          Utiliser cette actu
        </button>
      </div>
    </div>
  );
}
