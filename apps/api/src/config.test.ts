import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

/** A complete set of strong (non-default) secrets for a production config. */
const STRONG_SECRETS = {
  COOKIE_SECRET: 'prod-cookie-secret-0123456789',
  MAGIC_LINK_SECRET: 'prod-magic-secret-0123456789',
  SAVE_SIGNING_SECRET: 'prod-save-secret-0123456789',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts the committed dev defaults outside production', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('refuses to start in production when a secret is left at its dev default', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        PUBLIC_URL: 'https://panvitium.example',
        // Two strong secrets, but MAGIC_LINK_SECRET is left at its committed default.
        COOKIE_SECRET: STRONG_SECRETS.COOKIE_SECRET,
        SAVE_SIGNING_SECRET: STRONG_SECRETS.SAVE_SIGNING_SECRET,
      } as NodeJS.ProcessEnv),
    ).toThrow(/MAGIC_LINK_SECRET/);
  });

  it('starts in production when every secret is overridden', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        PUBLIC_URL: 'https://panvitium.example',
        ...STRONG_SECRETS,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
