"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function PromptSidebar() {
  const Field = ({ label, ph }: { label: string; ph: string }) => (
    <div className="grid gap-1.5">
      <Label className="text-[12px]">{label}</Label>
      <Input placeholder={ph} className="h-8 text-[12px]" />
    </div>
  );

  return (
    <div className="space-y-3 text-[12px]">
      <div className="font-semibold">Prompt guidé par questions</div>

      <Field label="Audience(s) ?" ph="Décideurs marketing/PME" />
      <Field label="Domaine marketing/PME" ph="Retail / Food & Beverage" />
      <Field label="Tendance" ph="Produit AI, Lancement, Offre -20%" />
      <Field label="Objectif (conversion réseau)" ph="Générer des leads qualifiés" />
      <Field label="Booster des ventes" ph="Cross-sell / Upsell / Promo" />
      <Field label="Associer thèmes et chaînes" ph="LinkedIn, Instagram, Presse" />
      <Field label="CTA" ph="Demander une démo / S’inscrire" />
      <Field label="Déclencheur note/flash" ph="Breaking news, Award, Rupture" />

      <div className="grid gap-1.5">
        <Label className="text-[12px]">Contrainte(s), la marque + actualité en 1 phrase</Label>
        <Textarea rows={3} placeholder="Mushu — adaptogènes premium, focus Lion’s Mane…" className="text-[12px]" />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-[12px]">Format</Label>
        <Select defaultValue="post">
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue placeholder="Choisir un format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="post">Post LinkedIn</SelectItem>
            <SelectItem value="thread">Thread X</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
            <SelectItem value="press">Brief Presse</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-[12px]">Langages</Label>
        <Select defaultValue="fr">
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue placeholder="Choisir la langue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français (FR)</SelectItem>
            <SelectItem value="en">English (EN)</SelectItem>
            <SelectItem value="it">Italiano (IT)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button className="w-full h-8 text-[12px]">Générer l’image</Button>
      <Button className="w-full h-8 text-[12px]" variant="secondary">Générer</Button>
    </div>
  );
}
