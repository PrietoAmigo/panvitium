/**
 * In-memory repositories — used by the test suite and as a zero-dependency dev fallback. They
 * implement the same contracts as the Drizzle-backed repositories, so the route logic exercised
 * in tests is exactly the route logic that runs in production.
 */
import { type SaveBlob, type User } from '@panvitium/shared';
import {
  type Repositories,
  type SaveRepository,
  type SessionRecord,
  type SessionRepository,
  type UserRepository,
} from './types.js';

const HISTORY_CAP = 10;

class MemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.byId.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async create(input: { email: string | null; displayName: string }): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      email: input.email,
      displayName: input.displayName,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(user.id, user);
    return user;
  }
}

class MemorySessionRepository implements SessionRepository {
  private readonly byId = new Map<string, SessionRecord>();

  async create(userId: string, expiresAt: number): Promise<string> {
    const id = crypto.randomUUID();
    this.byId.set(id, { id, userId, expiresAt });
    return id;
  }

  async find(id: string): Promise<SessionRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

class MemorySaveRepository implements SaveRepository {
  private readonly latest = new Map<string, SaveBlob>();
  private readonly histories = new Map<string, SaveBlob[]>();

  async getLatest(userId: string): Promise<SaveBlob | null> {
    return this.latest.get(userId) ?? null;
  }

  async put(userId: string, blob: SaveBlob): Promise<void> {
    this.latest.set(userId, blob);
    const history = this.histories.get(userId) ?? [];
    history.unshift(blob);
    this.histories.set(userId, history.slice(0, HISTORY_CAP));
  }

  async history(userId: string, limit: number): Promise<SaveBlob[]> {
    return (this.histories.get(userId) ?? []).slice(0, limit);
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    userRepo: new MemoryUserRepository(),
    sessionRepo: new MemorySessionRepository(),
    saveRepo: new MemorySaveRepository(),
  };
}
