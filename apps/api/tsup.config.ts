import { defineConfig } from 'tsup';

// Bundle the internal source packages INTO the output (noExternal) so the container ships a
// self-contained JS file; runtime deps (fastify, drizzle, pg) stay external and installed.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  noExternal: [/^@panvitium\//],
  clean: true,
  sourcemap: true,
});
