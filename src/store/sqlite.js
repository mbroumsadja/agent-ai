import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';

let db;

// sqlite-vec attend les vecteurs en BLOB float32
const toBlob = (arr) => Buffer.from(new Float32Array(arr).buffer);

export async function init() {
  mkdirSync(path.dirname(path.resolve(config.SQLITE_PATH)), { recursive: true });
  db = new Database(config.SQLITE_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      titre       TEXT NOT NULL,
      filiere     TEXT,
      niveau      TEXT,
      nom_fichier TEXT NOT NULL,
      nb_chunks   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      position    INTEGER NOT NULL,
      contenu     TEXT NOT NULL,
      embedding   BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks(document_id);
  `);

  // Garde-fou : on ne mélange pas deux dimensions d'embedding dans la même base
  const row = db.prepare("SELECT value FROM meta WHERE key = 'embedding_dim'").get();
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('embedding_dim', ?)").run(String(config.EMBEDDING_DIM));
  } else if (Number(row.value) !== config.EMBEDDING_DIM) {
    throw new Error(
      `Cette base SQLite contient des embeddings de dimension ${row.value} mais EMBEDDING_DIM=${config.EMBEDDING_DIM}. ` +
        `Supprime ${config.SQLITE_PATH} pour réindexer avec le nouveau modèle.`
    );
  }
}

export async function insertDocument(meta, chunks, vecteurs) {
  const id = randomUUID();
  const insDoc = db.prepare(
    'INSERT INTO documents (id, titre, filiere, niveau, nom_fichier, nb_chunks) VALUES (?,?,?,?,?,?)'
  );
  const insChunk = db.prepare(
    'INSERT INTO chunks (document_id, position, contenu, embedding) VALUES (?,?,?,?)'
  );
  db.transaction(() => {
    insDoc.run(id, meta.titre, meta.filiere ?? null, meta.niveau ?? null, meta.nom_fichier, chunks.length);
    chunks.forEach((c, i) => insChunk.run(id, i, c, toBlob(vecteurs[i])));
  })();
  return { id, titre: meta.titre, filiere: meta.filiere ?? null, niveau: meta.niveau ?? null, nb_chunks: chunks.length };
}

export async function listDocuments() {
  return db
    .prepare('SELECT id, titre, filiere, niveau, nom_fichier, nb_chunks, created_at FROM documents ORDER BY created_at DESC')
    .all();
}

export async function deleteDocument(id) {
  return db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0;
}

// Recherche exacte (balayage) avec la distance cosinus de sqlite-vec :
// largement suffisant pour quelques dizaines de milliers de chunks, et les filtres restent exacts.
export async function search(vecteur, { filiere, niveau, topK }) {
  return db
    .prepare(
      `SELECT c.contenu, c.position, d.id AS document_id, d.titre,
              1 - vec_distance_cosine(c.embedding, ?) AS score
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE (? IS NULL OR d.filiere = ?)
          AND (? IS NULL OR d.niveau  = ?)
        ORDER BY score DESC
        LIMIT ?`
    )
    .all(toBlob(vecteur), filiere ?? null, filiere ?? null, niveau ?? null, niveau ?? null, topK);
}

export async function close() {
  db?.close();
}
