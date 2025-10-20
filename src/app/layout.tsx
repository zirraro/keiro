import "./globals.css";

export const metadata = { title: "KeiroAI", description: "Générer & éditer" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="bg-white border-b">
          <nav className="container-app h-14 flex items-center gap-6">
            <a href="/" className="font-semibold">KeiroAI</a>
            <a href="/generate" className="hover:underline">Générer</a>
            <a href="/editor" className="hover:underline">Studio éditeur</a>
          </nav>
        </header>
        <main className="container-app py-6">{children}</main>
      </body>
    </html>
  );
}
