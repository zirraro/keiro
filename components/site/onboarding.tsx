'use client';

import { useState, useEffect } from "react";
import { Button } from "../ui/button";

const slides = [
  { title: "Bienvenue sur Keiro 🚀", desc: "L’IA qui génère vos visuels en fonction de l’actualité." },
  { title: "Guidage simple ✨", desc: "Choisissez votre secteur, objectif et tendance du moment." },
  { title: "Prêt à poster 📲", desc: "Exportez en 1 clic pour Instagram, TikTok, LinkedIn et plus." },
];

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = typeof window !== "undefined" ? localStorage.getItem("keiro-onboarding") : "1";
    if (!seen) setOpen(true);
  }, []);

  function next() {
    if (step < slides.length - 1) setStep(step + 1);
    else {
      localStorage.setItem("keiro-onboarding", "1");
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center border border-neutral-200">
        <h2 className="text-xl font-bold mb-2">{slides[step].title}</h2>
        <p className="text-neutral-600 mb-6">{slides[step].desc}</p>
        <Button onClick={next} className="w-full">
          {step === slides.length - 1 ? "Commencer" : "Suivant"}
        </Button>
      </div>
    </div>
  );
}
