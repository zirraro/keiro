"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export type PromptValues = {
  audience: string;
  objective: string;
  ton: string;
  brand: string;
  format: string;
  lang: "fr" | "en" | "it";
  safeMode: boolean;
};

export function PromptPanel({ onSubmit }: { onSubmit: (v: PromptValues) => void }) {
  const [audience, setAudience] = useState("Investisseurs institutionnels (BNP Paribas Cardif)");
  const [ton, setTon] = useState("Corporate dynamique");
  const [brand, setBrand] = useState("Mushu (Lion’s Mane en focus)");
  const [objective, setObjective] = useState("Adapter le branding et générer une campagne multi-canal à partir de l’actualité.");
  const [format, setFormat] = useState("Post LinkedIn");
  const [lang, setLang] = useState<"fr" | "en" | "it">("fr");
  const [safeMode, setSafeMode] = useState(true);

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Prompt guidé pour génération</div>

      <div className="grid gap-2">
        <Label>Audience</Label>
        <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label>Objectif</Label>
        <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} />
      </div>

      <div className="grid gap-2">
        <Label>Tonalité</Label>
        <Input value={ton} onChange={(e) => setTon(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label>Marque / Contexte</Label>
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <Label>Format</Label>
        <Select value={format} onValueChange={(v) => setFormat(v as any)}>
          <SelectTrigger><SelectValue placeholder="Choisir un format" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Post LinkedIn">Post LinkedIn</SelectItem>
            <SelectItem value="Thread X">Thread X</SelectItem>
            <SelectItem value="Carousel">Carousel</SelectItem>
            <SelectItem value="Brief Presse">Brief Presse</SelectItem>
            <SelectItem value="Script Vidéo 30s">Script Vidéo 30s</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Langue</Label>
        <Select value={lang} onValueChange={(v) => setLang(v as any)}>
          <SelectTrigger><SelectValue placeholder="Langue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">Safe-prompt</div>
          <div className="text-xs text-muted-foreground">Filtrer jargon / risques réputationnels</div>
        </div>
        <Switch checked={safeMode} onCheckedChange={setSafeMode} />
      </div>

      <Separator />

      <Button className="w-full" onClick={() => onSubmit({ audience, objective, ton, brand, format, lang, safeMode })}>
        Générer
      </Button>
    </div>
  );
}
