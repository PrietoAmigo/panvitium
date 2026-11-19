/**
 * Render smoke tests for the cinematic Katabasis flow (Claude Design handoffs) and its trigger in
 * the Altar Room (the "Altar sigil" handoff). Clicking the altar raises the Katabasis sigil over
 * the room with STATUS QUO beneath it; the sigil arms on the first press and commits on the second
 * (the two-press safeguard, preserved), falling into the Exstinctio descent; STATUS QUO opens the
 * read-only Ledger (Cardinal-Sin standing + bound-sigil effects), whose way back returns to the
 * room; left alone, the sigil fades away. The first commit of a playthrough made with no souls in
 * hand plays the empty-handed warning instead of descending; the first commit that does descend
 * plays the first-descent cinematic, whose hand-off begins the descent. The Anabasis commits the
 * lifetime and lands straight back in the room: there is no recap screen (ADR-043).
 * Once every Prince is mastered the ended scene is the feeding screen (the "Red Cloud" handoff): no
 * statue opens, and holding the obelisk thins the cloud; the pour that crosses the threshold raises
 * the Semet screen, whose Accept rises at once through Anabasis. Before that, a statue raises no
 * menu: the dark closes in around the Prince (the storm's strikes light only the ground near him),
 * his words are carved into the dark beside him, and holding his statue pours Devotion. The store actions and sim math
 * themselves are covered by their own suites.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, createElement, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { bn, ETERNAL_SIN_THRESHOLD, SINS, type GameState, type Sin } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { KatabasisModal } from '../ui/KatabasisModal.js';
import { App } from '../App.js';
import { EMPTY_HANDED_TOTAL_MS } from '../ui/EmptyHandedWarning.js';
import {
  FIRST_DESCENT_TOTAL_MS,
  FIRST_DESCENT_TRANSIT_MS,
  releaseFirstDescent,
} from '../ui/FirstDescent.js';
import { ALTAR_SIGIL_FADE_MS, ALTAR_SIGIL_IDLE_MS } from '../game/useAltarSigil.js';
import {
  SCORE_RESUME_MS,
  TRANSIT_HOLD_MS,
  inscribe,
  inscriptionSide,
  interpunct,
  princeDarkness,
} from './Katabasis.js';
import { KATABASIS_MUSIC_VOLUME } from './katabasisMusic.js';
import { boonLabel } from './katabasisShared.js';
import type { DegradedSceneProps } from './types.js';

// The room's canvas pass needs a real 2D context (none under jsdom): stub it, keeping the props the
// room hands it, so a test can read back what the pass is (and is not) given.
const scene = vi.hoisted(() => ({ last: null as DegradedSceneProps | null, decodes: 0 }));
vi.mock('./DegradedScene.js', () => ({
  DegradedScene: (props: DegradedSceneProps) => {
    scene.last = props;
    return null;
  },
  preloadImage: () => undefined,
  // The first-descent cinematic's plates never decode here: it plays its timeline over the black.
  decodeImage: () => {
    scene.decodes++;
    return new Promise(() => undefined);
  },
}));
// The sync panel probes the network on mount; the altar needs none of it.
vi.mock('../ui/SyncPanel.js', () => ({ SyncPanel: () => null }));

// jsdom has no real media element; stub the methods the ambient-score effect may touch.
const media = window.HTMLMediaElement.prototype;
media.play = () => Promise.resolve();
media.pause = () => undefined;
media.load = () => undefined;
// Nor a 2D canvas context: the first-descent cinematic's pass is built to do without one.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

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
    log: [],
    notice: null,
    emptyHandedWarning: false,
    firstDescentPlaying: false,
    titleOpen: false,
  });
  store().init();
  releaseFirstDescent();
  scene.decodes = 0;
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

  it('the rise shows no "You Rise" recap: the flow closes on the committed lifetime', () => {
    patch({ souls: bn(5000) });
    store().beginKatabasis();
    render();
    expect(container!.querySelector('.katabasis-flow')).not.toBeNull();
    act(() => store().confirmKatabasis());
    expect(store().katabasisPhase).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
    // Nothing of the flow is left on screen: no recap, no Acknowledge.
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
    expect(container!.querySelector('.recap')).toBeNull();
    expect(container!.textContent).not.toMatch(/You Rise|Acknowledge/i);
  });

  /** Every Sin mastered, down among the Princes, with `souls` in hand. */
  function endState(souls: number): void {
    const devotion = { ...(store().state as GameState).devotion };
    for (const sin of SINS) devotion[sin] = bn(180 ** 4);
    patch({ devotion, inKatabasis: true, souls: bn(souls) });
    useGameStore.setState({ katabasisPhase: 'menu' });
  }

  it('the ended scene is the feeding screen: no statue opens, the Court sits under a red cloud', () => {
    endState(1000);
    render();
    // The Princes are only the painting now: no statue hotspot, no Prince to open.
    expect(container!.querySelectorAll('.statue').length).toBe(0);
    expect(container!.querySelector('.takeover')).toBeNull();
    // No title, no meter, no glow: the Court, the wash and the two drifting fields.
    expect(container!.querySelector('.hell--ended')).not.toBeNull();
    expect(container!.querySelector('.hell-caption')).toBeNull();
    expect(container!.querySelector('.end-glow')).toBeNull();
    expect(container!.querySelector('.tk-meter')).toBeNull();
    expect(container!.querySelectorAll('.cloud-fog').length).toBe(2);
    // Nothing poured yet: the cloud is at full density (wash 0.55, the Court blurred 9px).
    const wash = (): number =>
      Number(container!.querySelector<HTMLElement>('.cloud-wash')!.style.opacity);
    expect(wash()).toBeCloseTo(0.55, 5);
    expect(container!.querySelector<HTMLElement>('.bg-end')!.style.filter).toContain(
      'blur(9.00px)',
    );
    // The obelisk is the one target, and the HUD and the floor stay.
    expect(button('Offer souls')).not.toBeNull();
    expect(button('The Ninth')).toBeNull();
    expect(container!.querySelector('.kat-hud')).not.toBeNull();
    expect(container!.querySelector('.floor')).not.toBeNull();
    // A pour thins the cloud along the log curve.
    act(() => store().offerEternal(1000));
    expect(wash()).toBeLessThan(0.55);
    expect(wash()).toBeGreaterThan(0);
  });

  it('holding the obelisk pours souls through the hold ramp, and stops on release', () => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    try {
      endState(1000);
      render();
      const obelisk = button('Offer souls')!;
      act(() => {
        obelisk.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      // One step on press: the ramp's base of 8 souls, out of the pool into the Eternal.
      expect((store().state as GameState).eternalDevotion.toNumber()).toBe(8);
      expect((store().state as GameState).souls.toNumber()).toBe(992);
      act(() => {
        window.dispatchEvent(new Event('pointerup'));
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect((store().state as GameState).eternalDevotion.toNumber()).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an empty pool makes the hold do nothing', () => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    try {
      endState(0);
      render();
      act(() => {
        button('Offer souls')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect((store().state as GameState).eternalDevotion.toNumber()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pouring the threshold raises the Semet screen, whose Accept rises through Anabasis', () => {
    vi.useFakeTimers();
    try {
      endState(ETERNAL_SIN_THRESHOLD + 100);
      render();
      expect(container!.querySelector('.reveal-name')).toBeNull();
      // The pour crosses the threshold: the cloud is gone, and Semet is named over the Court.
      act(() => store().offerEternal(ETERNAL_SIN_THRESHOLD));
      expect(Number(container!.querySelector<HTMLElement>('.cloud-wash')!.style.opacity)).toBe(0);
      const semet = container!.querySelector('.takeover--semet');
      expect(semet?.querySelector('.reveal-name')?.textContent).toBe('Semet');
      expect(semet?.querySelector('.reveal-subtitle')?.textContent).toBe('Peccatum \u00C6ternum');
      // No more pouring, no floor: Accept is the one way out, and no verse is laid over it.
      expect(button('Offer souls')).toBeNull();
      expect(container!.querySelector('.floor')).toBeNull();
      expect(container!.textContent).not.toContain('Iam pridem');
      click('Accept');
      // Accept rises at once: the Anabasis, then the commit after its hold.
      expect(container!.querySelector('.transit')?.getAttribute('data-dir')).toBe('up');
      expect(container!.querySelector('.transit-word')?.textContent).toBe('Anabasis');
      expect(store().katabasisPhase).toBe('menu');
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS);
      });
      // The rise lands straight back in the room: no recap screen (ADR-043).
      expect(store().katabasisPhase).toBeNull();
      expect((store().state as GameState).inKatabasis).not.toBe(true);
      expect(container!.querySelector('.katabasis-flow')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a descent reopened after the naming resumes on the Semet screen', () => {
    endState(100);
    patch({ eternalDevotion: bn(ETERNAL_SIN_THRESHOLD) });
    render();
    expect(container!.querySelector('.takeover--semet .reveal-name')?.textContent).toBe('Semet');
    expect(button('Accept')).not.toBeNull();
    expect(container!.querySelector('.floor')).toBeNull();
  });

  it('openKatabasis opens the flow on the Ledger without tearing down the lifetime', () => {
    act(() => store().openKatabasis());
    render();
    expect(container!.querySelector('.ledger')).not.toBeNull();
    expect(container!.querySelector('.transit')).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
  });

  it('beginKatabasis (the committed descent) opens the flow on the Exstinctio transition', () => {
    act(() => store().beginKatabasis());
    render();
    expect((store().state as GameState).inKatabasis).toBe(true);
    const transit = container!.querySelector('.transit');
    expect(transit?.getAttribute('data-dir')).toBe('down');
    expect(transit?.classList.contains('transit--exstinctio')).toBe(true);
    expect(container!.querySelector('.transit-word')?.textContent).toBe('Katabasis');
    expect(container!.querySelector('.ledger')).toBeNull();
    // It opens on the room (its canvas) under the armed seal the player just pressed, inert.
    expect(transit?.querySelector('canvas.exst-canvas')).not.toBeNull();
    const seal = transit?.querySelector('.exst-seal');
    expect(seal?.getAttribute('aria-hidden')).toBe('true');
    expect(seal?.querySelector('.altar-sigil-btn.is-armed')).not.toBeNull();
    expect(seal?.querySelector('img')?.getAttribute('src')).toMatch(/seal-panvitium\.png$/);
    expect(transit?.querySelector('.exst-scrim')).toBeNull();
  });

  it('the descent reads Katabasis over "exspes in ima": no closing sentence, nothing to skip', () => {
    act(() => store().beginKatabasis());
    render();
    const transit = container!.querySelector('.transit')!;
    expect(transit.querySelector('.transit-stack .transit-word')?.textContent).toBe('Katabasis');
    expect(transit.querySelector('.transit-stack .transit-rule')).not.toBeNull();
    expect(transit.querySelector('.transit-stack .transit-sub')?.textContent).toBe('exspes in ima');
    // The long italic line and "Click anywhere to continue" are gone; no control of any kind.
    expect(transit.textContent).not.toMatch(/altar|continue/i);
    expect(transit.querySelector('.transit-skip')).toBeNull();
    expect(transit.querySelectorAll('button').length).toBe(0);
  });

  it('holds the descent for exactly 5 s; a click or a re-render neither skips nor restarts it', () => {
    vi.useFakeTimers();
    try {
      act(() => store().beginKatabasis());
      render();
      const transit = (): HTMLElement | null => container!.querySelector('.transit');
      act(() => transit()!.click());
      act(() => (container!.querySelector('.transit-word') as HTMLElement).click());
      expect(transit()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      // A fresh state object re-renders the flow (a new `onDone`): the hold keeps its place.
      act(() => patch({}));
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS - 3000 - 1);
      });
      expect(transit()?.getAttribute('data-dir')).toBe('down');
      expect(container!.querySelector('.statue-field')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(transit()).toBeNull();
      expect(container!.querySelector('.statue-field')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the hell floor names where each way leads: the sealed Demons, Anabasis, the Princes', () => {
    vi.useFakeTimers();
    try {
      act(() => store().beginKatabasis());
      render();
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS);
      });
      const sub = (sel: string): string =>
        (container!.querySelector(`${sel} .floor-sub`)?.textContent ?? '').replace(/^\W+/, '');
      // Among the Princes: down to the seals, or up and out.
      expect(sub('.floor-crawl')).toBe('to the sealed Demons');
      expect(sub('.floor-rise')).toBe('Anabasis');
      // Among the seals: the one way back.
      click(/^Crawl back/);
      expect(container!.querySelector('.floor-crawl')).toBeNull();
      expect(sub('.floor--single')).toBe('to the Princes');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rises through Anabasis over "Auctus ex imis", committing after exactly 5 s, unskippable', () => {
    vi.useFakeTimers();
    try {
      act(() => store().beginKatabasis());
      render();
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS);
      });
      click(/^Fall upwards/);
      // Armed, the rise reads as before (only its glow changes); the second press rises.
      expect(container!.querySelector('.floor-rise.is-armed')).not.toBeNull();
      expect(container!.querySelector('.floor-rise .floor-lead')?.textContent).toBe('Fall upwards');
      expect(container!.querySelector('.floor-rise .floor-sub')?.textContent).toMatch(/Anabasis$/);
      expect(container!.textContent).not.toMatch(/Let go your grip|press again/i);
      click(/^Fall upwards/);
      const transit = (): HTMLElement | null => container!.querySelector('.transit');
      expect(transit()?.getAttribute('data-dir')).toBe('up');
      expect(container!.querySelector('.transit-word')?.textContent).toBe('Anabasis');
      expect(container!.querySelector('.transit-sub')?.textContent).toBe('Auctus ex imis');
      expect(transit()!.textContent).not.toMatch(/Ascensus|light you betrayed|continue/i);
      expect(transit()!.querySelectorAll('button').length).toBe(0);
      // The light comes back into the room: no seal on the way up, a scrim under the type.
      expect(transit()!.querySelector('canvas.exst-canvas')).not.toBeNull();
      expect(transit()!.querySelector('.exst-seal')).toBeNull();
      expect(transit()!.querySelector('.exst-scrim')).not.toBeNull();
      act(() => transit()!.click());
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS - 1);
      });
      // Still on the way up: the lifetime is not yet committed.
      expect(store().katabasisPhase).toBe('menu');
      expect((store().state as GameState).inKatabasis).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      // The rise lands straight back in the room: no recap screen (ADR-043).
      expect(store().katabasisPhase).toBeNull();
      expect((store().state as GameState).inKatabasis).not.toBe(true);
      expect(container!.querySelector('.katabasis-flow')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The score's fade is timed against the clock and stepped by animation frames: fake both.
  const fakeClock = (): void => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
  };

  it('the ambient score rises across the whole descent and falls across the whole Anabasis', () => {
    fakeClock();
    const pause = vi.spyOn(window.HTMLMediaElement.prototype, 'pause');
    try {
      act(() => store().beginKatabasis());
      render();
      const score = (): HTMLAudioElement => container!.querySelector('audio')!;
      // The commit: the score starts from silence, not at the element's default full volume.
      expect(score().volume).toBe(0);
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS / 2);
      });
      // Halfway down it is rising, not yet half there.
      expect(score().volume).toBeGreaterThan(0);
      expect(score().volume).toBeLessThan(KATABASIS_MUSIC_VOLUME / 2);
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS / 2 - 1);
      });
      // Nearly down, nearly full...
      expect(container!.querySelector('.transit')).not.toBeNull();
      expect(score().volume).toBeGreaterThan(KATABASIS_MUSIC_VOLUME * 0.99);
      expect(score().volume).toBeLessThan(KATABASIS_MUSIC_VOLUME);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      // ...and fully there the moment the Princes appear.
      expect(container!.querySelector('.statue-field')).not.toBeNull();
      expect(score().volume).toBe(KATABASIS_MUSIC_VOLUME);
      // Anabasis: from full at the rise...
      click(/^Fall upwards/);
      click(/^Fall upwards/);
      expect(container!.querySelector('.transit')?.getAttribute('data-dir')).toBe('up');
      expect(score().volume).toBe(KATABASIS_MUSIC_VOLUME);
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS / 2);
      });
      // ...falling, halfway up already more than half gone...
      expect(score().volume).toBeGreaterThan(0);
      expect(score().volume).toBeLessThan(KATABASIS_MUSIC_VOLUME / 2);
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS / 2 - 1);
      });
      // ...all but silent as the room returns...
      expect(store().katabasisPhase).toBe('menu');
      expect(score().volume).toBeLessThan(KATABASIS_MUSIC_VOLUME * 0.001);
      pause.mockClear();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      // ...and stopped with the flow.
      expect(container!.querySelector('.katabasis-flow')).toBeNull();
      expect(pause).toHaveBeenCalled();
    } finally {
      pause.mockRestore();
      vi.useRealTimers();
    }
  });

  it('a descent reopened from a save brings the score up from silence on the Princes', () => {
    fakeClock();
    try {
      patch({ inKatabasis: true });
      useGameStore.setState({ katabasisPhase: 'menu', katabasisEntry: null });
      render();
      const score = (): HTMLAudioElement => container!.querySelector('audio')!;
      expect(container!.querySelector('.statue-field')).not.toBeNull();
      expect(score().volume).toBe(0);
      act(() => {
        vi.advanceTimersByTime(SCORE_RESUME_MS / 2);
      });
      expect(score().volume).toBeGreaterThan(0);
      expect(score().volume).toBeLessThan(KATABASIS_MUSIC_VOLUME);
      // One animation frame past the fade, it has landed.
      act(() => {
        vi.advanceTimersByTime(SCORE_RESUME_MS / 2 + 16);
      });
      expect(score().volume).toBe(KATABASIS_MUSIC_VOLUME);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the Ledger is silent', () => {
    act(() => store().openKatabasis());
    render();
    expect(container!.querySelector('.ledger-title')).not.toBeNull();
    expect(container!.querySelector('audio')!.volume).toBe(0);
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
    // The effect keeps its direction arrow (Bael #1, "Opera negative outcomes \u2193").
    expect(unbound[0]!.querySelector('.ls-effect')?.textContent).toBe(
      'Opera negative outcomes \u2193',
    );
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
    // The effect text keeps its direction arrow, with the live magnitude beside it\u2026
    const effect = sig!.querySelector('.ls-effect')?.textContent ?? '';
    expect(effect).toContain('Indagatio positive outcomes \u2191 +');
    expect(effect).toContain('%'); // current effect magnitude
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

describe('The Princes speak (the carved inscription, no menu)', () => {
  /** Land among the Princes, mid-descent, with the given state patched in. */
  function princes(part: Partial<GameState> = {}): void {
    patch({ inKatabasis: true, ...part });
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
  }
  const statue = (sin: Sin): HTMLButtonElement =>
    container!.querySelectorAll<HTMLButtonElement>('.statue')[SINS.indexOf(sin)]!;
  const inscription = (): HTMLElement | null =>
    container!.querySelector<HTMLElement>('.inscription');
  const devotion = (sin: Sin): number => (store().state as GameState).devotion[sin].toNumber();
  const withRaf = (run: () => void): void => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      run();
    } finally {
      vi.useRealTimers();
    }
  };

  it('a statue raises no menu: the dark closes in around him and his words are cut into it', () => {
    princes();
    expect(inscription()).toBeNull();
    act(() => statue('gula').click());
    // No panel, no scrim, no close button, no hold button: the scene stays, the floor stays.
    expect(container!.querySelector('.takeover')).toBeNull();
    expect(container!.querySelector('.hold-btn')).toBeNull();
    expect(container!.querySelector('.floor')).not.toBeNull();
    expect(container!.querySelector('.kat-hud')).not.toBeNull();
    // The dark closes in around him: clear over his statue, black beyond. He keeps no light of his
    // own; only a strike lights him.
    const dark = container!.querySelector<HTMLElement>('.kat-darkness');
    expect(dark).not.toBeNull();
    expect(dark!.style.backgroundImage).toBe(princeDarkness('gula'));
    expect(princeDarkness('gula')).toMatch(/^radial-gradient\(ellipse .* at 8\.3% 58%,/);
    expect(princeDarkness('gula')).toContain('transparent 36%');
    expect(princeDarkness('gula')).toMatch(/#000 100%\)$/);
    expect(container!.querySelector('.bg-lit')).toBeNull();
    expect(statue('gula').getAttribute('aria-pressed')).toBe('true');
    // Carved: Roman capitals with V for U, the epithet parted by interpuncts.
    const text = inscription()!.textContent ?? '';
    expect(inscription()!.dataset.sin).toBe('gula');
    expect(text).toContain('LORD · OF · THE · FLIES');
    expect(text).toContain('BEELZEBVB');
    expect(text).toContain('GVLA');
    expect(text).toContain('Rank 0 of IV');
    // Every effect line keeps its numbers; the live intensity sits beside the skill.
    expect(text).toContain('Insatiability');
    expect(text).toContain('intensity 0.00');
    expect(text).toContain('Multiplies your action efficiency by 1 + intensity.');
    expect(text).toContain('Each level removes 20% of the Bad, Terrible and Apocalyptic');
    expect(text).toContain('of 180 Devotion toward Rank I');
    // No English sin name and no instructions: the statue is the only verb.
    expect(text).not.toContain('Gluttony');
    expect(text).not.toMatch(/hold|pour|permanent|taking it back/i);
  });

  it('cuts each Prince’s words on the side of him with more room', () => {
    princes();
    for (const sin of SINS) {
      act(() => statue(sin).click());
      const info = strings.sins[sin];
      expect(inscription()!.dataset.sin).toBe(sin);
      expect(inscription()!.classList.contains(`inscription--${inscriptionSide(sin)}`)).toBe(true);
      expect(inscription()!.textContent).toContain(inscribe(info.prince));
      expect(inscription()!.textContent).toContain(inscribe(info.latin));
      expect(inscription()!.textContent).not.toContain(info.english);
    }
    // The four on the left of the Court speak to their right; the four on the right, to their left.
    expect(SINS.map(inscriptionSide)).toEqual([
      'right',
      'right',
      'right',
      'right',
      'left',
      'left',
      'left',
      'left',
    ]);
  });

  it('carves the names as Roman capitals', () => {
    expect(inscribe('Beelzebub')).toBe('BEELZEBVB');
    expect(inscribe('Luxuria')).toBe('LVXVRIA');
    expect(interpunct('King of the Nine Hells')).toBe('KING · OF · THE · NINE · HELLS');
  });

  it('the first click only speaks; holding the chosen statue pours, and stops on release', () => {
    withRaf(() => {
      princes({ souls: bn(1000) });
      act(() => statue('gula').click());
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(devotion('gula')).toBe(0);
      // A press on him pours: one step at once, the ramp's base of 8 souls.
      act(() => {
        statue('gula').dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(devotion('gula')).toBe(8);
      expect((store().state as GameState).souls.toNumber()).toBe(992);
      expect(container!.querySelector('.ins-dev.is-pour')).not.toBeNull();
      act(() => {
        window.dispatchEvent(new Event('pointerup'));
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(devotion('gula')).toBe(8);
      expect(container!.querySelector('.ins-dev.is-pour')).toBeNull();
      // A press on another Prince only turns to him; nothing pours until he is chosen.
      act(() => {
        statue('luxuria').dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(devotion('luxuria')).toBe(0);
    });
  });

  it('a mastered Prince is sated and takes no more', () => {
    withRaf(() => {
      const s = store().state as GameState;
      princes({ souls: bn(1000), devotion: { ...s.devotion, gula: bn(180 ** 4) } });
      act(() => statue('gula').click());
      expect(inscription()!.textContent).toContain('Mastered');
      expect(inscription()!.textContent).toContain(
        'It is sated. The rank is yours, and cannot be unmade.',
      );
      act(() => {
        statue('gula').dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(devotion('gula')).toBe(180 ** 4);
      expect((store().state as GameState).souls.toNumber()).toBe(1000);
    });
  });

  it('the storm rages on while a Prince speaks: the lightning keeps striking', () => {
    vi.useFakeTimers();
    try {
      princes();
      act(() => statue('gula').click());
      // Mark the three strike frames, then let the storm run: a strike rewrites a frame's fade.
      const frames = Array.from(container!.querySelectorAll<HTMLElement>('.bg-strike'));
      expect(frames.length).toBe(3);
      for (const f of frames) f.style.transition = 'marked';
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(inscription()).not.toBeNull();
      expect(frames.some((f) => f.style.transition.includes('cubic-bezier'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('turning away, by a click off the statue or Escape, lets the words go and the dark lift', () => {
    princes();
    act(() => statue('ira').click());
    expect(inscription()).not.toBeNull();
    click('Turn away');
    expect(inscription()).toBeNull();
    expect(container!.querySelector('.kat-darkness')).toBeNull();
    act(() => statue('ira').click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(inscription()).toBeNull();
    expect(button('Turn away')).toBeNull();
  });
});

describe('The altar sigil (the Katabasis trigger in the Altar Room)', () => {
  // The whole app, as the player meets it: the Altar Room with its hotspots, the sigil overlay, and
  // the Katabasis flow above them.
  const room = (): Element | null => container!.querySelector('[aria-label="The Altar Room"]');
  const sigilLayer = (): Element | null => container!.querySelector('.altar-sigil');
  const seal = (): HTMLButtonElement | null =>
    container!.querySelector<HTMLButtonElement>('.altar-sigil-btn');

  it('raises the sigil and STATUS QUO over the room when the altar is clicked', () => {
    render(App);
    expect(room()).not.toBeNull();
    expect(sigilLayer()).toBeNull();
    expect(scene.last?.glows ?? null).toBeNull();
    click('The Altar');
    // The room stays: no full-screen flow, just the overlay over it.
    expect(room()).not.toBeNull();
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
    expect(button('Press the sigil')).not.toBeNull();
    expect(button('Status Quo')).not.toBeNull();
    // The seal is a crisp DOM image in the overlay, outside the room's degradation pass…
    const glyph = seal()?.querySelector('img.altar-sigil-glyph');
    expect(glyph?.getAttribute('src')).toBe('/assets/panvitium/katabasis/seal-panvitium.png');
    expect(glyph?.getAttribute('alt')).toBe('');
    expect(seal()?.classList.contains('is-armed')).toBe(false);
    expect(scene.last).not.toHaveProperty('sigil');
    // …while the light it and STATUS QUO cast goes THROUGH the pass: the room hands the pass a
    // glow source, sampling the hidden anchors the overlay lays out.
    expect(typeof scene.last?.glows).toBe('function');
    for (const anchor of ['.altar-sigil-aura', '.altar-sq-bloom', '.altar-sq-line']) {
      expect(sigilLayer()?.querySelector(anchor)).not.toBeNull();
    }
    expect(store().katabasisPhase).toBeNull(); // nothing opened, nothing torn down
  });

  it('arms on the first press, hiding STATUS QUO, and commits the descent on the second', () => {
    // Souls in hand (no empty-handed warning), the first-descent cinematic already seen.
    patch({ souls: bn(1), firstDescentSeen: true });
    render(App);
    click('The Altar');
    click('Press the sigil');
    expect(button('Status Quo')).toBeNull();
    expect(button(/there is no return/)).toBe(seal());
    expect(seal()?.classList.contains('is-armed')).toBe(true);
    expect((store().state as GameState).inKatabasis).not.toBe(true); // still safe to walk away
    click(/there is no return/);
    // Committed: the teardown + freeze, and the flow falls straight into the Exstinctio descent.
    expect((store().state as GameState).inKatabasis).toBe(true);
    expect(store().katabasisPhase).toBe('menu');
    expect(container!.querySelector('.transit-word')?.textContent).toBe('Katabasis');
    expect(container!.querySelector('.first-descent')).toBeNull();
    expect(sigilLayer()).toBeNull();
    expect(scene.last?.glows ?? null).toBeNull();
  });

  it('lands among the Princes once the descent transition has played', () => {
    vi.useFakeTimers();
    try {
      patch({ souls: bn(1), firstDescentSeen: true });
      render(App);
      click('The Altar');
      click('Press the sigil');
      click(/there is no return/);
      act(() => {
        vi.advanceTimersByTime(TRANSIT_HOLD_MS);
      });
      expect(container!.querySelector('.statue-field')).not.toBeNull();
      expect(container!.querySelectorAll('.statue').length).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the first soulless descent with the empty-handed warning, unskippable, then the room', () => {
    vi.useFakeTimers();
    try {
      patch({ souls: bn(0) });
      render(App);
      click('The Altar');
      click('Press the sigil');
      click(/there is no return/);
      // No descent: nothing torn down, no flow; the sigil is down and the warning has the screen.
      const warning = (): HTMLElement | null => container!.querySelector('.empty-handed');
      expect((store().state as GameState).inKatabasis).not.toBe(true);
      expect(store().katabasisPhase).toBeNull();
      expect(container!.querySelector('.katabasis-flow')).toBeNull();
      expect(sigilLayer()).toBeNull();
      expect(warning()?.textContent).toBe('I should not descend empty-handed.');
      expect((store().state as GameState).emptyHandedWarned).toBe(true);
      // A stopped commit never descended: the first-descent cinematic is still to come.
      expect(container!.querySelector('.first-descent')).toBeNull();
      expect((store().state as GameState).firstDescentSeen).toBeUndefined();
      // Clicks do not skip it.
      act(() => warning()!.click());
      act(() => {
        vi.advanceTimersByTime(EMPTY_HANDED_TOTAL_MS - 1);
      });
      expect(warning()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      // Back in the Altar Room, the sigil down; the altar raises it again, disarmed.
      expect(warning()).toBeNull();
      expect(room()).not.toBeNull();
      expect(sigilLayer()).toBeNull();
      click('The Altar');
      expect(seal()?.classList.contains('is-armed')).toBe(false);
      // The second soulless commit descends, through the first-descent cinematic.
      click('Press the sigil');
      click(/there is no return/);
      expect(warning()).toBeNull();
      expect(container!.querySelector('.first-descent')).not.toBeNull();
      expect((store().state as GameState).firstDescentSeen).toBe(true);
      act(() => {
        vi.advanceTimersByTime(FIRST_DESCENT_TRANSIT_MS);
      });
      expect((store().state as GameState).inKatabasis).toBe(true);
      expect(store().katabasisPhase).toBe('menu');
    } finally {
      vi.useRealTimers();
    }
  });

  it('descends at once with souls in hand, leaving the warning unplayed', () => {
    patch({ souls: bn(5), firstDescentSeen: true });
    render(App);
    click('The Altar');
    click('Press the sigil');
    click(/there is no return/);
    expect(container!.querySelector('.empty-handed')).toBeNull();
    expect((store().state as GameState).inKatabasis).toBe(true);
    expect((store().state as GameState).emptyHandedWarned).toBeUndefined();
  });

  it('plays the first-descent cinematic on the first real commit, unskippable, then the descent', () => {
    vi.useFakeTimers();
    try {
      patch({ souls: bn(5) });
      render(App);
      click('The Altar');
      click('Press the sigil');
      click(/there is no return/);
      // The flag is recorded at the commit; nothing is torn down until the hand-off.
      const cinematic = (): HTMLElement | null => container!.querySelector('.first-descent');
      expect(cinematic()).not.toBeNull();
      expect(container!.querySelector('.empty-handed')).toBeNull();
      expect((store().state as GameState).firstDescentSeen).toBe(true);
      expect((store().state as GameState).emptyHandedWarned).toBeUndefined();
      expect((store().state as GameState).inKatabasis).not.toBe(true);
      expect(store().katabasisPhase).toBeNull();
      expect(sigilLayer()).toBeNull();
      // Clicks and keys do not skip it, and nothing beneath answers them.
      act(() => cinematic()!.click());
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      });
      act(() => {
        vi.advanceTimersByTime(FIRST_DESCENT_TRANSIT_MS - 1);
      });
      expect((store().state as GameState).inKatabasis).not.toBe(true);
      expect(container!.querySelector('.transit')).toBeNull();
      // The hand-off, late in the fall: the descent begins under the still-lifting overlay.
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect((store().state as GameState).inKatabasis).toBe(true);
      expect(store().katabasisPhase).toBe('menu');
      expect(container!.querySelector('.transit-word')?.textContent).toBe('Katabasis');
      // The cinematic has already shown the soul leave: the transit opens on the void, the type
      // alone (no room to put out, no seal).
      expect(container!.querySelector('.exst-canvas')).toBeNull();
      expect(container!.querySelector('.exst-seal')).toBeNull();
      expect(cinematic()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(FIRST_DESCENT_TOTAL_MS - FIRST_DESCENT_TRANSIT_MS - 1);
      });
      expect(cinematic()).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      // Lifted: the transit holds its own 5 s from the hand-off, then the Princes.
      expect(cinematic()).toBeNull();
      expect(store().firstDescentPlaying).toBe(false);
      expect(container!.querySelector('.transit')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(
          TRANSIT_HOLD_MS - (FIRST_DESCENT_TOTAL_MS - FIRST_DESCENT_TRANSIT_MS),
        );
      });
      expect(container!.querySelectorAll('.statue').length).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bakes the cinematic as the sigil rises; a commit keeps the art, walking away lets it go', () => {
    vi.useFakeTimers();
    try {
      patch({ souls: bn(5) });
      render(App);
      expect(scene.decodes).toBe(0);
      // The sigil rises with the cinematic next: both plates start decoding (then the bake).
      click('The Altar');
      expect(scene.decodes).toBe(2);
      click('The Altar'); // a second click only restarts the sigil's wait
      expect(scene.decodes).toBe(2);
      // Left alone, the sigil goes down and lets the art go; raised again, it primes afresh.
      act(() => {
        vi.advanceTimersByTime(ALTAR_SIGIL_IDLE_MS);
      });
      act(() => {
        vi.advanceTimersByTime(ALTAR_SIGIL_FADE_MS);
      });
      expect(sigilLayer()).toBeNull();
      click('The Altar');
      expect(scene.decodes).toBe(4);
      // Committed: the cinematic plays on the art already under way, nothing primed anew.
      click('Press the sigil');
      click(/there is no return/);
      expect(container!.querySelector('.first-descent')).not.toBeNull();
      expect(scene.decodes).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('primes nothing while the empty-handed warning is next in line', () => {
    patch({ souls: bn(0) });
    render(App);
    click('The Altar');
    expect(scene.decodes).toBe(0);
  });

  it('plays the cinematic once: the next descent goes straight into the Exstinctio transit', () => {
    vi.useFakeTimers();
    try {
      patch({ souls: bn(5) });
      render(App);
      click('The Altar');
      click('Press the sigil');
      click(/there is no return/);
      act(() => {
        vi.advanceTimersByTime(FIRST_DESCENT_TOTAL_MS);
      });
      // Rise into the next lifetime, straight back in the Altar Room.
      act(() => store().confirmKatabasis());
      expect((store().state as GameState).katabasisCount).toBe(1);
      patch({ souls: bn(5) });
      click('The Altar');
      click('Press the sigil');
      click(/there is no return/);
      expect(container!.querySelector('.first-descent')).toBeNull();
      expect((store().state as GameState).inKatabasis).toBe(true);
      expect(container!.querySelector('.transit-word')?.textContent).toBe('Katabasis');
      // No cinematic this time: the transit opens on the room and the armed seal.
      expect(container!.querySelector('.exst-canvas')).not.toBeNull();
      expect(container!.querySelector('.exst-seal')).not.toBeNull();
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
      expect(sigilLayer()?.contains(seal()!)).toBe(true); // the seal fades with the layer
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(sigilLayer()).toBeNull();
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
      expect(seal()?.classList.contains('is-armed')).toBe(true);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(sigilLayer()).toBeNull();
      expect((store().state as GameState).inKatabasis).not.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a door puts the sigil away at once', () => {
    render(App);
    click('The Altar');
    click('Press the sigil');
    click('To the Studio');
    expect(sigilLayer()).toBeNull(); // no fade
    expect(scene.last?.glows ?? null).toBeNull(); // nor any glow left in the room
    expect(container!.querySelector('[aria-label="The Studio"]')).not.toBeNull();
    click('To the Altar');
    expect(sigilLayer()).toBeNull();
  });
});

describe('boonLabel (ledger label)', () => {
  const UP = '\u2191';
  const DOWN = '\u2193';

  it('keeps a single-effect seal\u2019s direction arrow', () => {
    expect(boonLabel(`Gold gain ${UP}`)).toBe(`Gold gain ${UP}`);
    expect(boonLabel(`Opera negative outcomes ${DOWN}`)).toBe(`Opera negative outcomes ${DOWN}`);
  });

  it('drops only a trailing (flat) qualifier, keeping the arrow', () => {
    expect(boonLabel(`Murder rate ${UP} (flat)`)).toBe(`Murder rate ${UP}`);
  });

  it('keeps EVERY arrow of a composite label', () => {
    // Andrealphus #65: two legs, one arrow each.
    expect(boonLabel(`Invocation costs ${DOWN}, Desidia speed ${UP}`)).toBe(
      `Invocation costs ${DOWN}, Desidia speed ${UP}`,
    );
  });

  it('leaves a dormant seal\u2019s line as written', () => {
    const dormant = 'Dormant: this seal grants no effect while bound.';
    expect(boonLabel(dormant)).toBe(dormant);
  });
});
