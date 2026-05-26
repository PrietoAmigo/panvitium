/**
 * @panvitium/shared — wire-format types, save schema, and migrations.
 * Imported by both apps/web and apps/api so the wire format is checked at compile time on both ends.
 */
export * from './save/state-schema.js';
export * from './save/schema.js';
export * from './save/migrate.js';
export * from './contracts/auth.js';
export * from './contracts/save-sync.js';
export * from './strings.js';
