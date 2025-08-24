import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
      <div className="rounded-full border border-blue-200/60 bg-blue-50 px-3 py-1 text-xs text-blue-700">
        Bienvenue sur Keiro
      </div>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900">
        Your personal video creation assistant, powered by AI.
      </h1>
      <p className="mt-2 max-w-2xl text-zinc-600">
        Créez des visuels et vidéos en quelques clics. Importez vos données, utilisez des templates et partagez vos créations.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/generate"
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Créer une vidéo
        </Link>
        <Link
          href="/templates"
          className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
        >
          Créer un template
        </Link>
      </div>

      <div className="mt-10 w-full">
        {/* Démo : si tu as un /public/demo.mp4, la vidéo s'affiche, sinon un bloc placeholder */}
        <div className="mx-auto max-w-3xl overflow-hidden rounded-xl shadow-xl">
          <video
            className="hidden h-auto w-full md:block"
            src="/demo.mp4"
            autoPlay
            loop
            muted
            playsInline
          />
          {/* Fallback si pas de démo */}
          <div className="block bg-[url('/brand/hero.jpg')] bg-cover bg-center md:hidden">
            <div className="aspect-video w-full bg-gradient-to-br from-zinc-200 to-zinc-300" />
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Trusted by creators & teams — build, iterate, distribute.
        </p>
      </div>
    </div>
  );
}
