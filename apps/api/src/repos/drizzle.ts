/**
 * Drizzle-backed repositories (ADR-008). Used in production; the in-memory ones back the tests.
 * Save blobs are HMAC-signed on write (ADR-011) and the per-user history is pruned to ten
 * (ADR-010). The opaque blob is stored as JSONB.
 */
import { createHmac } from 'node:crypto';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { type SaveBlob, type User } from '@panvitium/shared';
import { type Config } from '../config.js';
import { type Db } from '../db/client.js';
import { saveHistory, saves, sessions, users } from '../db/schema.js';
import {
  type Repositories,
  type SaveRepository,
  type SessionRecord,
  type SessionRepository,
  type UserRepository,
} from './types.js';

const HISTORY_CAP = 10;

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<User | null> {
    const row = (await this.db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = (await this.db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    return row ? toUser(row) : null;
  }

  async create(input: { email: string | null; displayName: string }): Promise<User> {
    const row = (
      await this.db
        .insert(users)
        .values({ email: input.email, displayName: input.displayName })
        .returning()
    )[0];
    if (!row) throw new Error('user insert returned no row');
    return toUser(row);
  }
}

class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string, expiresAt: number): Promise<string> {
    const row = (
      await this.db.insert(sessions).values({ userId, expiresAt }).returning({ id: sessions.id })
    )[0];
    if (!row) throw new Error('session insert returned no row');
    return row.id;
  }

  async find(id: string): Promise<SessionRecord | null> {
    const row = (await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
    return row ? { id: row.id, userId: row.userId, expiresAt: row.expiresAt } : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }
}

class DrizzleSaveRepository implements SaveRepository {
  constructor(
    private readonly db: Db,
    private readonly signingSecret: string,
  ) {}

  private sign(blob: SaveBlob): string {
    return createHmac('sha256', this.signingSecret).update(JSON.stringify(blob)).digest('hex');
  }

  async getLatest(userId: string): Promise<SaveBlob | null> {
    const row = (await this.db.select().from(saves).where(eq(saves.userId, userId)).limit(1))[0];
    return row ? (row.blob as SaveBlob) : null;
  }

  async put(userId: string, blob: SaveBlob): Promise<void> {
    const signature = this.sign(blob);
    await this.db
      .insert(saves)
      .values({
        userId,
        saveVersion: blob.saveVersion,
        lastTickAt: blob.lastTickAt,
        schemaVersion: blob.schemaVersion,
        blob,
        signature,
      })
      .onConflictDoUpdate({
        target: saves.userId,
        set: {
          saveVersion: blob.saveVersion,
          lastTickAt: blob.lastTickAt,
          schemaVersion: blob.schemaVersion,
          blob,
          signature,
          updatedAt: new Date(),
        },
      });

    await this.db.insert(saveHistory).values({ userId, saveVersion: blob.saveVersion, blob });

    // Prune the user's history to the most recent HISTORY_CAP rows.
    const keep = await this.db
      .select({ id: saveHistory.id })
      .from(saveHistory)
      .where(eq(saveHistory.userId, userId))
      .orderBy(desc(saveHistory.createdAt))
      .limit(HISTORY_CAP);
    const keepIds = keep.map((r) => r.id);
    if (keepIds.length > 0) {
      await this.db
        .delete(saveHistory)
        .where(and(eq(saveHistory.userId, userId), notInArray(saveHistory.id, keepIds)));
    }
  }

  async history(userId: string, limit: number): Promise<SaveBlob[]> {
    const rows = await this.db
      .select({ blob: saveHistory.blob })
      .from(saveHistory)
      .where(eq(saveHistory.userId, userId))
      .orderBy(desc(saveHistory.createdAt))
      .limit(limit);
    return rows.map((r) => r.blob as SaveBlob);
  }
}

export function createDrizzleRepositories(db: Db, config: Config): Repositories {
  return {
    userRepo: new DrizzleUserRepository(db),
    sessionRepo: new DrizzleSessionRepository(db),
    saveRepo: new DrizzleSaveRepository(db, config.SAVE_SIGNING_SECRET),
  };
}
