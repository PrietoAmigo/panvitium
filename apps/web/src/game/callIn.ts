// View-model + selection for the incoming-call ("calls-in") system. Pure functions only — no React,
// no DOM, no timers — so the catalogue join and the weighted draw are unit-testable on their own
// (callIn.test.ts). The component (`SmartphoneCallIn`) consumes a `CallInView`; the scheduler hook
// (`useIncomingCall`) consumes `pickIncomingCall`.

import { strings } from '@panvitium/shared';
import {
  CALLS_IN,
  CALL_IN_BY_ID,
  isOnceOnly,
  type CallInClass,
  type CallInData,
} from '../menus/calls-in.data.js';

/** One presented choice: the joined label/sub plus the structural decline marker. */
export interface CallInChoiceView {
  label: string;
  /** Optional Fragment-Mono sub-label under the option. */
  sub?: string;
  /** The decline / hang-up option (readable warm gold, never a faded grey). */
  dim: boolean;
}

/** Everything the call stage needs for one call, with text joined from `strings`. */
export interface CallInView {
  id: string;
  /** A recording plays vs. a typed line is written out. */
  audio: boolean;
  class: CallInClass;
  /** Raw caller line (e.g. "the line · Gideon Reyes"), with the channel prefix stripped for display. */
  tag: string;
  /** The big caller name shown for a recording (the last `·` segment of the display tag). */
  caller: string;
  /** Spoken text, only non-empty for a typed (fileless) call; recordings render no line. */
  line: string;
  choices: CallInChoiceView[];
}

const CATALOG = strings.phone.callIn.calls;

/** Strip the diegetic channel prefix ("the line · ") the same way the design prototype does. */
function displayTag(tag: string): string {
  return tag.replace(/^the line · /, '');
}

/** The big caller name = the last `·`-separated segment of the display tag. */
function callerName(tag: string): string {
  const shown = displayTag(tag);
  const parts = shown.split(' · ');
  return parts[parts.length - 1] ?? shown;
}

/**
 * Join one catalogue row with its strings into a render-ready `CallInView`. Returns `null` for an
 * unknown id or one missing its strings entry (keeps a typo from throwing at render time).
 */
export function buildCallInView(id: string): CallInView | null {
  const data: CallInData | undefined = CALL_IN_BY_ID[id];
  const copy = CATALOG[id];
  if (!data || !copy) return null;
  const choices: CallInChoiceView[] = data.choices.map((c, i) => {
    const text = copy.choices[i];
    return {
      label: text?.label ?? '',
      ...(text?.sub ? { sub: text.sub } : {}),
      dim: c.dim === true,
    };
  });
  return {
    id,
    audio: data.audio,
    class: data.class,
    tag: displayTag(copy.tag),
    caller: callerName(copy.tag),
    line: copy.line ?? '',
    choices,
  };
}

/**
 * The slice of game state a call's requirements read (docs "Requirements"). Kept as a small plain
 * object — not the full `GameState` — so App can derive it from a few stable primitive selectors
 * (without re-rendering every tick) and so the predicate stays trivially testable.
 */
export interface CallEligibilityContext {
  /** Lifetime descents (`state.katabasisCount`). */
  katabasisCount: number;
  /** The Fausto "friendly" branch is open (≡ the threat reply was never sent, `!flagFCThreatSent`). */
  fcFriendly: boolean;
  /** Ids of the emails currently in the inbox. */
  receivedEmailIds: ReadonlySet<string>;
}

/** Whether a call's requirements are met right now. A call with no `requires` is always eligible. */
export function isCallEligible(ctx: CallEligibilityContext, data: CallInData): boolean {
  const req = data.requires;
  if (!req) return true;
  if (req.katabasisCountMin !== undefined && ctx.katabasisCount < req.katabasisCountMin)
    return false;
  if (req.fcFriendly !== undefined && ctx.fcFriendly !== req.fcFriendly) return false;
  if (req.emails && !req.emails.every((id) => ctx.receivedEmailIds.has(id))) return false;
  return true;
}

/** The set of call ids whose requirements are met in the given context. */
export function eligibleCallIds(ctx: CallEligibilityContext): Set<string> {
  return new Set(CALLS_IN.filter((c) => isCallEligible(ctx, c)).map((c) => c.id));
}

/**
 * Per-class draw weight (docs/PANVITIUM-CALLS-IN.md "Selection model"): 49% buff (25 clean upside /
 * 24 tradeoff), 50% lore, 1% easter egg. Within a class every eligible call is equally likely. These
 * are placeholders pending the economy spreadsheet; the buckets and the renormalisation are the
 * load-bearing part, the exact split is tunable here in one place.
 */
export const CLASS_WEIGHT: Record<CallInClass, number> = {
  'buff-positive': 25,
  'buff-tradeoff': 24,
  lore: 50,
  'easter-egg': 1,
};

/**
 * Draw the next incoming call from the weighted bag, honouring once-only eligibility (lore + easter
 * eggs can only ever be received once; `seen` carries the ids already received) and the requirement
 * gate (`eligible`, the ids whose `requires` are currently met — pass `null`/omit for no gate). Pure:
 * all entropy comes from `random` (a `() => number` in [0, 1)), so a test can pin the outcome. Picks
 * a class bucket by its renormalised weight (empty buckets drop out), then a uniform call within it.
 * Returns `null` when nothing is eligible.
 */
export function pickIncomingCall(
  random: () => number,
  seen: ReadonlySet<string> = new Set(),
  eligible: ReadonlySet<string> | null = null,
): string | null {
  const pool = CALLS_IN.filter(
    (c) => !(isOnceOnly(c.class) && seen.has(c.id)) && (eligible === null || eligible.has(c.id)),
  );
  if (pool.length === 0) return null;

  // Bucket the eligible calls by class, keeping only non-empty buckets and their summed weight.
  const buckets = new Map<CallInClass, CallInData[]>();
  for (const c of pool) {
    const list = buckets.get(c.class) ?? [];
    list.push(c);
    buckets.set(c.class, list);
  }
  const weighted = [...buckets.entries()].map(([cls, list]) => ({
    cls,
    list,
    w: CLASS_WEIGHT[cls],
  }));
  const total = weighted.reduce((sum, b) => sum + b.w, 0);
  if (total <= 0) return null;

  // Roll for the class bucket, then a uniform call inside it.
  let roll = random() * total;
  for (const b of weighted) {
    roll -= b.w;
    if (roll < 0) {
      const idx = Math.min(b.list.length - 1, Math.floor(random() * b.list.length));
      return b.list[idx]?.id ?? null;
    }
  }
  // Floating-point guard: fall through to the last bucket's first call.
  const last = weighted[weighted.length - 1];
  return last?.list[0]?.id ?? null;
}
