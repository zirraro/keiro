export async function generateImageDataUrlFromNews(news: {
  title: string;
  summary?: string;
  topic?: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

  // Prompt simple et robuste
  const prompt =
    `Illustration éditoriale pour une actualité (${news.topic || "news"}): ` +
    `${news.title}. ` +
    (news.summary ? `Détails: ${news.summary}. ` : "") +
    `Style: photo éditoriale réaliste, contrastée, nette, sans texte, adaptée aux réseaux sociaux.`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`OpenAI images error ${res.status}: ${msg}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Réponse OpenAI invalide (pas de b64_json)");

  return `data:image/png;base64,${b64}`;
}
