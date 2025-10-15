"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Définition des catégories groupées
const CATEGORY_GROUPS = [
  {
    name: "Général",
    categories: [
      { id: "technology", label: "Tech" },
      { id: "business", label: "Business" },
      { id: "science", label: "Science" },
      { id: "health", label: "Santé" },
      { id: "sports", label: "Sports" },
      { id: "world", label: "Monde" },
    ]
  },
  {
    name: "Tech & Innovation",
    categories: [
      { id: "ai", label: "IA" },
      { id: "startups", label: "Startups" },
    ]
  },
  {
    name: "Finance",
    categories: [
      { id: "crypto", label: "Crypto" },
      { id: "blockchain", label: "Blockchain" },
      { id: "economie", label: "Économie" },
      { id: "bourse", label: "Bourse" },
    ]
  },
  {
    name: "Sport",
    categories: [
      { id: "football", label: "Football" },
      { id: "tennis", label: "Tennis" },
      { id: "jo", label: "JO" },
    ]
  },
  {
    name: "Divertissement",
    categories: [
      { id: "gaming", label: "Gaming" },
      { id: "esports", label: "Esports" },
      { id: "art", label: "Art" },
      { id: "culture", label: "Culture" },
    ]
  },
  {
    name: "Lifestyle",
    categories: [
      { id: "mode", label: "Mode" },
      { id: "beaute", label: "Beauté" },
      { id: "food", label: "Food" },
      { id: "restauration", label: "Restauration" },
    ]
  },
  {
    name: "Habitat & Mobilité",
    categories: [
      { id: "immobilier", label: "Immobilier" },
      { id: "architecture", label: "Architecture" },
      { id: "mobilite", label: "Mobilité" },
      { id: "auto", label: "Auto" },
    ]
  },
  {
    name: "Environnement",
    categories: [
      { id: "environnement", label: "Environnement" },
      { id: "climat", label: "Climat" },
    ]
  }
];

// Fonction pour trouver le label d'une catégorie à partir de son ID
function getCategoryLabel(categoryId: string): string {
  for (const group of CATEGORY_GROUPS) {
    const category = group.categories.find(cat => cat.id === categoryId);
    if (category) return category.label;
  }
  return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
}

export function CategoryDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState("business");
  
  // Mettre à jour la catégorie sélectionnée en fonction de l'URL
  useEffect(() => {
    const topic = searchParams.get("topic") || "business";
    setSelectedCategory(topic);
  }, [searchParams]);
  
  // Gérer le changement de catégorie
  const handleCategoryChange = (categoryId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("topic", categoryId);
    
    // Naviguer vers la nouvelle URL
    router.push(`${pathname}?${params.toString()}`);
    setSelectedCategory(categoryId);
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full md:w-auto justify-between">
          <span>{getCategoryLabel(selectedCategory)}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 max-h-[70vh] overflow-y-auto">
        {CATEGORY_GROUPS.map((group, index) => (
          <div key={group.name}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group.name}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {group.categories.map(category => (
                <DropdownMenuItem
                  key={category.id}
                  className={selectedCategory === category.id ? "bg-accent" : ""}
                  onClick={() => handleCategoryChange(category.id)}
                >
                  {category.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
