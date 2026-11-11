import { z } from 'zod';

const optionnel = z.string().trim().min(1).max(100).optional();

export const DocumentMetaSchema = z.object({
  titre: z.string().trim().min(1).max(200).optional(),
  filiere: optionnel,
  niveau: optionnel,
});

export const UploadQuerySchema = z.object({
  apercu: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const AskSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  filiere: optionnel,
  niveau: optionnel,
  topK: z.coerce.number().int().min(1).max(15).default(5),
});

export const QcmRequestSchema = z.object({
  sujet: z.string().trim().min(3).max(300),
  nombre: z.coerce.number().int().min(1).max(20).default(5),
  filiere: optionnel,
  niveau: optionnel,
});

export const IdSchema = z.string().uuid();

// Contrat strict de la sortie du LLM : si le JSON ne le respecte pas, on réessaie.
export const QcmSchema = z.object({
  questions: z
    .array(
      z.object({
        enonce: z.string().min(5),
        options: z.array(z.string().min(1)).length(4),
        reponse_correcte: z.number().int().min(0).max(3),
        explication: z.string().min(1),
      })
    )
    .min(1),
});
