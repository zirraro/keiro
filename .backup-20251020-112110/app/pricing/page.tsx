export const revalidate = 60;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-extrabold">Tarifs</h1>
          <a href="/" className="text-sm underline underline-offset-4 hover:opacity-80">Retour à l’accueil</a>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-neutral-200 p-6">
            <h2 className="font-semibold">Starter</h2>
            <p className="text-3xl font-extrabold mt-2">0€</p>
            <ul className="mt-4 text-sm space-y-1 text-neutral-600">
              <li>• Démo images</li>
              <li>• 3 essais / jour</li>
              <li>• Filigrane</li>
            </ul>
            <a href="/generate" className="mt-4 inline-block px-3 py-2 rounded-md bg-neutral-900 text-white text-sm hover:opacity-90">Commencer</a>
          </div>

          <div className="rounded-2xl border border-neutral-900 p-6 bg-neutral-900 text-white">
            <h2 className="font-semibold">Pro</h2>
            <p className="text-3xl font-extrabold mt-2">29€<span className="text-sm font-medium">/mois</span></p>
            <ul className="mt-4 text-sm space-y-1 text-neutral-300">
              <li>• Génération images HD</li>
              <li>• Génération vidéo (crédits)</li>
              <li>• Librairie d’assets</li>
              <li>• Support prioritaire</li>
            </ul>
            <a href="/auth" className="mt-4 inline-block px-3 py-2 rounded-md bg-white text-neutral-900 text-sm hover:opacity-90">S’abonner</a>
          </div>

          <div className="rounded-2xl border border-neutral-200 p-6">
            <h2 className="font-semibold">Business</h2>
            <p className="text-3xl font-extrabold mt-2">Sur devis</p>
            <ul className="mt-4 text-sm space-y-1 text-neutral-600">
              <li>• Accès API & SSO</li>
              <li>• SLA & onboarding</li>
              <li>• Volumes négociés</li>
            </ul>
            <a href="/contact" className="mt-4 inline-block px-3 py-2 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50">Nous contacter</a>
          </div>
        </div>
      </div>
    </main>
  );
}
