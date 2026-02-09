"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function cx(...cls: (string|false)[]) { return cls.filter(Boolean).join(" "); }

export default function NavBar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(()=>setMounted(true),[]);

  const links = [
    { href: "/", label: "Accueil" },
    { href: "/generate", label: "Générer" },
    { href: "/mon-compte", label: "Mon Compte" },
    { href: "/library", label: "Galerie" },
  ];

  return (
    <header className="border-b bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold">Keiro</Link>
        <nav className="flex items-center gap-2">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "px-3 py-1.5 rounded text-sm",
                pathname === l.href && mounted ? "bg-black text-white" : "hover:bg-gray-100"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
