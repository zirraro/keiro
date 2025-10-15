"use client";
type Props = {
  activeTopic: string;
  timeframe: string;
  q: string;
  onTopic: (v: string)=>void;
  onTime: (v: string)=>void;
  onSearch: (v: string)=>void;
  onFilter: ()=>void;
};
export default function ToolbarControls({
  activeTopic,timeframe,q,onTopic,onTime,onSearch,onFilter
}: Props){
  const TOPICS = [
    { key: "business", label: "business" },
    { key: "technology", label: "technology" },
    { key: "science", label: "science" },
    { key: "world", label: "world" },
    { key: "health", label: "health" },
    { key: "sports", label: "sports" },
  ];
  const TF_OPTS = [
    { key: "24h", label: "24H" },
    { key: "48h", label: "48H" },
    { key: "72h", label: "72H" },
    { key: "7d",  label: "7J"  },
  ];
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600">Catégorie</span>
        <select
          value={activeTopic}
          onChange={(e)=>onTopic(e.target.value)}
          className="h-9 rounded-md border bg-white px-2 text-sm"
        >
          {TOPICS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600">Période</span>
        <select
          value={timeframe}
          onChange={(e)=>onTime(e.target.value)}
          className="h-9 rounded-md border bg-white px-2 text-sm"
        >
          {TF_OPTS.map(tf => <option key={tf.key} value={tf.key}>{tf.label}</option>)}
        </select>
      </div>

      <div className="ml-2 flex items-center gap-2">
        <input
          value={q}
          onChange={(e)=>onSearch(e.target.value)}
          placeholder="Rechercher une actu…"
          className="h-9 w-64 rounded-md border px-3 text-sm"
        />
        <button
          onClick={onFilter}
          className="h-9 rounded-md border bg-white px-3 text-sm hover:bg-neutral-100"
        >
          Filtrer
        </button>
      </div>
    </div>
  );
}
