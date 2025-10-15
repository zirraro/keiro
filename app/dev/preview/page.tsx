import ClientPreview from "./ClientPreview";

// Next.js 15: searchParams est ASYNC => il faut l'await
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const jobId =
    typeof sp.jobId === "string"
      ? sp.jobId
      : Array.isArray(sp.jobId)
      ? sp.jobId[0]
      : "";

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
        Preview sandbox
      </h1>

      {jobId ? (
        <ClientPreview jobId={jobId} />
      ) : (
        <p>
          Lance d’abord une génération puis ouvre cette page avec{" "}
          <code>?jobId=…</code>.
        </p>
      )}
    </main>
  );
}
