/**
 * Typed, validated configuration from the environment. Dev defaults let the server boot locally
 * without a full `.env`; production must supply real secrets (>= 16 chars). See `.env.example`.
 */
import { z } from 'zod';

/**
 * The committed dev-default secrets, by config key. They let the server boot locally without a
 * full `.env`, but they are public (checked into the repo), so a production deploy that forgets to
 * override them would be trivially forgeable — `loadConfig` refuses to start in that case.
 */
const DEV_DEFAULT_SECRETS = {
  COOKIE_SECRET: 'dev-insecure-cookie-secret-change-me',
  MAGIC_LINK_SECRET: 'dev-insecure-magic-secret-change-me',
  SAVE_SIGNING_SECRET: 'dev-insecure-save-secret-change-me',
} as const;

const configSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://panvitium:panvitium@localhost:5432/panvitium'),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(16).default(DEV_DEFAULT_SECRETS.COOKIE_SECRET),
  MAGIC_LINK_SECRET: z.string().min(16).default(DEV_DEFAULT_SECRETS.MAGIC_LINK_SECRET),
  SAVE_SIGNING_SECRET: z.string().min(16).default(DEV_DEFAULT_SECRETS.SAVE_SIGNING_SECRET),
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
  const config = configSchema.parse(env);
  // In production every secret must be overridden — the committed defaults are public and would
  // let anyone forge magic-link tokens, session cookies, and save signatures.
  if (config.NODE_ENV === 'production') {
    const keys = Object.keys(DEV_DEFAULT_SECRETS) as (keyof typeof DEV_DEFAULT_SECRETS)[];
    const offenders = keys.filter((key) => config[key] === DEV_DEFAULT_SECRETS[key]);
    if (offenders.length > 0) {
      throw new Error(
        `Refusing to start in production with insecure default secret(s): ${offenders.join(', ')}. ` +
          'Set strong, unique values for these environment variables.',
      );
    }
  }
  return config;
}
