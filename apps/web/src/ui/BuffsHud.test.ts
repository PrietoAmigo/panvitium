/**
 * Render tests for the temporary-buffs HUD (Claude Design handoff, board 2a). The relic sprite is a
 * Canvas2D paint (no jsdom surface to assert), so these pin the wiring the HUD owns: nothing while no
 * buff runs, one ring per source in order, the countdown fill and short time, the art-or-glyph
 * middle, and the details card on hover or focus (one at a time, gone with its ring). The ordering,
 * grouping and copy themselves are pinned in game/buffs.test.ts; visibility is owned by App.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { applyCallEffects, type GameState } from '@panvitium/sim';
import { CALL_IN_BY_ID } from '../menus/calls-in.data.js';
import { useGameStore } from '../store/gameStore.js';
import { BuffsHud } from './BuffsHud.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function current(): GameState {
  return useGameStore.getState().state as GameState;
}

function setMaleficiaBuffs(buffs: Record<string, number>): void {
  const s = current();
  act(() => {
    useGameStore.setState({ state: { ...s, lifetime: { ...s.lifetime, maleficiaBuffs: buffs } } });
  });
}

/** Take a call's first option, exactly as the store's `answerCall` does. */
function answerCall(id: string): void {
  const effects = CALL_IN_BY_ID[id]?.choices[0]?.effects ?? [];
  act(() => {
    useGameStore.setState({ state: applyCallEffects(current(), effects, id) });
  });
}

function render(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(BuffsHud));
  });
}

function tiles(): HTMLElement[] {
  return [...container!.querySelectorAll<HTMLElement>('.buffs-hud-tile')];
}

function ring(i: number): HTMLButtonElement {
  return tiles()[i]!.querySelector('.buffs-hud-ring') as HTMLButtonElement;
}

function card(): HTMLElement | null {
  return container!.querySelector('.buffs-hud-card');
}

/** React synthesises mouseenter / mouseleave from mouseover / mouseout and their relatedTarget. */
function hover(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  });
}

function unhover(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  });
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false, katabasisPhase: null });
  useGameStore.getState().init();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

describe('Buffs HUD', () => {
  it('renders nothing while no buff runs', () => {
    render();
    expect(container!.querySelector('.buffs-hud')).toBeNull();
  });

  it('renders nothing when there is no game state', () => {
    useGameStore.setState({ state: null });
    render();
    expect(container!.querySelector('.buffs-hud')).toBeNull();
  });

  it('shows a labelled ring per source, maleficia first, the rest as they run out', () => {
    render();
    setMaleficiaBuffs({ black_salt_pouch: 2537, defixio: 1084 });
    answerCall('social-platform');
    const group = container!.querySelector('.buffs-hud');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Temporary buffs');
    expect(tiles().map((t) => t.className)).toEqual([
      'buffs-hud-tile buffs-hud-tile--maleficium',
      'buffs-hud-tile buffs-hud-tile--maleficium',
      'buffs-hud-tile buffs-hud-tile--call',
    ]);
    expect(ring(0).getAttribute('aria-label')).toBe('Defixio, +50% suicide rate, 18m remaining');
    expect(ring(2).getAttribute('aria-label')).toBe(
      'Social Platform, Influence regeneration doubles, Reprobate generation halves, 1h 0m remaining',
    );
  });

  it('drains each ring with its timer and counts it down beneath', () => {
    setMaleficiaBuffs({ defixio: 1800 });
    render();
    expect(ring(0).style.getPropertyValue('--buff-fill')).toBe('50.00%');
    expect(tiles()[0]!.querySelector('.buffs-hud-time')?.textContent).toBe('30m');
    setMaleficiaBuffs({ defixio: 37.4 });
    expect(ring(0).style.getPropertyValue('--buff-fill')).toBe('1.04%');
    expect(tiles()[0]!.querySelector('.buffs-hud-time')?.textContent).toBe('37s');
  });

  it('pixelates the relic art where there is some, and shows the magnitude where there is none', () => {
    setMaleficiaBuffs({ defixio: 1800, hand_of_glory: 3600 });
    answerCall('the-shipment');
    render();
    expect(tiles()[0]!.querySelector('.buffs-hud-art canvas')).not.toBeNull(); // Defixio
    expect(tiles()[1]!.querySelector('.buffs-hud-glyph')?.textContent).toBe('+33%'); // Hand of Glory
    expect(tiles()[2]!.querySelector('.buffs-hud-glyph')?.textContent).toBe('×2'); // the call
  });

  it('opens the details card on hover and closes it the moment the pointer leaves', () => {
    render();
    answerCall('social-platform');
    expect(card()).toBeNull(); // nothing shows by default
    hover(tiles()[0]!);
    expect(card()?.querySelector('.buffs-hud-card-name')?.textContent).toBe('Social Platform');
    expect(card()?.querySelector('.buffs-hud-card-kind')?.textContent).toBe('Call · Mai');
    const effects = [...card()!.querySelectorAll('.buffs-hud-card-effect')];
    expect(effects.map((e) => e.textContent)).toEqual([
      'Influence regeneration doubles',
      'Reprobate generation halves',
    ]);
    expect(effects.map((e) => e.classList.contains('is-debuff'))).toEqual([false, true]);
    expect(card()?.querySelector('.buffs-hud-card-time')?.textContent).toBe('1h 0m 0s remaining');
    unhover(tiles()[0]!);
    expect(card()).toBeNull();
  });

  it('keeps one card open at a time', () => {
    setMaleficiaBuffs({ defixio: 1800, black_salt_pouch: 900 });
    render();
    hover(tiles()[0]!);
    hover(tiles()[1]!);
    expect(container!.querySelectorAll('.buffs-hud-card')).toHaveLength(1);
    expect(card()?.querySelector('.buffs-hud-card-name')?.textContent).toBe('Defixio');
  });

  it('opens the card for a keyboard focus too', () => {
    setMaleficiaBuffs({ crossroads_dirt: 411 });
    render();
    act(() => ring(0).focus());
    expect(card()?.querySelector('.buffs-hud-card-effect')?.textContent).toBe(
      '−15% Indagatio time',
    );
    act(() => ring(0).blur());
    expect(card()).toBeNull();
  });

  it('drops the ring on expiry, and its card does not spring back when the source returns', () => {
    setMaleficiaBuffs({ defixio: 1800 });
    render();
    hover(tiles()[0]!);
    expect(card()).not.toBeNull();
    setMaleficiaBuffs({}); // ran out under the pointer
    expect(container!.querySelector('.buffs-hud')).toBeNull();
    setMaleficiaBuffs({ defixio: 3600 }); // used again
    expect(tiles()).toHaveLength(1);
    expect(card()).toBeNull();
  });
});
