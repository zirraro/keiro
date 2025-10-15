import Link from "next/link";
export default function Trendy() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10">
      <h1 className="text-[28px] font-semibold mb-3">Tendances</h1>
      <p className="text-[13px] text-gray-600 mb-5">
        Cette page présentera les tendances. En attendant, démarrez une génération :
      </p>
      <Link
        href="/generate"
        className="inline-flex h-9 items-center rounded-md bg-black px-4 text-[13px] font-medium text-white hover:bg-black/85"
      >
        Générer un visuel
      </Link>
    </div>
  );
}
