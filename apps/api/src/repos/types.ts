/**
 * Repository interfaces — the seam between route logic and storage. The server depends on these,
 * not on Drizzle, so handlers are testable against in-memory implementations and swapped for the
 * Drizzle-backed ones in production.
 */
import { type SaveBlob, type User } from '@panvitium/shared';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: { email: string | null; displayName: string }): Promise<User>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: number; // epoch ms
}

export interface SessionRepository {
  create(userId: string, expiresAt: number): Promise<string>; // returns session id
  find(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
}

export interface SaveRepository {
  getLatest(userId: string): Promise<SaveBlob | null>;
  put(userId: string, blob: SaveBlob): Promise<void>;
  history(userId: string, limit: number): Promise<SaveBlob[]>;
}

export interface Repositories {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  saveRepo: SaveRepository;
}
