/**
 * Audio facade (ADR-014). Howler.js is the reserved library, but no audio direction is set yet,
 * so this is a no-op stub. Calling `audio.play(event)` at every architecturally significant
 * moment now means populating audio later is a content task, not a refactor.
 */
export type AudioEvent =
  | 'room-change'
  | 'panel-open'
  | 'panel-close'
  | 'katabasis'
  | 'invocation-summon'
  | 'maleficium-acquired'
  | 'outcome-stellar'
  | 'outcome-apocalyptic'
  | 'panvitium-activate'
  // A delivered email worth a cue: the Fausto Cescru #5 door-knock (05, ADR-014).
  | 'email-knock';

export const audio = {
  play(_event: AudioEvent): void {
    // Intentionally silent until audio assets exist; swap this body for Howler later.
  },
};
