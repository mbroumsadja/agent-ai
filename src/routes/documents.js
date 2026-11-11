import { Router } from 'express';
import multer from 'multer';
import store from '../store/index.js';
import { extraireTexte } from '../extract.js';
import { decouper } from '../chunk.js';
import { embed, estimerEmbeddings } from '../llm.js';
import { config } from '../config.js';
import { DocumentMetaSchema, IdSchema, UploadQuerySchema } from '../schemas.js';

const TYPES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    TYPES.includes(file.mimetype) ? cb(null, true) : cb(new Error('Format accepté : PDF, TXT, PNG, JPEG')),
});

export const documentsRouter = Router();

documentsRouter.post('/', upload.single('fichier'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ erreur: "Champ 'fichier' manquant" });
    const meta = DocumentMetaSchema.parse(req.body);
    const { apercu } = UploadQuerySchema.parse(req.query);
    // multer lit le nom en latin1 : on le remet en UTF-8
    const nom = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const { texte, methode } = await extraireTexte(req.file.buffer, req.file.mimetype);
    const chunks = decouper(texte);
    if (chunks.length === 0) {
      return res.status(422).json({ erreur: 'Aucun texte exploitable dans ce fichier (même après OCR).' });
    }
    if (chunks.length > config.MAX_CHUNKS_PER_DOC) {
      return res.status(413).json({
        erreur: `Document trop volumineux : ${chunks.length} morceaux (max ${config.MAX_CHUNKS_PER_DOC}). Découpe le fichier ou augmente MAX_CHUNKS_PER_DOC.`,
      });
    }

    // Aperçu : coût estimé sans appeler le fournisseur d'embeddings
    if (apercu) {
      return res.json({
        apercu: true,
        extraction: methode,
        caracteres: texte.length,
        ...(await estimerEmbeddings(chunks)),
      });
    }

    const vecteurs = await embed(chunks);

    const doc = await store.insertDocument(
      { ...meta, titre: meta.titre ?? nom, nom_fichier: nom },
      chunks,
      vecteurs
    );
    res.status(201).json({ ...doc, extraction: methode });
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await store.listDocuments());
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = IdSchema.parse(req.params.id);
    if (!(await store.deleteDocument(id))) return res.status(404).json({ erreur: 'Document introuvable' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
