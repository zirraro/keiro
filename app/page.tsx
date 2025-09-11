export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-10 text-center space-y-6">
      <h1 className="text-3xl font-bold">Bienvenue sur Keiro 👋</h1>
      <p className="text-neutral-600">
        Votre studio de génération de contenus IA orientés actu.
      </p>
      <div className="flex justify-center gap-4">
        <a
          href="/studio"
          className="inline-block bg-black text-white px-6 py-3 rounded-lg hover:bg-neutral-800 transition"
        >
          Accéder au Studio
        </a>
        <a
          href="/demo"
          className="inline-block bg-neutral-200 text-black px-6 py-3 rounded-lg hover:bg-neutral-300 transition"
        >
          Voir la Demo
        </a>
      </div>
    </main>
  );
}
