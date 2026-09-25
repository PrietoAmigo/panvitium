/**
 * Render smoke tests for the cinematic Katabasis flow (Claude Design handoffs) and its trigger in
 * the Altar Room (the "Altar sigil" handoff). Clicking the altar raises the Katabasis sigil over
 * the room with STATUS QUO beneath it; the sigil arms on the first press and commits on the second
 * (the two-press safeguard, preserved), falling into the Abyss descent; STATUS QUO opens the
 * read-only Ledger (Cardinal-Sin standing + bound-sigil effects), whose way back returns to the
 * room; left alone, the sigil fades away. The recap reads "You Rise" off the committed state, and
 * the Eternal-Sin reveal overlays the still-mounted flow. The store actions and sim math themselves
 * are covered by their own suites.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, createElement, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bn, type GameState } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { KatabasisModal } from '../ui/KatabasisModal.js';
import { App } from '../App.js';
import { splitBoon } from './Katabasis.js';
import type { DegradedSceneProps } from './types.js';

// The room's canvas pass needs a real 2D context (none under jsdom): stub it, keeping the props the
// room hands it, so the altar sigil's hand-off to the pass can be read back.
const scene = vi.hoisted(() => ({ last: null as DegradedSceneProps | null }));
vi.mock('./DegradedScene.js', () => ({
  DegradedScene: (props: DegradedSceneProps) => {
    scene.last = props;
    return null;
  },
  preloadImage: () => undefined,
}));
// The sync panel probes the network on mount; the altar needs none of it.
vi.mock('../ui/SyncPanel.js', () => ({ SyncPanel: () => null }));

// jsdom has no real media element; stub the methods the ambient-score effect may touch.
const media = window.HTMLMediaElement.prototype;
media.play = () => Promise.resolve();
media.pause = () => undefined;
media.load = () => undefined;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(component: FunctionComponent = KatabasisModal): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(component)));
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
    katabasisEntry: null,
    recap: null,
    eternalReveal: false,
    log: [],
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

/** A button in the rendered tree by its accessible label (hotspots, the sigil) or its text. */
function button(name: string | RegExp): HTMLButtonElement | null {
  const all = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'));
  const hit = (v: string | null | undefined): boolean =>
    v != null && (typeof name === 'string' ? v === name : name.test(v));
  return all.find((b) => hit(b.getAttribute('aria-label')) || hit(b.textContent?.trim())) ?? null;
}
function click(name: string | RegExp): void {
  const b = button(name);
  if (!b) throw new Error(`no button named ${String(name)}`);
  act(() => b.click());
}

describe('Katabasis flow — orchestrator', () => {
  it('renders nothing when idle (no phase, no reveal)', () => {
    render();
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
  });

  it('no longer carries the full-screen Altar gate (its sigil lives in the room now)', () => {
    act(() => store().openKatabasis());
    render();
    expect(container!.querySelector('.altar-gate')).toBeNull();
    expect(container!.querySelector('.altar-title')).toBeNull();
    expect(container!.querySelector('.altar-sigil')).toBeNull();
    expect(button('Unfocus')).toBeNull();
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
    expect(container!.querySelector('.ledger')).not.toBeNull();
    expect(container!.querySelectorAll('.katabasis-flow').length).toBeGreaterThanOrEqual(2);
  });

  it('openKatabasis opens the flow on the Ledger without tearing down the lifetime', () => {
    act(() => store().openKatabasis());
    render();
    expect(container!.querySelector('.ledger')).not.toBeNull();
    expect(container!.querySelector('.transit')).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
  });

  it('beginKatabasis (the committed descent) opens the flow on the Abyss transition', () => {
    act(() => store().beginKatabasis());
    render();
    expect((store().state as GameState).inKatabasis).toBe(true);
    expect(container!.querySelector('.transit')?.getAttribute('data-dir')).toBe('down');
    expect(container!.querySelector('.transit-word')?.textContent).toBe('Katabasis');
    expect(container!.querySelector('.ledger')).toBeNull();
  });

  it('lists the eight Princes on the Ledger (fresh = none seated)', () => {
    act(() => store().openKatabasis());
    render();
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

  it('shows each Sin’s Level and the souls owed to the next level (rank renamed to level)', () => {
    // Gula with 50 devotion sits at Level 0 (Level I needs 180 souls) → 130 still owed.
    const s = store().state as GameState;
    patch({ devotion: { ...s.devotion, gula: bn(50) } });
    act(() => store().openKatabasis());
    render();
    const gulaCard = container!.querySelectorAll('.ledger-sin')[0]!; // SINS order → Gula first
    // "Rank" was renamed to "Level" on the Status Quo page.
    expect(gulaCard.querySelector('.ls-tag.is-lvl')?.textContent).toContain('Level 0');
    // The devoted count carries the souls still owed to the next level beside it.
    expect(gulaCard.querySelector('.ls-devoted')?.textContent).toContain('50 devoted souls');
    expect(gulaCard.querySelector('.ls-tonext')?.textContent).toContain('130 to next level');
    // Nothing on the page still reads "Rank".
    const lvlTags = Array.from(container!.querySelectorAll('.ls-tag.is-lvl')).map(
      (n) => n.textContent ?? '',
    );
    expect(lvlTags.length).toBe(8);
    expect(lvlTags.every((t) => t.startsWith('Level'))).toBe(true);
    expect(lvlTags.some((t) => t.includes('Rank'))).toBe(false);
  });

  it('heads the Ledger with the big Souls KPI (moved out of Analytics)', () => {
    patch({ souls: bn(12345) });
    act(() => store().openKatabasis());
    render();
    const souls = container!.querySelector('.ledger-souls');
    expect(souls).not.toBeNull();
    expect(souls!.querySelector('.ledger-souls-lab')?.textContent).toBe('Souls');
    // The headline value reads the live soul total, formatted (below a million: a grouped integer).
    expect(souls!.querySelector('.ledger-souls-num')?.textContent).toBe('12,345');
  });

  it('lists a bound sigil in the Ledger by name, effect + magnitude, and souls bound', () => {
    // Marbas #5 — always visible; sheet effect "Indagatio positive outcomes ↑".
    patch({ sigilBindings: { 5: bn(100) } });
    act(() => store().openKatabasis());
    render();
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

  it('the Ledger’s way back closes the flow, back to the Altar Room (no teardown)', () => {
    act(() => store().openKatabasis());
    render();
    expect(container!.querySelector('.ledger')).not.toBeNull();
    const back = container!.querySelector<HTMLButtonElement>('.ledger-back')!;
    expect(back.textContent).toContain('Return to the altar');
    act(() => back.click());
    expect(store().katabasisPhase).toBeNull();
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
  });

  it('resumes a mid-descent save on the Princes, not the Ledger or the descent', () => {
    // A save written while down in Katabasis reopens frozen (`inKatabasis`) with the menu phase
    // patched back in (gameStore.init). The player was in Hell, so the flow should land on the
    // Court of Princes where they left off — not replay the (already-committed) descent.
    patch({ inKatabasis: true });
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
    // The eight Princes are seated in the statue field…
    expect(container!.querySelector('.statue-field')).not.toBeNull();
    expect(container!.querySelectorAll('.statue').length).toBe(8);
    // …the soul HUD + Hell floor (crawl to Goetia / rise) are up — the in-Hell chrome…
    expect(container!.querySelector('.kat-hud')).not.toBeNull();
    expect(container!.querySelector('.floor')).not.toBeNull();
    // …and we did not rewind to the Ledger or replay the descent transition.
    expect(container!.querySelector('.ledger')).toBeNull();
    expect(container!.querySelector('.transit')).toBeNull();
  });
});

describe('The altar sigil (the Katabasis trigger in the Altar Room)', () => {
  // The whole app, as the player meets it: the Altar Room with its hotspots, the sigil overlay, and
  // the Katabasis flow above them.
  const room = (): Element | null => container!.querySelector('[aria-label="The Altar Room"]');
  const sigilLayer = (): Element | null => container!.querySelector('.altar-sigil');

  it('raises the sigil and STATUS QUO over the room when the altar is clicked', () => {
    render(App);
    expect(room()).not.toBeNull();
    expect(sigilLayer()).toBeNull();
    expect(scene.last?.sigil ?? null).toBeNull();
    click('The Altar');
    // The room stays: no full-screen flow, just the overlay over it.
    expect(room()).not.toBeNull();
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
    expect(button('Press the sigil')).not.toBeNull();
    expect(button('Status Quo')).not.toBeNull();
    // The seal itself is painted through the room's degradation pass (so it pixelates with it).
    expect(scene.last?.sigil).toMatchObject({
      src: '/assets/panvitium/katabasis/seal-panvitium.png',
      look: 'idle',
      shown: true,
    });
    expect(store().katabasisPhase).toBeNull(); // nothing opened, nothing torn down
  });

  it('arms on the first press, hiding STATUS QUO, and commits the descent on the second', () => {
    render(App);
    click('The Altar');
    click('Press the sigil');
    expect(button('Status Quo')).toBeNull();
    const seal = button(/there is no return/);
    expect(seal).not.toBeNull();
    expect(scene.last?.sigil?.look).toBe('armed');
    expect((store().state as GameState).inKatabasis).not.toBe(true); // still safe to walk away
    click(/there is no return/);
    // Committed: the teardown + freeze, and the flow falls straight into the Abyss descent.
    expect((store().state as GameState).inKatabasis).toBe(true);
    expect(store().katabasisPhase).toBe('menu');
    expect(container!.querySelector('.transit-word')?.textContent).toBe('Katabasis');
    expect(sigilLayer()).toBeNull();
    expect(scene.last?.sigil ?? null).toBeNull();
  });

  it('lands among the Princes once the descent transition has played', () => {
    vi.useFakeTimers();
    try {
      render(App);
      click('The Altar');
      click('Press the sigil');
      click(/there is no return/);
      act(() => {
        vi.advanceTimersByTime(4200);
      });
      expect(container!.querySelector('.statue-field')).not.toBeNull();
      expect(container!.querySelectorAll('.statue').length).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the Ledger from STATUS QUO, whose way back returns to the room', () => {
    render(App);
    click('The Altar');
    click('Status Quo');
    expect(container!.querySelector('.ledger-title')?.textContent).toBe('The Ledger');
    expect(sigilLayer()).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true); // pre-commit: no teardown
    click(/Return to the altar/);
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
    expect(store().katabasisPhase).toBeNull();
    expect(room()).not.toBeNull();
    expect(sigilLayer()).toBeNull(); // the sigil does not come back by itself
  });

  it('fades away after 4 s untouched, then is gone', () => {
    vi.useFakeTimers();
    try {
      render(App);
      click('The Altar');
      act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(sigilLayer()?.classList.contains('is-fading')).toBe(false);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sigilLayer()?.classList.contains('is-fading')).toBe(true);
      expect(scene.last?.sigil?.shown).toBe(false); // the painted seal fades with it
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(sigilLayer()).toBeNull();
      expect(scene.last?.sigil ?? null).toBeNull();
      expect(button('Status Quo')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an armed sigil also fades after 4 s, armed to the end; clicking the altar restarts the wait', () => {
    vi.useFakeTimers();
    try {
      render(App);
      click('The Altar');
      click('Press the sigil');
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      click('The Altar'); // restarts the timer, stays armed
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(button(/there is no return/)).not.toBeNull();
      expect(sigilLayer()?.classList.contains('is-fading')).toBe(false);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(sigilLayer()?.classList.contains('is-fading')).toBe(true);
      expect(scene.last?.sigil).toMatchObject({ look: 'armed', shown: false });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(sigilLayer()).toBeNull();
      expect((store().state as GameState).inKatabasis).not.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the painted seal mirrors its hit target: hovering lifts it, a press sinks it', () => {
    render(App);
    click('The Altar');
    const seal = button('Press the sigil')!;
    const fire = (type: string, init: MouseEventInit = {}): void => {
      act(() => {
        seal.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
      });
    };
    expect(scene.last?.sigil).toMatchObject({ hover: false, press: false });
    fire('pointerover');
    expect(scene.last?.sigil).toMatchObject({ hover: true, press: false });
    fire('pointerdown', { button: 0 });
    expect(scene.last?.sigil).toMatchObject({ hover: true, press: true });
    fire('pointerup', { button: 0 });
    fire('pointerout', { relatedTarget: document.body });
    expect(scene.last?.sigil).toMatchObject({ hover: false, press: false });
  });

  it('a door puts the sigil away at once', () => {
    render(App);
    click('The Altar');
    click('Press the sigil');
    click('To the Studio');
    expect(sigilLayer()).toBeNull(); // no fade
    expect(scene.last?.sigil ?? null).toBeNull();
    expect(container!.querySelector('[aria-label="The Studio"]')).not.toBeNull();
    click('To the Altar');
    expect(sigilLayer()).toBeNull();
  });
});

describe('splitBoon (ledger label)', () => {
  const UP = '\u2191';
  const DOWN = '\u2193';

  it('strips a single trailing arrow and returns it as dir', () => {
    expect(splitBoon(`Gold gain ${UP}`)).toEqual({ text: 'Gold gain', dir: UP });
    expect(splitBoon(`Opera negative outcomes ${DOWN}`)).toEqual({
      text: 'Opera negative outcomes',
      dir: DOWN,
    });
  });

  it('drops a trailing (flat) qualifier before the arrow', () => {
    expect(splitBoon(`Murder rate ${UP} (flat)`).text).toBe('Murder rate');
  });

  it('strips EVERY arrow of a composite label, leaving no dangling mid-string arrow', () => {
    // Raum #40: two legs, one arrow each; the magnitude column carries the signs.
    expect(splitBoon(`Decimatio efficiency ${UP}, Suasio efficiency ${DOWN}`).text).toBe(
      'Decimatio efficiency, Suasio efficiency',
    );
    // Andrealphus #65.
    expect(splitBoon(`Invocation costs ${DOWN}, Desidia speed ${UP}`).text).toBe(
      'Invocation costs, Desidia speed',
    );
  });
});
