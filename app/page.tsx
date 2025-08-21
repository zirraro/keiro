export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <h1 className="text-4xl sm:text-6xl font-bold mb-6 text-center">
        Bienvenue sur <span className="text-blue-400">Keiro</span> 🚀
      </h1>
      <p className="text-lg sm:text-xl text-gray-300 mb-8 text-center max-w-2xl">
        La plateforme qui génère automatiquement vos <strong>images</strong> et
        <strong> vidéos</strong> à partir des tendances et de l’actualité.  
        Simple, rapide, efficace.
      </p>
      <a
        href="/generate"
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition"
      >
        Créer ma première image
      </a>
    </main>
  );
}
