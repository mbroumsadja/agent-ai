import { config } from './config.js';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Relance automatique sur 429 (limite de débit, fréquente sur les paliers gratuits Groq/Gemini)
async function post(baseUrl, apiKey, chemin, corps, tentatives = 4) {
  for (let essai = 1; ; essai++) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(corps),
    });
    if (res.ok) return res.json();

    if ((res.status === 429 || res.status >= 500) && essai < tentatives) {
      const header = Number(res.headers.get('retry-after'));
      const delai = Number.isFinite(header) && header > 0 ? header * 1000 : 1000 * 2 ** essai;
      await attendre(Math.min(delai, 30000));
      continue;
    }
    const detail = (await res.text()).slice(0, 300);
    throw Object.assign(new Error(`Appel ${chemin} échoué (${res.status}) : ${detail}`), {
      status: res.status === 429 ? 429 : 502,
    });
  }
}

// Embeddings par lots pour limiter la taille des requêtes
export async function embed(textes, tailleLot = 32) {
  const vecteurs = [];
  for (let i = 0; i < textes.length; i += tailleLot) {
    const lot = textes.slice(i, i + tailleLot);
    const data = await post(config.EMBED_BASE_URL, config.EMBED_API_KEY, '/embeddings', {
      model: config.EMBED_MODEL,
      input: lot,
            ...(config.EMBED_SEND_DIMENSIONS ? { dimensions: config.EMBEDDING_DIM } : {}),
    });
    for (const item of data.data.sort((a, b) => a.index - b.index)) {
      if (item.embedding.length !== config.EMBEDDING_DIM) {
        throw new Error(
          `Dimension d'embedding ${item.embedding.length} ≠ EMBEDDING_DIM=${config.EMBEDDING_DIM}. Corrige .env puis relance la migration.`
        );
      }
      vecteurs.push(item.embedding);
    }
  }
  return vecteurs;
}

export async function chat({ system, user, json = false, temperature = 0.2 }) {
  const data = await post(config.LLM_BASE_URL, config.LLM_API_KEY, '/chat/completions', {
    model: config.LLM_MODEL,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  return data.choices[0].message.content;
}
