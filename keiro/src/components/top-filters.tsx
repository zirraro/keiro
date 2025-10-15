"use client";
import { Button } from "@/components/ui/button";

export function TopFilters({
  topic, setTopic,
}: { topic?: string; setTopic: (t?: string) => void }) {
  const topics = ["business","technology","science","world","health","sports"];
  return (
    <div className="flex items-center gap-2">
      {topics.map(t => (
        <Button
          key={t}
          size="sm"
          variant={topic===t ? "default" : "outline"}
          className="h-7 rounded-full px-3 text-[12px]"
          onClick={() => setTopic(topic===t ? undefined : t)}
        >
          {t}
        </Button>
      ))}
    </div>
  );
}
