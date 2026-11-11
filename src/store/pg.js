import pg from 'pg';
import { config } from '../config.js';

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(config.DATABASE_URL) ? false : { rejectUnauthorized: false },
  max: 10,
});

// pgvector attend un littéral texte : '[0.1,0.2,...]'
const toVector = (arr) => `[${arr.join(',')}]`;

export async function init() {
  const dim = config.EMBEDDING_DIM;
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      titre       text NOT NULL,
      filiere     text,
      niveau      text,
      nom_fichier text NOT NULL,
      nb_chunks   int  NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id          bigserial PRIMARY KEY,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      position    int  NOT NULL,
      contenu     text NOT NULL,
      embedding   vector(${dim}) NOT NULL
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks(document_id)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS embed_cache (
      hash      text NOT NULL,
      model     text NOT NULL,
      embedding vector(${dim}) NOT NULL,
      PRIMARY KEY (hash, model)
    )`);
  // HNSW : bon rappel sans entraînement préalable (limite pgvector : 2000 dimensions)
  await pool.query(
    'CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)'
  );
}

export async function insertDocument(meta, chunks, vecteurs) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO documents (titre, filiere, niveau, nom_fichier, nb_chunks)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, titre, filiere, niveau, nb_chunks`,
      [meta.titre, meta.filiere ?? null, meta.niveau ?? null, meta.nom_fichier, chunks.length]
    );
    const doc = rows[0];
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        'INSERT INTO chunks (document_id, position, contenu, embedding) VALUES ($1,$2,$3,$4::vector)',
        [doc.id, i, chunks[i], toVector(vecteurs[i])]
      );
    }
    await client.query('COMMIT');
    return doc;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listDocuments() {
  const { rows } = await pool.query(
    'SELECT id, titre, filiere, niveau, nom_fichier, nb_chunks, created_at FROM documents ORDER BY created_at DESC'
  );
  return rows;
}

export async function deleteDocument(id) {
  const { rowCount } = await pool.query('DELETE FROM documents WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function search(vecteur, { filiere, niveau, topK }) {
  const { rows } = await pool.query(
    `SELECT c.contenu, c.position, d.id AS document_id, d.titre,
            1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
      WHERE ($2::text IS NULL OR d.filiere = $2)
        AND ($3::text IS NULL OR d.niveau  = $3)
      ORDER BY c.embedding <=> $1::vector
      LIMIT $4`,
    [toVector(vecteur), filiere ?? null, niveau ?? null, topK]
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

// Cache des embeddings : un texte déjà vectorisé n'est jamais renvoyé au fournisseur
export async function getCache(hashes, model) {
  const out = new Map();
  if (hashes.length === 0) return out;
  const { rows } = await pool.query(
    'SELECT hash, embedding::text AS emb FROM embed_cache WHERE model = $1 AND hash = ANY($2)',
    [model, hashes]
  );
  for (const r of rows) out.set(r.hash, JSON.parse(r.emb));
  return out;
}

export async function putCache(entries, model) {
  for (const [hash, vec] of entries) {
    await pool.query(
      'INSERT INTO embed_cache (hash, model, embedding) VALUES ($1,$2,$3::vector) ON CONFLICT DO NOTHING',
      [hash, model, toVector(vec)]
    );
  }
}

export async function close() {
  await pool.end();
}
