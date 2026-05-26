/**
 * Production migration runner. Dev applies migrations with drizzle-kit (a devDependency present in
 * the dev image); the pruned production image doesn't ship drizzle-kit, so prod runs this bundled
 * script, which uses drizzle-orm's programmatic migrator against the same `drizzle/` folder. Both
 * share the `__drizzle_migrations` journal, so they're interchangeable.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool);
  // `drizzle/` sits next to the bundle's parent (dist/../drizzle in prod, src/../drizzle in dev).
  const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
  await pool.end();
}

main()
  .then(() => {
    console.log('migrations applied');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
