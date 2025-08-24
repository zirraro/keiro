import type { ReactNode } from "react";
import Sidebar from "@/components/dashboard/sidebar";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-zinc-100 p-8">
        {children}
      </main>
    </div>
  );
}
