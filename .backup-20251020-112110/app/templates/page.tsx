export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-zinc-900">Templates</h1>
      <p className="mt-2 text-zinc-600">
        Bientôt : gérez vos templates (Pro). En attendant, utilisez la page Générer pour créer vos contenus.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-lg border border-zinc-200 bg-white"
          />
        ))}
      </div>
    </div>
  );
}
