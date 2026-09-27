// View-model for the temporary-buffs HUD (Claude Design "Temporary buffs HUD" handoff, board 2a,
// "Rings in columns"): one ring per live timed source, each single-use maleficium in
// `lifetime.maleficiaBuffs` and each answered call in `lifetime.callBuffs` (an answer's timed effects
// read together on one ring). Pure, no React or DOM, so the order, the grouping and the copy are
// unit-testable (buffs.test.ts); `ui/BuffsHud` renders what this returns. No game logic: it only
// surfaces the timers the sim already keeps.
import { MALEFICIA_BUFF_DURATION_SECONDS, type CallBuff, type GameState } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import { parseEffect } from '../menus/relics.js';
import type { Rarity } from '../menus/types.js';
import { callInSource, describeCallBuff } from './callIn.js';
import { formatShortDuration, trimDecimals } from './format.js';
import { maleficiumView } from './maleficia.js';

/** One effect line on a ring's hover card. */
export interface BuffEffect {
  readonly text: string;
  /** A call factor below 1: the line reads in the debuff red. */
  readonly debuff: boolean;
}

/** One ring: a live single-use maleficium, or one answered call. */
export interface BuffView {
  /** Holds from tick to tick: the React key and the hovered ring. */
  readonly id: string;
  readonly kind: 'maleficium' | 'call';
  readonly name: string;
  /** Who called (the big caller name, e.g. "Mai"); a call's only, when the call is known. */
  readonly caller?: string;
  /** The relic art; a maleficium's only, when it has art (Hand of Glory has none). */
  readonly img?: string;
  /** The relic's rarity, which colours its pixel outline as in the Loculi; maleficia only. */
  readonly rarity?: Rarity;
  /** The dominant magnitude ("×2", "+33%"), drawn in the ring when there is no art to show. */
  readonly glyph: string;
  readonly effects: readonly BuffEffect[];
  readonly remainingSec: number;
  /** The full length: the ring shows remaining / duration (see `ringFraction`). */
  readonly durationSec: number;
}

const HOUR = 3600;

/**
 * A consumable's effect as a bare clause ("+10% reprobate generation"): the catalog copy without its
 * "Single-use:" marker or its "for an hour", since the HUD counts the time down itself, and with the
 * Loculi's true minus sign ("−15% Indagatio time").
 */
function consumableClause(effect: string): string {
  const { headline, remainder } = parseEffect(effect);
  const rest = remainder.replace(/\s+for an hour$/, '');
  return headline ? `${headline} ${rest}` : rest;
}

function maleficiumRings(state: GameState): BuffView[] {
  const rings: BuffView[] = [];
  for (const [id, remaining] of Object.entries(state.lifetime.maleficiaBuffs)) {
    const view = maleficiumView(id);
    if (!view || remaining <= 0) continue;
    rings.push({
      id: `maleficium:${id}`,
      kind: 'maleficium',
      name: view.name,
      ...(view.img ? { img: view.img } : {}),
      rarity: view.rarity,
      glyph: parseEffect(view.effect).headline || view.name.charAt(0),
      effects: [{ text: consumableClause(view.effect), debuff: false }],
      remainingSec: remaining,
      durationSec: MALEFICIA_BUFF_DURATION_SECONDS,
    });
  }
  return rings;
}

/** One answered call's live buffs: the first names the call and carries the shared timer. */
interface Answer {
  readonly head: CallBuff;
  readonly buffs: CallBuff[];
}

/**
 * Split the flat `callBuffs` list into answers. One answer's buffs were appended together, share
 * their call and their timer, and never repeat a field, so a run holds while all three do. That keeps
 * the same call answered twice as two rings, even when both answers came while the world was held
 * still (their timers then equal). A buff kept from before calls were named has no `sourceId`; the
 * rule still regroups its old answer.
 */
function answers(list: readonly CallBuff[]): Answer[] {
  const out: Answer[] = [];
  for (const b of list) {
    if (b.remainingSeconds <= 0) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.head.sourceId === b.sourceId &&
      last.head.remainingSeconds === b.remainingSeconds &&
      !last.buffs.some((x) => x.field === b.field)
    ) {
      last.buffs.push(b);
    } else {
      out.push({ head: b, buffs: [b] });
    }
  }
  return out;
}

/** A call ring's glyph: its dominant multiplier, the strongest buff (else the deepest cut). */
function callGlyph(buffs: readonly CallBuff[]): string {
  const factors = buffs.map((b) => b.factor);
  const top = Math.max(...factors);
  return `×${trimDecimals(top > 1 ? top : Math.min(...factors))}`;
}

function callRings(state: GameState): BuffView[] {
  // Each ring's ordinal among the rings of its call, so its id holds from tick to tick.
  const ordinal = new Map<string, number>();
  return answers(state.lifetime.callBuffs).map(({ head, buffs }): BuffView => {
    const key = head.sourceId ?? '';
    const n = ordinal.get(key) ?? 0;
    ordinal.set(key, n + 1);
    const source = head.sourceId !== undefined ? callInSource(head.sourceId) : null;
    return {
      id: `call:${key}:${n}`,
      kind: 'call',
      name: source?.title ?? strings.buffs.unknownCall,
      ...(source ? { caller: source.caller } : {}),
      glyph: callGlyph(buffs),
      effects: buffs.map((b) => ({
        text: describeCallBuff(b.field, b.factor),
        debuff: b.factor < 1,
      })),
      remainingSec: head.remainingSeconds,
      // A buff from before durations were recorded: nearly every call buff runs an hour.
      durationSec: head.durationSec ?? Math.max(HOUR, head.remainingSeconds),
    };
  });
}

const soonestFirst = (a: BuffView, b: BuffView): number => a.remainingSec - b.remainingSec;

/**
 * The HUD's rings in display order: the maleficia, then the calls, each soonest to expire first.
 * Empty when nothing is running (the HUD then renders nothing).
 */
export function buildBuffs(state: GameState): BuffView[] {
  return [...maleficiumRings(state).sort(soonestFirst), ...callRings(state).sort(soonestFirst)];
}

/** The share of the ring still lit, 0..1. A relic used again stacks another hour onto its timer,
 *  which can run past the one-hour span: its ring holds full until it drains back under the hour. */
export function ringFraction(b: BuffView): number {
  if (b.durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, b.remainingSec / b.durationSec));
}

/** The hover card's source label: "Maleficium", or "Call · Mai" ("Call" when the caller is unknown). */
export function buffKindLabel(b: BuffView): string {
  const K = strings.buffs.kind;
  if (b.kind === 'maleficium') return K.maleficium;
  return b.caller ? `${K.call} · ${b.caller}` : K.call;
}

/**
 * The ring's accessible name: "<name>, <effects>, <time> remaining". The time is the short countdown,
 * so a screen reader is not handed a new name every second while more than a minute is left.
 */
export function buffAriaLabel(b: BuffView): string {
  const time = formatShortDuration(b.remainingSec * 1000);
  const effects = b.effects.map((e) => e.text).join(', ');
  return `${b.name}, ${effects}, ${time} ${strings.maleficia.buffRemaining}`;
}
