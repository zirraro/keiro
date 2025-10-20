import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <section className="max-w-6xl mx-auto px-4 py-8">{children}</section>
  );
}
