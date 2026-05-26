/**
 * Save-sync wire contracts (ADR-010): client-authoritative sync with monotonic-version conflict
 * resolution. The client pushes its save; the server accepts only if its stored saveVersion is
 * <= the submitted one, otherwise it returns its own save so the client can show a chooser.
 */
import { z } from 'zod';
import { saveBlobSchema } from '../save/schema.js';

export const SAVE_SYNC_PATHS = {
  /** GET — the latest accepted save for the session's user, or null. */
  get: '/save',
  /** PUT { save } — submit a save; returns accepted or conflict. */
  put: '/save',
  /** GET — the last ten accepted saves, newest first (ADR-010 recovery history). */
  history: '/save/history',
} as const;

export const getSaveResponseSchema = z.object({
  save: saveBlobSchema.nullable(),
});
export type GetSaveResponse = z.infer<typeof getSaveResponseSchema>;

export const putSaveRequestSchema = z.object({
  save: saveBlobSchema,
});
export type PutSaveRequest = z.infer<typeof putSaveRequestSchema>;

/**
 * The result of a save submission. On `conflict` the server's save is returned so the client can
 * present both summaries and let the player choose (no silent overwrite).
 */
export const saveSyncResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('accepted'),
    saveVersion: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal('conflict'),
    serverSave: saveBlobSchema,
  }),
]);
export type SaveSyncResult = z.infer<typeof saveSyncResultSchema>;

export const saveHistoryResponseSchema = z.object({
  saves: z.array(saveBlobSchema),
});
export type SaveHistoryResponse = z.infer<typeof saveHistoryResponseSchema>;
