export const dynamic = 'force-static';
export default function Page(){
  return (
    <main style={{padding:'64px 24px',maxWidth:960,margin:'0 auto',fontFamily:'system-ui'}}>
      <h1 style={{fontSize:28,margin:0}}>Connexion désactivée</h1>
      <p style={{margin:'12px 0 24px',opacity:.8}}>
        Pour tester Keiro, utilisez la génération à partir d’actualités sur la page d’accueil.
      </p>
      <a href="/" style={{display:'inline-block',padding:'10px 16px',borderRadius:10,background:'#111',color:'#fff',textDecoration:'none'}}>Retour à l’accueil</a>
    </main>
  );
}
