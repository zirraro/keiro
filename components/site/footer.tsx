export default function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-900/60">
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-neutral-400 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>© {new Date().getFullYear()} Keiro — visuels IA orientés tendances</div>
        <div className="flex items-center gap-4">
          <a href="/pricing" className="hover:text-white">Tarifs</a>
          <a href="/generate" className="hover:text-white">Générer</a>
        </div>
      </div>
    </footer>
  );
}
