"use client";
import { useState, useEffect } from "react";

export type Refinement = {
  audience: string;
  tone: string;
  goal: string;
  hook: string;
  cta: string;
  brandKeywords: string;
  platform: "instagram"|"tiktok"|"linkedin";
  format: "square"|"portrait"|"landscape";
  durationSec?: number; // pour vidéo
};

type Props = {
  mode: "image" | "video";
  value: Refinement;
  onChange: (v: Refinement) => void;
};

const baseStyle: React.CSSProperties = { display: "grid", gap: 10 };

export default function PromptRefiner({ mode, value, onChange }: Props) {
  const [local, setLocal] = useState<Refinement>(value);

  useEffect(() => setLocal(value), [value]);

  const upd = (patch: Partial<Refinement>) => {
    const v = { ...local, ...patch };
    setLocal(v);
    onChange(v);
  };

  return (
    <div style={{ ...baseStyle }}>
      <label>
        <div>Audience (qui ?)</div>
        <input value={local.audience} onChange={e=>upd({ audience: e.target.value })} style={{ width:"100%", padding:"8px" }} />
      </label>
      <label>
        <div>Tonalité</div>
        <select value={local.tone} onChange={e=>upd({ tone: e.target.value })} style={{ width:"100%", padding:"8px" }}>
          <option value="pédagogique">Pédagogique</option>
          <option value="percutant">Percutant</option>
          <option value="inspirant">Inspirant</option>
          <option value="humour">Humour</option>
        </select>
      </label>
      <label>
        <div>Objectif (conversion attendue)</div>
        <input value={local.goal} onChange={e=>upd({ goal: e.target.value })} style={{ width:"100%", padding:"8px" }} />
      </label>
      <label>
        <div>Accroche (hook en 1 phrase)</div>
        <input value={local.hook} onChange={e=>upd({ hook: e.target.value })} style={{ width:"100%", padding:"8px" }} />
      </label>
      <label>
        <div>CTA</div>
        <input value={local.cta} onChange={e=>upd({ cta: e.target.value })} style={{ width:"100%", padding:"8px" }} />
      </label>
      <label>
        <div>Mots-clés marque / USP</div>
        <input value={local.brandKeywords} onChange={e=>upd({ brandKeywords: e.target.value })} style={{ width:"100%", padding:"8px" }} />
      </label>
      <label>
        <div>Plateforme</div>
        <select value={local.platform} onChange={e=>upd({ platform: e.target.value as any })} style={{ width:"100%", padding:"8px" }}>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </label>
      <label>
        <div>Format</div>
        <select value={local.format} onChange={e=>upd({ format: e.target.value as any })} style={{ width:"100%", padding:"8px" }}>
          <option value="portrait">Portrait (1080×1350)</option>
          <option value="square">Carré (1080×1080)</option>
          <option value="landscape">Paysage (1920×1080)</option>
        </select>
      </label>

      {mode === "video" && (
        <label>
          <div>Durée vidéo (sec)</div>
          <input type="number" min={3} max={60} value={local.durationSec ?? 8}
                 onChange={e=>upd({ durationSec: Number(e.target.value) })}
                 style={{ width:"100%", padding:"8px" }} />
        </label>
      )}
    </div>
  );
}
