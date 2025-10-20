export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-zinc-900">Support</h1>
      <p className="mt-2 text-zinc-600">
        Une question ? Écrivez-nous et on vous répond rapidement.
      </p>
      <ul className="mt-4 list-disc pl-6 text-sm text-zinc-700">
        <li>Docs & FAQ (bientôt)</li>
        <li>Contact: support@keiro.app</li>
      </ul>
    </div>
  );
}
