import Link from "next/link";
import { Button } from "../../components/ui/button";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-900/60 bg-neutral-950/70 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500" />
          <span className="font-semibold">Keiro</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-4 text-sm">
          <Link href="/" className="text-neutral-300 hover:text-white">Accueil</Link>
          <Link href="/generate" className="text-neutral-300 hover:text-white">Générer</Link>
          <Link href="/pricing" className="text-neutral-300 hover:text-white">Tarifs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/generate"><Button>Commencer</Button></Link>
        </div>
      </div>
    </header>
  );
}
