"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Video,
  Image as ImageIcon,
  HelpCircle,
  Crown,
  LayoutTemplate,
} from "lucide-react";

const NavItem = ({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: any;
  label: string;
}) => {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition
        ${active ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}
      `}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
};

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col bg-zinc-900 p-4">
      <div className="mb-6 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400" />
        <div className="text-lg font-bold text-white">Keiro</div>
      </div>

      <nav className="flex-1 space-y-1">
        <NavItem href="/mon-compte" icon={Home} label="Mon Compte" />
        <NavItem href="/generate" icon={Video} label="Générer (image/vidéo)" />
        <NavItem href="/templates" icon={LayoutTemplate} label="Templates" />
        <NavItem href="/support" icon={HelpCircle} label="Support" />
      </nav>

      <div className="mt-6">
        <Link
          href="/pricing"
          className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
        >
          <Crown size={16} />
          Upgrade plan
        </Link>
      </div>

      <div className="mt-3 text-xs text-zinc-500">
        <div>Anonymous workspace</div>
        <div className="text-[11px]">Free</div>
      </div>
    </aside>
  );
}
