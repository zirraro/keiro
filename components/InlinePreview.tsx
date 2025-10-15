"use client";

type NewsLite = { title?: string; summary?: string; topic?: string; url?: string };

/** Affiche un petit message d'aide tant qu'aucun rendu n'est dispo */
export default function InlinePreview({
  selectedNews,
}: {
  selectedNews?: NewsLite | null;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center text-center px-4 text-neutral-500">
      <div>
        <p className="font-medium text-neutral-700">Aperçu du rendu</p>
        <p className="mt-1 text-xs">
          {selectedNews?.title
            ? `Sélection : ${selectedNews.title}`
            : "Sélectionnez une actualité puis cliquez sur “Générer une image/vidéo”. L’aperçu apparaîtra ici."}
        </p>
      </div>
    </div>
  );
}
