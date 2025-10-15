import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    categories: [
      { key: "technology",  label: "Technologie" },
      { key: "science",     label: "Science" },
      { key: "world",       label: "Monde" },
      { key: "business",    label: "Économie" },
      { key: "sports",      label: "Sport" },
      { key: "gaming",      label: "Gaming" },
      { key: "restauration",label: "Restauration" },
      { key: "health",      label: "Santé" },
      { key: "environment", label: "Environnement" },
      { key: "architecture",label: "Architecture" },
      { key: "arts",        label: "Arts & Culture" },
      { key: "mobility",    label: "Mobilité" },
      { key: "energy",      label: "Énergie" },
      { key: "fashion",     label: "Mode & Luxe" },
      { key: "startups",    label: "Startups & SaaS" },

      { key: "ecommerce",   label: "E-commerce" },
      { key: "beaute",      label: "Beauté & Bien-être" },
      { key: "education",   label: "Éducation & Formation" },
      { key: "tourisme",    label: "Tourisme & Hôtellerie" },
      { key: "evenements",  label: "Événementiel" },
      { key: "maison",      label: "Maison & Travaux" },
      { key: "immobilier",  label: "Immobilier" },
    ],
  });
}
