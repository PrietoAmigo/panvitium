/**
 * Database schema (ADR-008): relational tables for users/sessions; the opaque save lives in a
 * JSONB column. `saves` holds the current accepted save per user; `save_history` keeps the
 * rolling recovery history (ADR-010, last ten). `signature` is the server-side HMAC over the
 * blob for tamper detection (ADR-011).
 */
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, integer, jsonb, bigint, uuid, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text('email').unique(), // nullable: Discord-only users may have none (ADR-009)
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saves = pgTable('saves', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  saveVersion: integer('save_version').notNull(),
  lastTickAt: bigint('last_tick_at', { mode: 'number' }).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  blob: jsonb('blob').notNull(),
  signature: text('signature').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saveHistory = pgTable(
  'save_history',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    saveVersion: integer('save_version').notNull(),
    blob: jsonb('blob').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('save_history_user_idx').on(t.userId, t.createdAt)],
);
