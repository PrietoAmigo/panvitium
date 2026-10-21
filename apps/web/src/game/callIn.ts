// View-model + selection for the incoming-call ("calls-in") system, plus the view of an outgoing call
// placed from the dialer (the same call stage plays both). Pure functions only — no React, no DOM, no
// timers — so the catalogue join and the weighted draw are unit-testable on their own
// (callIn.test.ts). The component (`SmartphoneCallIn`) consumes a `CallInView`; the scheduler hook
// (`useIncomingCall`) consumes `pickIncomingCall`.

import { strings, type CallChoiceCopy, type CallCopy } from '@panvitium/shared';
import {
  CALLS_IN,
  CALL_IN_BY_ID,
  isOnceOnly,
  type CallInChoiceData,
  type CallInClass,
  type CallInData,
  type CallInEffect,
  type CallRequirements,
} from '../menus/calls-in.data.js';
import { CALL_OUT_BY_ID, type CallOutData } from '../menus/calls-out.data.js';

/** One presented choice: the label, the generated effect sub-label, and the decline marker. */
export interface CallInChoiceView {
  /** The choice's index in the catalogue (and its strings), for the effect lookup on answer. Equal to
   *  its position on screen unless a gated option before it is hidden. */
  index: number;
  label: string;
  /** Natural-language description of the option's effect, generated from its `effects` (absent for a
   *  decline / lore / easter-egg option that does nothing). See `describeCallInEffects`. */
  sub?: string;
  /** The decline / hang-up option (readable warm gold, never a faded grey). */
  dim: boolean;
  /** The beat the pick leads to; absent: the pick ends the call. */
  next?: CallBeatView;
}

/** A beat of the call after a pick: the caller's next recording, or a silence, then its choices. */
export interface CallBeatView {
  /** The recording's file stem (`<recording>.mp3`), or null for a silent beat. */
  recording: string | null;
  /** A silent beat's length in seconds, counted from the pick (0 for a recording). */
  silenceSec: number;
  /** The recording's typed fallback, written out if its mp3 cannot play ('' for none). */
  line: string;
  /** The choices once the beat is over; empty: the call ends with it. */
  choices: CallInChoiceView[];
}

/** Everything the call stage needs for one call, with text joined from `strings`. */
export interface CallInView {
  id: string;
  /** A recording plays vs. a typed line is written out. */
  audio: boolean;
  /** The incoming call's selection class, or `call-out` for a call the player placed. */
  class: CallInClass | 'call-out';
  /** Raw caller line (e.g. "the line · Gideon Reyes"), with the channel prefix stripped for display. */
  tag: string;
  /** The big caller name shown for a recording (the last `·` segment of the display tag). */
  caller: string;
  /** Spoken text: the typed line of a fileless call, or a recording's typed fallback (written out
   *  when its mp3 cannot play). Empty for a recording with no fallback. */
  line: string;
  /** The opening recording's file stem (the call's id unless the catalogue names another). */
  recording: string;
  /** Whether tapping the stage may cut a recording or a silence short (Stahl's call may not). */
  skippable: boolean;
  choices: CallInChoiceView[];
}

const CATALOG = strings.phone.callIn.calls;
const FIELDS = strings.phone.callIn.fields;

// ── Natural-language effect descriptions (the generated option sub-labels) ───────────────────────
// The line under an option reads out its real effect, e.g. buff(reprobateGenMul, ×1.33, 1 hour) →
// "Reprobate generation increases for 1 hour". A big multiplier reads as how much (doubles / triples)
// rather than a flat "increases"; a cost is appended as a "…, but …" clause. The field nouns come
// from `strings.phone.callIn.fields`; the verbs/connectives are English presentation logic here.

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

/** Capitalise the first character of a sentence (the rest is left as-is). */
function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Display noun for a buff field (lower-case, for mid-sentence use). */
function fieldName(field: string): string {
  return FIELDS[field] ?? field;
}

/** The verb for a multiplicative factor: the round big ones name themselves; the rest increase/drop. */
function mulVerb(factor: number): string {
  if (near(factor, 3)) return 'triples';
  if (near(factor, 2)) return 'doubles';
  if (factor > 1) return 'increases';
  if (near(factor, 0.5)) return 'halves';
  return 'drops'; // a softer reduction (e.g. ÷1.5)
}

/** "1 hour", "8 hours", "15 minutes". */
function durationPhrase(sec: number): string {
  if (sec % 3600 === 0) {
    const h = sec / 3600;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (sec % 60 === 0) {
    const m = sec / 60;
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${sec} second${sec === 1 ? '' : 's'}`;
}

/** A "gain" effect: a buff (factor > 1) or a permanent boost. */
function isGain(e: CallInEffect): boolean {
  return e.kind === 'permanentMul' || (e.kind === 'timedMul' && e.factor > 1);
}

/**
 * One live timed effect as a standalone clause, for the buffs HUD ("Reprobate generation doubles"):
 * the option sub-label's vocabulary without the duration, which the HUD counts down itself. Where the
 * verb does not name the magnitude (×1.33, ÷1.5) the percentage follows it, so the line always
 * carries its number ("Gold gain increases by 33%", "Influence regeneration drops by 33%").
 */
export function describeCallBuff(field: string, factor: number): string {
  const verb = mulVerb(factor);
  const named = verb !== 'increases' && verb !== 'drops';
  const by = named ? '' : ` by ${Math.round(Math.abs(factor - 1) * 100)}%`;
  return capitalize(`${fieldName(field)} ${verb}${by}`);
}

/** Clause for a gain effect (the main sentence). */
function gainClause(e: CallInEffect): string {
  if (e.kind === 'timedMul') {
    return `${fieldName(e.field)} ${mulVerb(e.factor)} for ${durationPhrase(e.durationSec)}`;
  }
  if (e.kind === 'permanentMul') {
    return `permanently raises maximum influence by ${Math.round((e.factor - 1) * 100)}%`;
  }
  return '';
}

/** Clause for a non-gain effect (a cost or a cull — the "…, but …" tail, or a standalone sentence). */
function costOrKillClause(e: CallInEffect): string {
  switch (e.kind) {
    case 'timedMul': // a debuff (factor < 1)
      return `${fieldName(e.field)} ${mulVerb(e.factor)}`;
    case 'spendGoldPct':
      if (e.pct >= 100) return 'spends all your gold';
      if (e.pct === 50) return 'costs half your gold';
      if (e.pct === 33) return 'costs a third of your gold';
      if (e.pct === 25) return 'costs a quarter of your gold';
      return `costs ${e.pct}% of your gold`;
    case 'loseReprobatesPct':
      return `you lose ${e.pct}% of your reprobates`;
    case 'killReprobatesPct':
      return `kills ${e.pct}% of your reprobates`;
    default:
      return '';
  }
}

/**
 * Generate the natural-language sub-label for a choice from its effects. Returns '' for a choice with
 * no effects (decline / lore / easter egg), so the UI shows no sub-label there.
 */
export function describeCallInEffects(effects: readonly CallInEffect[]): string {
  if (effects.length === 0) return '';
  const gains = effects.filter(isGain);
  const rest = effects.filter((e) => !isGain(e));
  let sentence: string;
  if (gains.length > 0) {
    sentence = gains.map(gainClause).join(' and ');
    if (rest.length > 0) sentence += `, but ${rest.map(costOrKillClause).join(' and ')}`;
  } else {
    sentence = rest.map(costOrKillClause).join(' and '); // a standalone cull or pure cost
  }
  return capitalize(sentence);
}

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
 * A call's name and caller for surfaces outside the call stage (the buffs HUD's hover card): the
 * catalogue `title` and the big caller name (e.g. "Mai", "an acolyte"). `null` for an unknown id.
 */
export function callInSource(id: string): { title: string; caller: string } | null {
  const copy = CATALOG[id];
  if (!copy) return null;
  return { title: copy.title, caller: callerName(copy.tag) };
}

/**
 * Join one beat's choices with their strings, recursing into each pick's next beat. Options whose
 * `requires` fail `ctx` are left out; each kept option carries its catalogue index.
 */
function joinChoices(
  data: readonly CallInChoiceData[],
  copy: readonly CallChoiceCopy[],
  ctx: CallEligibilityContext | null,
): CallInChoiceView[] {
  const choices: CallInChoiceView[] = [];
  data.forEach((c, index) => {
    if (ctx !== null && c.requires && !requirementsMet(ctx, c.requires)) return;
    const text = copy[index];
    const sub = describeCallInEffects(c.effects ?? []);
    const next: CallBeatView | undefined = c.next && {
      recording: c.next.recording ?? null,
      silenceSec: c.next.silenceSec ?? 0,
      line: text?.next?.line ?? '',
      choices: joinChoices(c.next.choices, text?.next?.choices ?? [], ctx),
    };
    choices.push({
      index,
      label: text?.label ?? '',
      ...(sub ? { sub } : {}),
      dim: c.dim === true,
      ...(next ? { next } : {}),
    });
  });
  return choices;
}

/** Join a call's structural row with its strings (see `joinChoices` for the gate). */
function joinCallView(
  data: CallInData | CallOutData,
  copy: CallCopy,
  ctx: CallEligibilityContext | null,
): CallInView {
  return {
    id: data.id,
    audio: data.audio,
    class: 'class' in data ? data.class : 'call-out',
    tag: displayTag(copy.tag),
    caller: callerName(copy.tag),
    line: copy.line ?? '',
    recording: data.recording ?? data.id,
    skippable: data.skippable !== false,
    choices: joinChoices(data.choices, copy.choices, ctx),
  };
}

/**
 * Join one catalogue row with its strings into a render-ready `CallInView`. Returns `null` for an
 * unknown id or one missing its strings entry (keeps a typo from throwing at render time). With a
 * `ctx`, an option whose `requires` is unmet is hidden (the Imperium answer to `the-ward`); without
 * one, every option is shown (no gate, as `pickIncomingCall` treats an absent `eligible`).
 */
export function buildCallInView(
  id: string,
  ctx: CallEligibilityContext | null = null,
): CallInView | null {
  const data: CallInData | undefined = CALL_IN_BY_ID[id];
  const copy = CATALOG[id];
  if (!data || !copy) return null;
  return joinCallView(data, copy, ctx);
}

/**
 * Join an outgoing call (docs/PANVITIUM-CALLS-OUT.md), placed from the dialer, with its strings into
 * the same `CallInView` the call stage renders. `null` for an unknown id or missing strings.
 */
export function buildCallOutView(id: string): CallInView | null {
  const data: CallOutData | undefined = CALL_OUT_BY_ID[id];
  const copy = strings.phone.callOut.calls[id];
  if (!data || !copy) return null;
  return joinCallView(data, copy, null);
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

/** Whether a requirement set (a call's or an option's) is met in the given context. */
function requirementsMet(ctx: CallEligibilityContext, req: CallRequirements): boolean {
  if (req.katabasisCountMin !== undefined && ctx.katabasisCount < req.katabasisCountMin)
    return false;
  if (req.fcFriendly !== undefined && ctx.fcFriendly !== req.fcFriendly) return false;
  if (req.emails && !req.emails.every((id) => ctx.receivedEmailIds.has(id))) return false;
  return true;
}

/** Whether a call's requirements are met right now. A call with no `requires` is always eligible. */
export function isCallEligible(ctx: CallEligibilityContext, data: CallInData): boolean {
  return data.requires ? requirementsMet(ctx, data.requires) : true;
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
 * eggs can only ever be received once; `seen` carries the ids already received), the requirement gate
 * (`eligible`, the ids whose `requires` are currently met — pass `null`/omit for no gate), and a
 * recency cooldown (`recent`, the ids received in the last few calls — the same call cannot recur
 * while it sits in this set, so with a 4-deep window a call rings at most once every 5 calls). The
 * cooldown is best-effort: if it would empty the pool it is dropped rather than starve the line. Pure:
 * all entropy comes from `random` (a `() => number` in [0, 1)), so a test can pin the outcome. Picks
 * a class bucket by its renormalised weight (empty buckets drop out), then a uniform call within it.
 * Returns `null` when nothing is eligible.
 */
export function pickIncomingCall(
  random: () => number,
  seen: ReadonlySet<string> = new Set(),
  eligible: ReadonlySet<string> | null = null,
  recent: ReadonlySet<string> | null = null,
): string | null {
  const base = CALLS_IN.filter(
    (c) => !(isOnceOnly(c.class) && seen.has(c.id)) && (eligible === null || eligible.has(c.id)),
  );
  if (base.length === 0) return null;
  // Apply the recency cooldown, but never let it empty the pool (better to repeat than not ring).
  const cooled = recent ? base.filter((c) => !recent.has(c.id)) : base;
  const pool = cooled.length > 0 ? cooled : base;

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
