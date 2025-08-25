export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Librairie d’assets</h1>
      <p className="text-sm text-neutral-600">
        Déposez ici logos, photos, templates, palettes HEX… (Stockage à brancher ensuite : Supabase/Cloud, etc.)
      </p>

      <div className="rounded-2xl border border-neutral-200 p-6 bg-neutral-50">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h2 className="font-semibold mb-2">Logos</h2>
            <div className="text-sm text-neutral-500">Aucun logo importé.</div>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Couleurs</h2>
            <div className="text-sm text-neutral-500">Aucune palette définie.</div>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Templates</h2>
            <div className="text-sm text-neutral-500">Aucun template enregistré.</div>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Médias</h2>
            <div className="text-sm text-neutral-500">Aucune ressource pour le moment.</div>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-neutral-900 text-white text-sm hover:opacity-90"
            onClick={() => alert('TODO: uploader (Supabase Storage)')}
          >
            Importer des assets
          </button>
        </div>
      </div>
    </div>
  );
}
