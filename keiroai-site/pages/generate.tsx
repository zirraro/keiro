import { useState } from "react";

export default function GeneratePage() {
  const [loadingGen, setLoadingGen] = useState(false);
  const [loadingPub, setLoadingPub] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [caption, setCaption] = useState<string>("");

  const onGenerate = async () => {
    setLoadingGen(true);
    try {
      const r = await fetch("/api/generate", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setImageUrl(j.imageUrl);
        setCaption(j.caption);
      } else {
        alert("Erreur génération: " + j.error);
      }
    } finally {
      setLoadingGen(false);
    }
  };

  const onPublish = async () => {
    if (!imageUrl) return alert("Rien à publier");
    setLoadingPub(true);
    try {
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, caption }),
      });
      const j = await r.json();
      if (j.ok) alert("Envoyé à Make ✅");
      else alert("Erreur publish: " + j.error);
    } finally {
      setLoadingPub(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1>Générer & Publier sur Instagram</h1>

      <button onClick={onGenerate} disabled={loadingGen} style={{ padding: 12 }}>
        {loadingGen ? "Génération..." : "Générer un visuel d’essai"}
      </button>

      {imageUrl && (
        <section style={{ marginTop: 24 }}>
          <img src={imageUrl} alt="preview" style={{ width: 360, borderRadius: 12 }} />
          <div style={{ marginTop: 12 }}>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              style={{ width: "100%" }}
            />
          </div>
          <button onClick={onPublish} disabled={loadingPub} style={{ padding: 12, marginTop: 12 }}>
            {loadingPub ? "Publication..." : "Publier (Make → Instagram)"}
          </button>
        </section>
      )}
    </main>
  );
}
