# CampusEdu — RAG essai

Version d'essai : indexation de documents (PDF, TXT, images) avec OCR, recherche vectorielle (pgvector), réponses et QCM générés par un LLM, validation Zod.

## Démarrage

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL + clés LLM/embeddings
npm run migrate             # crée l'extension vector + tables + index HNSW
npm run dev
```

Prérequis OCR des PDF scannés : `poppler-utils` (`pdftoppm`) sur la machine. Sur Render, utiliser un Dockerfile avec `apt-get install -y poppler-utils`. Les images PNG/JPEG n'en ont pas besoin. Tesseract télécharge les données de langue (fra, eng) au premier lancement.

## Base de données : SQLite ou PostgreSQL

`DB_DRIVER=sqlite` (défaut) : un fichier local (`SQLITE_PATH`), vecteurs gérés par `sqlite-vec`, recherche cosinus exacte. Idéal pour développer sans serveur.
`DB_DRIVER=pg` : PostgreSQL + pgvector (index HNSW), avec `DATABASE_URL`. Même API, même code : seul le dossier `src/store/` change.

SQLite mémorise la dimension des embeddings ; si tu changes de modèle, supprime le fichier `.db` pour réindexer.

## Configuration Groq + Gemini

- Génération : Groq (`LLM_BASE_URL=https://api.groq.com/openai/v1`, modèle `llama-3.3-70b-versatile`).
- Embeddings : Groq n'en fournit pas, donc Gemini (`gemini-embedding-001` avec `EMBED_SEND_DIMENSIONS=true` et `EMBEDDING_DIM=768`).
- Les erreurs 429 (limite de débit) sont relancées automatiquement avec attente.

## Maîtriser la consommation d'embeddings

- `EMBED_TPM` : l'API n'envoie jamais plus de ce nombre de tokens par minute au fournisseur et attend si besoin. Un gros PDF est donc indexé plus lentement mais ne dépasse pas ton quota (le dépôt reste ouvert pendant ce temps).
- Cache : chaque morceau vectorisé est mémorisé (table `embed_cache`). Un nouvel essai après une erreur, ou un fichier redéposé, ne coûte aucun token. Les lots déjà réussis sont conservés même si un lot ultérieur échoue.
- Aperçu : `POST /api/documents?apercu=true` renvoie le nombre de morceaux, les tokens estimés et la durée, sans rien appeler ni enregistrer. À utiliser avant un gros fichier.
- `MAX_CHUNKS_PER_DOC` : refuse (413) un document trop volumineux.
- Si ton quota de 30 000 est un total (journalier) et non par minute, un document de plus de 30 000 tokens ne passera pas : utilise Ollama en local (`EMBED_BASE_URL=http://localhost:11434/v1`, `EMBED_MODEL=nomic-embed-text`, `EMBEDDING_DIM=768`, `EMBED_SEND_DIMENSIONS=false`).

## Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/documents` | multipart : `fichier` + `titre`, `filiere`, `niveau` (optionnels). Extraction (texte natif, sinon OCR) → découpage → embeddings → pgvector |
| GET | `/api/documents` | Liste des documents indexés |
| DELETE | `/api/documents/:id` | Supprime le document et ses chunks |
| POST | `/api/ask` | `{ question, filiere?, niveau?, topK? }` → réponse + sources citées |
| POST | `/api/qcm` | `{ sujet, nombre?, filiere?, niveau? }` → QCM validé par Zod (1 relance si le JSON est invalide) |

## Tests rapides

```bash
curl -F fichier=@cours.pdf -F filiere=Informatique -F niveau=L3 localhost:4000/api/documents
curl -X POST localhost:4000/api/ask -H 'Content-Type: application/json' \
  -d '{"question":"Qu'\''est-ce qu'\''une jointure ?","filiere":"Informatique"}'
curl -X POST localhost:4000/api/qcm -H 'Content-Type: application/json' \
  -d '{"sujet":"Les jointures SQL","nombre":5}'
```

## Notes

- `EMBEDDING_DIM` doit correspondre au modèle d'embedding ; changer de modèle impose de recréer la table `chunks`.
- Cet essai n'a pas d'authentification : à brancher sur le JWT de CampusEdu avant toute exposition (et rate-limiting par IP).
