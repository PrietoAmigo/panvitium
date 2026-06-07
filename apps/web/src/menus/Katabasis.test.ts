/**
 * Render smoke tests for the reworked cinematic Katabasis flow (Claude Design handoff). These pin
 * the wiring the visual rework introduced: the descent opens on the full-screen Altar commit gate,
 * the gate arms on the first press, the recap reads "You Rise" off the committed state, and the
 * Eternal-Sin reveal overlays the still-mounted flow (so closing it preserves the player's place).
 * The store actions and sim math themselves are covered by their own suites.
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

describe('Katabasis flow — orchestrator', () => {
  it('renders nothing when idle (no phase, no reveal)', () => {
    render();
    expect(container!.querySelector('.katabasis-flow')).toBeNull();
  });

  it('opens the descent on the full-screen Altar commit gate', () => {
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
    expect(container!.querySelector('.altar-kicker')?.textContent).toBe('The Altar Room');
    expect(container!.querySelector('.altar-title')?.textContent).toBe('Katabasis');
    expect(container!.querySelector('.descend-cta')).not.toBeNull();
    // Not yet armed.
    expect(container!.querySelector('.descend-cta--armed')).toBeNull();
  });

  it('arms the Altar CTA on the first press (two-press commit)', () => {
    useGameStore.setState({ katabasisPhase: 'menu' });
    render();
    const cta = container!.querySelector<HTMLButtonElement>('.descend-cta')!;
    act(() => cta.click());
    expect(container!.querySelector('.descend-cta--armed')).not.toBeNull();
    expect(container!.querySelector('.descend-cta')?.textContent).toContain('there is no return');
  });

  it('renders the "You Rise" recap off the committed state, with ranks held', () => {
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
    const ranksRow = rows.find((t) => t.includes('Ranks held across the eight'));
    expect(ranksRow).toContain('1 / 32');
    expect(rows.some((t) => t.includes('Souls carried up'))).toBe(true);
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
    expect((store().state as GameState).inKatabasis).not.toBe(true);
    // The standing readout (folded-in ledger) shows the eight Princes + the seal tally.
    expect(container!.querySelectorAll('.altar-prince').length).toBe(8);
    expect(container!.querySelector('.altar-standing-seals')?.textContent).toContain(
      'No seals bound',
    );
  });

  it('turning away at the gate returns to the room cleanly (no teardown)', () => {
    act(() => store().openKatabasis());
    render();
    const back = container!.querySelector<HTMLButtonElement>('.altar-turn-away')!;
    act(() => back.click());
    expect(store().katabasisPhase).toBeNull();
    expect((store().state as GameState).inKatabasis).not.toBe(true);
  });

  it('committing at the gate enters Katabasis (teardown) and falls into the descent', () => {
    act(() => store().openKatabasis());
    render();
    const cta = container!.querySelector<HTMLButtonElement>('.descend-cta')!;
    act(() => cta.click()); // arm
    act(() => cta.click()); // commit
    expect((store().state as GameState).inKatabasis).toBe(true);
    expect(container!.querySelector('.transit')).not.toBeNull(); // the Abyss descent transition
  });
});
