import Link from "next/link";

export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-neutral-200 p-4">
          <h2 className="font-semibold">Dernières générations</h2>
          <p className="text-sm text-neutral-500">Aucune génération récente.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/generate" className="px-3 py-2 rounded-md bg-neutral-900 text-white text-sm hover:opacity-90">
              Nouvelle image
            </Link>
            <Link href="/generate?mode=video" className="px-3 py-2 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50">
              Nouvelle vidéo
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-4">
          <h2 className="font-semibold">Marque</h2>
          <p className="text-sm text-neutral-500">Définissez vos couleurs, logos et typographies.</p>
          <div className="mt-3">
            <Link href="/dashboard/library" className="px-3 py-2 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50">
              Gérer la librairie
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
