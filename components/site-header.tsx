import Link from "next/link";
import Image from "next/image";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4">
        {/* Logo + marque */}
        <div className="flex items-center gap-2">
          <Image src="/keiro-logo.svg" alt="Keiro" width={28} height={28} priority />
          <Link href="/" className="font-semibold tracking-tight">Keiro</Link>
        </div>

        {/* Nav centrale */}
        <nav className="hidden items-center gap-5 text-sm text-gray-600 md:flex">
          <Link href="/" className="hover:text-black">Accueil</Link>
          <Link href="/generate" className="hover:text-black">Générer</Link>
        </nav>

        {/* CTA à droite */}
        <div className="flex items-center gap-2">
          <Link
            href="/generate"
            className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Commencer maintenant
          </Link>
        </div>
      </div>
    </header>
  );
}
