/**
 * Render smoke tests for the cinematic Katabasis flow (Claude Design handoff + seal-gate rework).
 * These pin the wiring the visual rework introduced: the descent opens on the full-screen Altar
 * commit gate (now a ritual seal circle), the seal arms on the first press and commits on the
 * second (the two-press safeguard, preserved), the "Status quo" action opens the read-only Ledger
 * (Cardinal-Sin standing + bound-sigil effects), the recap reads "You Rise" off the committed
 * state, and the Eternal-Sin reveal overlays the still-mounted flow. The store actions and sim math
 * themselves are covered by their own suites.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { KatabasisModal } from '../ui/KatabasisModal.js';

// jsdom has no real media element; stub the methods the ambient-score effect may touch.
const media = window.HTMLMediaElement.prototype;
media.play = () => Promise.resolve();
media.pause = () => undefined;
media.load = () => undefined;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(KatabasisModal)));
}

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();
function patch(part: Partial<GameState>): void {
  const s = store().state as GameState;
  useGameStore.setState({ state: { ...s, ...part } });
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({
    state: null,
    ready: false,
    katabasisPhase: null,
    recap: null,
    eternalReveal: false,
    log: [],
    signature: null,
    notice: null,
    titleOpen: false,
  });
  store().init();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

/** Find an inscribed gate action ("Turn away" / "Status quo") by its label text. */
function action(label: string): HTMLButtonElement {
  const found = Array.from(container!.querySelectorAll<HTMLButtonElement>('.altar-action')).find(
    (a) => a.querySelector('.altar-action-label')?.textContent === label,
  );
  if (!found) throw new Error(`no altar action labelled "${label}"`);
  return found;
}

describe('Katabasis flow — orchestrator', () => {
  it('renders nothing when idle (no phase, no reveal)', () => {
    render();
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
  });

  it('opens the descent on the full-screen Altar seal gate', () => {
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
    expect(container!.querySelector('.altar-title')?.textContent).toBe('Katabasis');
    // The central sigil is the descend button; the two inscribed gates sit beneath it.
    expect(container!.querySelector('.kat-seal-btn')).not.toBeNull();
    expect(container!.querySelectorAll('.altar-action').length).toBe(2);
    expect(action('Turn away')).toBeTruthy();
    expect(action('Status quo')).toBeTruthy();
    // Not yet armed.
    expect(container!.querySelector('.kat-seal-wrap.is-armed')).toBeNull();
  });

  it('arms the seal on the first press (two-press commit)', () => {
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
    const seal = container!.querySelector<HTMLButtonElement>('.kat-seal-btn')!;
    act(() => seal.click());
    expect(container!.querySelector('.kat-seal-wrap.is-armed')).not.toBeNull();
    expect(container!.querySelector('.kat-seal-hint')?.textContent).toContain('there is no return');
  });

  it('renders the "You Rise" recap off the committed state, listing what survived', () => {
    // Give Gula enough Devotion for Rank 1 (180^1), then run the descent to the recap.
    patch({
      souls: bn(5000),
      devotion: { ...(store().state as GameState).devotion, gula: bn(200) },
    });
    store().beginKatabasis();
    store().confirmKatabasis();
    render();
    expect(container!.querySelector('.recap-title')?.textContent).toBe('You Rise');
    const rows = Array.from(container!.querySelectorAll('.recap-line')).map(
      (r) => r.textContent ?? '',
    );
    // The recap now reports what carried into the next lifetime, not ranks/devotion.
    expect(rows.some((t) => t.includes('Reprobates still here'))).toBe(true);
    expect(rows.some((t) => t.includes('Unlooted maleficia'))).toBe(true);
    expect(rows.some((t) => t.includes('Remaining gold'))).toBe(true);
    // The old "carried up / ranks held" lines are gone.
    expect(rows.some((t) => t.includes('Souls carried up'))).toBe(false);
    expect(rows.some((t) => t.includes('Ranks held'))).toBe(false);
  });

  it('overlays the Eternal-Sin reveal on top of the still-mounted flow', () => {
    useGameStore.setState({ katabasisPhase: 'menu', eternalReveal: true });
    render();
    // The reveal names Semet…
    expect(container!.querySelector('.reveal-name')?.textContent).toBe('Semet');
    // …and the menu flow is still mounted underneath (place preserved).
    expect(container!.querySelector('.altar-gate')).not.toBeNull();
    expect(container!.querySelectorAll('.katabasis-flow').length).toBeGreaterThanOrEqual(2);
  });

  it('opens the gate via openKatabasis without tearing down the lifetime', () => {
    act(() => store().openKatabasis());
    render();
    expect(container!.querySelector('.altar-gate')).not.toBeNull();
    expect(container!.querySelector('.kat-seal-btn')).not.toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
  });

  it('turning away at the gate returns to the room cleanly (no teardown)', () => {
    act(() => store().openKatabasis());
    render();
    act(() => action('Turn away').click());
    expect(store().katabasisPhase).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
  });

  it('committing at the gate enters Katabasis (teardown) and falls into the descent', () => {
    act(() => store().openKatabasis());
    render();
    const seal = container!.querySelector<HTMLButtonElement>('.kat-seal-btn')!;
    act(() => seal.click()); // arm
    act(() => seal.click()); // commit
    expect((store().state as GameState).inKatabasis).toBe(true);
    expect(container!.querySelector('.transit')).not.toBeNull(); // the Abyss descent transition
  });

  it('opens the Ledger from the gate, listing the eight Princes (fresh = none seated)', () => {
    act(() => store().openKatabasis());
    render();
    act(() => action('Status quo').click());
    expect(container!.querySelector('.ledger-title')?.textContent).toBe('The Ledger');
    // Every Cardinal Sin gets a card; a fresh game seats none and binds no seals.
    expect(container!.querySelectorAll('.ledger-sin').length).toBe(8);
    expect(container!.querySelectorAll('.ledger-sin.is-dormant').length).toBe(8);
    const stats = Array.from(container!.querySelectorAll('.ls-stat')).map(
      (s) => s.textContent ?? '',
    );
    expect(stats.some((t) => t.includes('0') && t.includes('Total Sin Level'))).toBe(true);
    // No seal is bound, so the Bound section is empty…
    expect(container!.querySelector('.ledger-sigils-empty')).not.toBeNull();
    expect(container!.querySelector('.ledger-sigil:not(.is-unbound)')).toBeNull();
    // …but every visible seal surfaces in the Unbound section (all 72 but the gated Semet),
    // each effect-only (no magnitude, no souls-bound readout).
    const unbound = container!.querySelectorAll('.ledger-sigil.is-unbound');
    expect(unbound.length).toBe(71);
    expect(unbound[0]!.querySelector('.ls-bound')).toBeNull();
    expect(unbound[0]!.querySelector('.ls-seal-img')).not.toBeNull();
    expect(unbound[0]!.querySelector('.ls-roman')?.textContent).toBe('I');
  });

  it('lists a bound sigil in the Ledger by name, effect + magnitude, and souls bound', () => {
    // Marbas #5 — always visible; sheet effect "Indagatio positive outcomes ↑".
    patch({ sigilBindings: { 5: bn(100) } });
    act(() => store().openKatabasis());
    render();
    act(() => action('Status quo').click());
    const sig = container!.querySelector('.ledger-sigil');
    expect(sig).not.toBeNull();
    expect(sig!.querySelector('.ls-name')?.textContent).toContain('Marbas'); // seal name shown
    // The seal carries its art + Goetic number to the left of the name (Marbas #5 → "V").
    expect(sig!.querySelector('.ls-seal-img')).not.toBeNull();
    expect(sig!.querySelector('.ls-roman')?.textContent).toBe('V');
    // The effect text now carries the live magnitude in place of the direction arrow\u2026
    const effect = sig!.querySelector('.ls-effect')?.textContent ?? '';
    expect(effect).toContain('Indagatio positive outcomes');
    expect(effect).toContain('%'); // current effect magnitude
    expect(effect).not.toContain('\u2191'); // the arrow is gone
    // \u2026and the trailing field reads the souls bound, not the effect.
    expect(sig!.querySelector('.ls-bound')?.textContent).toContain('souls bound');
    expect(sig!.querySelector('.ls-bound')?.textContent).toContain('100');
  });

  it('returns to the gate from the Ledger via the back link', () => {
    act(() => store().openKatabasis());
    render();
    act(() => action('Status quo').click());
    expect(container!.querySelector('.ledger')).not.toBeNull();
    const back = container!.querySelector<HTMLButtonElement>('.ledger-back')!;
    act(() => back.click());
    expect(container!.querySelector('.ledger')).toBeNull();
    expect(container!.querySelector('.altar-gate')).not.toBeNull();
    expect(container!.querySelector('.kat-seal-btn')).not.toBeNull();
  });

  it('resumes a mid-descent save on the Princes, not the Altar gate', () => {
    // A save written while down in Katabasis reopens frozen (`inKatabasis`) with the menu phase
    // patched back in (gameStore.init). The player was in Hell, so the flow should land on the
    // Court of Princes where they left off — not back at the (already-committed) commit gate.
    patch({ inKatabasis: true });
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
    // The eight Princes are seated in the statue field…
    expect(container!.querySelector('.statue-field')).not.toBeNull();
    expect(container!.querySelectorAll('.statue').length).toBe(8);
    // …the soul HUD + Hell floor (crawl to Goetia / rise) are up — the in-Hell chrome…
    expect(container!.querySelector('.kat-hud')).not.toBeNull();
    expect(container!.querySelector('.floor')).not.toBeNull();
    // …and the Altar commit gate is gone (we did not rewind to it).
    expect(container!.querySelector('.altar-gate')).toBeNull();
    expect(container!.querySelector('.kat-seal-btn')).toBeNull();
  });
});
