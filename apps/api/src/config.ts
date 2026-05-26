/**
 * Typed, validated configuration from the environment. Dev defaults let the server boot locally
 * without a full `.env`; production must supply real secrets (>= 16 chars). See `.env.example`.
 */
import { z } from 'zod';

const configSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://panvitium:panvitium@localhost:5432/panvitium'),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(16).default('dev-insecure-cookie-secret-change-me'),
  MAGIC_LINK_SECRET: z.string().min(16).default('dev-insecure-magic-secret-change-me'),
  SAVE_SIGNING_SECRET: z.string().min(16).default('dev-insecure-save-secret-change-me'),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  MAGIC_LINK_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 15),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
