"use client";
export default function GlobalError({ error, reset }: { error: any; reset: () => void }) {
  console.error(error);
  return (
    <html>
      <body style={{padding:20,fontFamily:"system-ui"}}>
        <h2>Une erreur est survenue.</h2>
        <pre style={{whiteSpace:"pre-wrap",opacity:.7}}>{String(error?.message ?? error)}</pre>
        <button onClick={() => reset()} style={{padding:"8px 12px",border:"1px solid #ccc",borderRadius:8}}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
