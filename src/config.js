import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z
  .object({
    PORT: z.coerce.number().default(4000),

    // sqlite = dev local sans serveur (sqlite-vec) ; pg = production (PostgreSQL + pgvector)
    DB_DRIVER: z.enum(['sqlite', 'pg']).default('sqlite'),
    SQLITE_PATH: z.string().default('./data/rag.db'),
    DATABASE_URL: z.string().url().optional(),

    LLM_BASE_URL: z.string().url(),
    LLM_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1),
    EMBED_BASE_URL: z.string().url().optional(),
    EMBED_API_KEY: z.string().optional(),
    EMBED_MODEL: z.string().min(1),
    EMBEDDING_DIM: z.coerce.number().int().positive().max(2000).default(768),
    EMBED_SEND_DIMENSIONS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    OCR_LANGS: z.string().default('fra+eng'),
    OCR_MAX_PAGES: z.coerce.number().int().positive().default(30),
  })
  .superRefine((env, ctx) => {
    if (env.DB_DRIVER === 'pg' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Requis quand DB_DRIVER=pg' });
    }
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variables d'environnement invalides :");
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  EMBED_BASE_URL: parsed.data.EMBED_BASE_URL ?? parsed.data.LLM_BASE_URL,
  EMBED_API_KEY: parsed.data.EMBED_API_KEY ?? parsed.data.LLM_API_KEY,
};
