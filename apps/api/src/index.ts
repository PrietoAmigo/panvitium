/**
 * Production entry point: load config, wire the Drizzle-backed repositories, build the server,
 * and listen. Dev runs this through `tsx watch`; production runs the bundled `dist/index.js`.
 */
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createDrizzleRepositories } from './repos/drizzle.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);
  const repos = createDrizzleRepositories(db, config);
  const app = await buildServer({ config, repos });
  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
