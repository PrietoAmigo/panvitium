/**
 * Tests for the Katabasis "Aether" sigil sphere (Claude Design port).
 *
 * `toRoman` / `effectDisplay` are the two pure seams the screen depends on: the roman seal numbers,
 * and — the heart of pending point #2 — the real per-seal effect magnitude, derived from the sim's
 * `sigilStrength` (coefficient × curve), not the prototype's √×0.01 stub. The render smoke test pins
 * that the screen mounts against live store state: 72 seals, the burning counter off the real
 * bindings, and the browse-bar "Unbind all" gating. The projection loop, store mutators and effect
 * math have their own suites; the rAF-driven focus is intentionally not asserted here.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { bn, sigilById, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { AetherSigils, toRoman, effectDisplay, browseEffectText } from './AetherSigils.js';
import { boonLabel } from './katabasisShared.js';

describe('toRoman', () => {
  it('renders seal numbers 1..72 as roman numerals', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(32)).toBe('XXXII');
    expect(toRoman(44)).toBe('XLIV');
    expect(toRoman(72)).toBe('LXXII');
  });
});

describe('browseEffectText (the browse bar\u2019s effect line)', () => {
  it('reads the Status Quo label: the boon text with its arrows, no magnitude', () => {
    // idx is zero-based: seal #33 (Gaap) is idx 32.
    expect(browseEffectText(32, true)).toBe('Maleficia effects \u2191');
    expect(browseEffectText(10, true)).toBe('Influence gain \u2193'); // Gusion #11, a reduction
    expect(browseEffectText(24, true)).toBe('Murder rate \u2191'); // Glasya-Labolas #25, "(flat)" dropped
    // Andrealphus #65: both legs keep their arrows.
    expect(browseEffectText(64, true)).toBe('Invocation costs \u2193, Desidia speed \u2191');
  });

  it('matches the ledger\u2019s label for every seal', () => {
    for (let id = 1; id <= 72; id++) {
      const desc = strings.sigils.descriptions[id] ?? 'A seal of the lesser key.';
      expect(browseEffectText(id - 1, true)).toBe(boonLabel(desc));
    }
  });

  it('is empty when nothing is centred', () => {
    expect(browseEffectText(-1, true)).toBe('');
  });

  it('names the gate, not the boon, while Semet is sealed', () => {
    expect(browseEffectText(31, false)).toBe('Sealed until every Cardinal Sin reaches Rank II');
    expect(browseEffectText(31, true)).toBe('Sigil effects \u2191');
  });
});

describe('effectDisplay — real per-seal magnitude (pending #2)', () => {
  it('shows a percentage for multiplier sigils (Valefor #6, +gold rate)', () => {
    // Default pct curve (log base 33): coefficient 1 × (0.1125·log33(1e6) − 0.0625) ≈ 0.382 → +38.2%
    expect(effectDisplay(sigilById(6), bn(1_000_000))).toBe('+38.2%');
  });

  it('shows a flat per-second value for generator sigils (Haagenti #48, +gold/s)', () => {
    const out = effectDisplay(sigilById(48), bn(1_000_000));
    expect(out.startsWith('+')).toBe(true);
    expect(out.endsWith('gold/s')).toBe(true);
  });

  it('shows rounded invoking power for Forneus #30 (log curve)', () => {
    // coefficient 0.5 × ln(1e8 + 1) ≈ 9.21 → +9 invoking power (Andrealphus #65 vacated this niche)
    expect(effectDisplay(sigilById(30), bn(100_000_000))).toBe('+9 invoking power');
  });

  it('shows both legs of a composite seal, each signed (ADR-035)', () => {
    // Andrealphus #65: the cost-reduction leg reads '−', the Desidia-speed increase reads '+'.
    const and = effectDisplay(sigilById(65), bn(100_000_000));
    expect(and.startsWith('−')).toBe(true);
    expect(and).toContain(' / +');
    expect(and.endsWith('%')).toBe(true);
  });

  it('shows no magnitude for a dormant seal, however many souls it holds (ADR-038)', () => {
    // Beleth, Marax, Ipos, Raum, Focalor and Haures served only Decimatio and now sleep.
    for (const id of [13, 21, 22, 40, 41, 64]) {
      expect(effectDisplay(sigilById(id), bn(100_000_000))).toBe('\u2014');
    }
  });

  it('keeps two significant digits for the per-capita rate seals, never "+0" (balance audit 2026-10-08)', () => {
    // Sabnock #43 at 100 souls: 0.001 × ln(101) ≈ 0.0046 suicides per reprobate per second. Two fixed
    // decimals printed it as "+0" (and every binding below ~22k souls as "+0" or "+0.01").
    expect(effectDisplay(sigilById(43), bn(100))).toBe('+0.0046 suicides/reprobate\u00b7s');
    expect(effectDisplay(sigilById(25), bn(1_000))).toBe('+0.0069 murders/reprobate\u00b7s');
    // Larger flat amounts read as before: Decarabia #69 at 1k souls, 0.5 × ln(1001) ≈ 3.45.
    expect(effectDisplay(sigilById(69), bn(1_000))).toBe('+3.45 influence/s');
  });

  it('scales the magnitude by the live sigil-effect stack it is given (relics, Gaap, Semet)', () => {
    // Valefor at 1e6 souls: 0.382 bare; Solomon's Ring (×1.66) lifts it to ≈ 0.634.
    expect(effectDisplay(sigilById(6), bn(1_000_000), 1.66)).toBe('+63.4%');
    expect(effectDisplay(sigilById(6), bn(1_000_000))).toBe('+38.2%'); // default: no stack
  });

  it('is zero-safe and tolerates an unknown seal', () => {
    expect(effectDisplay(sigilById(6), bn(0))).toBe('+0.0%');
    expect(effectDisplay(undefined, bn(10))).toBe('\u2014');
  });

  it('reads a reduction with a minus sign, matching the seal\u2019s \u2193 description', () => {
    // Cost reductions (Paimon #9) and `decrease` modifiers/tiers (Stolas #36 categoryTier, Bael #1
    // tierGroup) soften their target \u2014 the magnitude must carry the direction so it doesn't read
    // as a buff next to a "\u2193" boon.
    for (const id of [9, 36, 1]) {
      const out = effectDisplay(sigilById(id), bn(1_000_000));
      expect(out.startsWith('\u2212')).toBe(true); // U+2212 MINUS SIGN
      expect(out).toContain('%');
    }
    // `increase` effects read with a plus: Amdusias #67 (tier) and Amy #58 (now a boon, modifierMulti).
    expect(effectDisplay(sigilById(67), bn(1_000_000)).startsWith('+')).toBe(true);
    expect(effectDisplay(sigilById(58), bn(1_000_000)).startsWith('+')).toBe(true);
  });

  it('labels flat death rates as per-capita (Sabnock #43)', () => {
    // The flat addition is per reprobate per second, not an absolute body count.
    expect(effectDisplay(sigilById(43), bn(1_000_000)).endsWith('suicides/reprobate\u00b7s')).toBe(
      true,
    );
  });
});

// ── render smoke ──
const media = window.HTMLMediaElement.prototype;
media.play = () => Promise.resolve();
media.pause = () => undefined;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function renderWith(part: Partial<GameState>): void {
  const base = store().state as GameState;
  const state = { ...base, ...part };
  useGameStore.setState({ state });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(AetherSigils, { state })));
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false });
  store().init();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('AetherSigils — render smoke', () => {
  it('mounts 72 seals and reflects the bindings in the burning counter', () => {
    renderWith({ souls: bn(50_000), sigilBindings: { 6: bn(1_000_000), 48: bn(2_000_000) } });
    expect(container!.querySelectorAll('.aether-seal').length).toBe(72);
    const count = container!.querySelector('.aether-count')?.textContent ?? '';
    expect(count).toContain('2');
    expect(count).toContain('72 seals burning');
  });

  it('enables "Unbind all" only when something is bound', () => {
    renderWith({ souls: bn(50_000), sigilBindings: {} });
    const btn = Array.from(container!.querySelectorAll<HTMLButtonElement>('.aether-btn--ash')).find(
      (b) => (b.textContent ?? '').includes('Unbind all'),
    );
    expect(btn).toBeDefined();
    expect(btn!.disabled).toBe(true);

    act(() => root!.unmount());
    container!.remove();
    renderWith({ souls: bn(50_000), sigilBindings: { 6: bn(1000) } });
    const btn2 = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('.aether-btn--ash'),
    ).find((b) => (b.textContent ?? '').includes('Unbind all'));
    expect(btn2!.disabled).toBe(false);
  });

  it('carries the effect line beneath the browse bar\u2019s buttons', () => {
    renderWith({ souls: bn(50_000), sigilBindings: {} });
    const bar = container!.querySelector('.aether-browsebar');
    expect(bar?.querySelector('.bb-row .aether-btn--blood')).not.toBeNull();
    expect(bar?.lastElementChild?.classList.contains('bb-effect')).toBe(true);
  });
});
