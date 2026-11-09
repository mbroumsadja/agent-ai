// Interface commune aux deux moteurs :
//   init()                                   crée tables/index (idempotent)
//   insertDocument(meta, chunks, vecteurs)   -> { id, titre, filiere, niveau, nb_chunks }
//   listDocuments()
//   deleteDocument(id)                       -> boolean
//   search(vecteur, { filiere, niveau, topK }) -> [{ contenu, position, document_id, titre, score }]
//   close()
import { config } from '../config.js';

const store = await (config.DB_DRIVER === 'pg' ? import('./pg.js') : import('./sqlite.js'));
export default store;
