import store from './store/index.js';
import { embed, chat } from './llm.js';
import { QcmSchema } from './schemas.js';

export async function rechercher(question, { filiere, niveau, topK }) {
  const [vec] = await embed([question]);
  return store.search(vec, { filiere, niveau, topK });
}

const formatContexte = (rows) =>
  rows.map((r, i) => `[Source ${i + 1} — ${r.titre}]\n${r.contenu}`).join('\n\n---\n\n');

export async function repondre(question, filtres) {
  const sources = await rechercher(question, filtres);
  if (sources.length === 0) {
    return { reponse: "Aucun document indexé ne correspond à ta recherche.", sources: [] };
  }
  const reponse = await chat({
    system:
      "Tu es un assistant pédagogique. Réponds en français, uniquement à partir des sources fournies. " +
      "Cite les sources sous la forme [Source n]. Si l'information n'y figure pas, dis-le clairement.",
    user: `Sources :\n${formatContexte(sources)}\n\nQuestion : ${question}`,
  });
  return {
    reponse,
    sources: sources.map((s, i) => ({
      n: i + 1, document_id: s.document_id, titre: s.titre, score: Number(s.score.toFixed(3)),
      extrait: s.contenu.slice(0, 200),
    })),
  };
}

export async function genererQcm({ sujet, nombre, filiere, niveau }) {
  const sources = await rechercher(sujet, { filiere, niveau, topK: 8 });
  if (sources.length === 0) throw Object.assign(new Error('Aucun document indexé pour ce sujet.'), { status: 404 });

  const system =
    "Tu génères des QCM d'examen en français, strictement fondés sur les sources fournies. " +
    'Réponds UNIQUEMENT avec un JSON de la forme : {"questions":[{"enonce":"...","options":["A","B","C","D"],' +
    '"reponse_correcte":0,"explication":"..."}]}. Chaque question a exactement 4 options ; ' +
    'reponse_correcte est l\'indice (0 à 3) de la bonne option.';
  let user = `Sources :\n${formatContexte(sources)}\n\nGénère ${nombre} questions sur : ${sujet}`;

  // Validation Zod avec une relance en cas de sortie invalide
  let derniereErreur;
  for (let essai = 0; essai < 2; essai++) {
    const brut = await chat({ system, user, json: true, temperature: 0.4 });
    try {
      const qcm = QcmSchema.parse(JSON.parse(brut));
      return { ...qcm, sources: [...new Set(sources.map((s) => s.titre))] };
    } catch (err) {
      derniereErreur = err;
      user += `\n\nTa sortie précédente était invalide (${String(err.message).slice(0, 300)}). Corrige-la et respecte le format.`;
    }
  }
  throw Object.assign(new Error(`Le LLM n'a pas produit un QCM valide : ${derniereErreur.message}`), { status: 502 });
}
