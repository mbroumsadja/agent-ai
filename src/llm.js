import { createHash } from 'node:crypto';
import { config } from './config.js';
import store from './store/index.js';

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

// Estimation prudente : ~3 caractères par token pour du français
export const estimerTokens = (texte) => Math.ceil(texte.length / 3);
const empreinte = (texte) => createHash('sha256').update(texte).digest('hex');
const cleCache = () => `${config.EMBED_MODEL}:${config.EMBEDDING_DIM}`;

// Fenêtre glissante : n'envoie jamais plus de EMBED_TPM tokens par minute au fournisseur
const fenetre = [];
async function reserver(tokens) {
  if (!config.EMBED_TPM) return;
  for (;;) {
    const now = Date.now();
    while (fenetre.length && now - fenetre[0].t >= config.EMBED_WINDOW_MS) fenetre.shift();
    const utilises = fenetre.reduce((a, x) => a + x.n, 0);
    if (fenetre.length === 0 || utilises + tokens <= config.EMBED_TPM) {
      fenetre.push({ t: now, n: tokens });
      return;
    }
    await attendre(config.EMBED_WINDOW_MS - (now - fenetre[0].t) + 250);
  }
}

// Lots limités en nombre ET en tokens (un lot ne dépasse jamais la moitié du plafond par minute)
function faireLots(textes) {
  const maxTokens = config.EMBED_TPM ? Math.max(1, Math.floor(config.EMBED_TPM / 2)) : Infinity;
  const lots = [];
  let courant = [], tokens = 0;
  for (const t of textes) {
    const n = estimerTokens(t);
    if (courant.length && (courant.length >= config.EMBED_BATCH_SIZE || tokens + n > maxTokens)) {
      lots.push({ textes: courant, tokens });
      courant = []; tokens = 0;
    }
    courant.push(t); tokens += n;
  }
  if (courant.length) lots.push({ textes: courant, tokens });
  return lots;
}

// Combien coûterait l'indexation de ces morceaux, sans appeler le fournisseur
export async function estimerEmbeddings(textes) {
  const uniques = [...new Set(textes)];
  const cache = await store.getCache(uniques.map(empreinte), cleCache());
  const manquants = uniques.filter((t) => !cache.has(empreinte(t)));
  const tokens = manquants.reduce((a, t) => a + estimerTokens(t), 0);
  const minutes = config.EMBED_TPM ? Math.max(0, Math.ceil(tokens / config.EMBED_TPM) - 1) : 0;
  return {
    morceaux: textes.length,
    deja_en_cache: uniques.length - manquants.length,
    a_vectoriser: manquants.length,
    tokens_estimes: tokens,
    duree_estimee_s: Math.round(minutes * (config.EMBED_WINDOW_MS / 1000)) + Math.ceil(manquants.length / config.EMBED_BATCH_SIZE) * 2,
  };
}

// Vectorise avec cache : un texte déjà vu ne coûte rien, et chaque lot réussi est conservé
// immédiatement, donc un échec au milieu ne fait pas perdre (ni repayer) le travail déjà fait.
export async function embed(textes) {
  const cles = textes.map(empreinte);
  const cache = await store.getCache([...new Set(cles)], cleCache());

  const vus = new Set();
  const manquants = [];
  textes.forEach((t, i) => {
    if (!cache.has(cles[i]) && !vus.has(cles[i])) { vus.add(cles[i]); manquants.push(t); }
  });

  for (const lot of faireLots(manquants)) {
    await reserver(lot.tokens);
    const data = await post(config.EMBED_BASE_URL, config.EMBED_API_KEY, '/embeddings', {
      model: config.EMBED_MODEL,
      input: lot.textes,
      ...(config.EMBED_SEND_DIMENSIONS ? { dimensions: config.EMBEDDING_DIM } : {}),
    });
    const items = data.data.sort((a, b) => a.index - b.index);
    const entrees = [];
    items.forEach((item, i) => {
      if (item.embedding.length !== config.EMBEDDING_DIM) {
        throw new Error(
          `Dimension d'embedding ${item.embedding.length} ≠ EMBEDDING_DIM=${config.EMBEDDING_DIM}. Corrige .env puis relance la migration.`
        );
      }
      const h = empreinte(lot.textes[i]);
      cache.set(h, item.embedding);
      entrees.push([h, item.embedding]);
    });
    await store.putCache(entrees, cleCache());
  }
  return cles.map((h) => cache.get(h));
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
