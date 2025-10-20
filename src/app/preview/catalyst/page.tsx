export const dynamic = 'force-static';
export default function Page(){
  return (
    <main style={{padding:'64px 24px',maxWidth:960,margin:'0 auto',fontFamily:'system-ui, -apple-system, Segoe UI, Roboto'}}>
      <h1 style={{fontSize:28,margin:0}}>Aperçu désactivé</h1>
      <p style={{margin:'12px 0 24px',opacity:.8}}>
        Cette page d’aperçu n’est pas incluse dans la version de production actuelle.
      </p>
      <a href="/generate" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#111;color:#fff;text-decoration:none">
        Générer des visuels →
      </a>
    </main>
  );
}
