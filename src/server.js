import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from './config.js';
import store from './store/index.js';
import { documentsRouter } from './routes/documents.js';
import { ragRouter } from './routes/rag.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/documents', documentsRouter);
app.use('/api', ragRouter);

app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      erreur: 'Données invalides',
      details: err.issues.map((i) => ({ champ: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof multer.MulterError) return res.status(400).json({ erreur: err.message });
  const status = err.status ?? 500;
  if (status === 500) console.error(err);
  res.status(status).json({ erreur: err.message });
});

await store.init();
app.listen(config.PORT, () =>
  console.log(`RAG essai sur http://localhost:${config.PORT} (base : ${config.DB_DRIVER})`)
);
