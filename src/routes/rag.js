import { Router } from 'express';
import { repondre, genererQcm } from '../rag.js';
import { AskSchema, QcmRequestSchema } from '../schemas.js';

export const ragRouter = Router();

ragRouter.post('/ask', async (req, res, next) => {
  try {
    const { question, ...filtres } = AskSchema.parse(req.body);
    res.json(await repondre(question, filtres));
  } catch (err) {
    next(err);
  }
});

ragRouter.post('/qcm', async (req, res, next) => {
  try {
    res.json(await genererQcm(QcmRequestSchema.parse(req.body)));
  } catch (err) {
    next(err);
  }
});
