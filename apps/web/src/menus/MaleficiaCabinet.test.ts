/**
 * Render tests for the Loculi "Reliquary" (Claude Design, "Loculi Reliquary" handoff, option 2a).
 * These pin the wiring the visual swap relies on: the overlay is a labelled dialog with a Close (and
 * Esc) route out; the procession holds one relic per item ordered anathema → common; the rarest is on
 * stage by default, or the relic the Unveiling last showed; the procession, the ‹ › arrows and the
 * ← → keys browse (wrapping); the effect is set as a headline number; a consumable's rite fires
 * `onUse`; a relic that vanishes hands the stage to its neighbour; and the empty Loculi keeps its
 * "Mundane." line. The pixel canvases have no jsdom surface (getContext is stubbed to null); the
 * pixel rules are pinned in pixelArt.test.ts, and the adapter in game/maleficia.test.ts.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { MaleficiaCabinet, type RelicFocus } from './MaleficiaCabinet.js';
import type { Maleficium } from './types.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

interface Props {
  items: Maleficium[];
  onUse?: (id: string) => void;
  onClose?: () => void;
  focus?: RelicFocus | null;
}

function props(p: Props) {
  return {
    items: p.items,
    onClose: p.onClose ?? (() => {}),
    ...(p.onUse ? { onUse: p.onUse } : {}),
    ...(p.focus !== undefined ? { focus: p.focus } : {}),
  };
}

function render(p: Props): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(MaleficiaCabinet, props(p)));
  });
}

function rerender(p: Props): void {
  act(() => {
    root!.render(createElement(MaleficiaCabinet, props(p)));
  });
}

function click(el: Element | null | undefined): void {
  act(() => (el as HTMLElement).click());
}

function press(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** Find a button by its (trimmed) visible text. */
function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container!.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined;
}

/** The relic on stage (the headline name). */
const staged = (): string | null | undefined => container!.querySelector('h2')?.textContent;

/** The procession, in display order (each relic's button carries its name as aria-label). */
function procession(): HTMLButtonElement[] {
  return Array.from(container!.querySelectorAll<HTMLButtonElement>('button.reliquary-proc'));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

const relic = (over: Partial<Maleficium>): Maleficium => ({
  id: 'x',
  name: 'X',
  rarity: 'common',
  img: '',
  desc: 'a desc',
  effect: '+1% something.',
  ...over,
});

const THREE = [
  relic({ id: 'c', name: 'Common Charm', rarity: 'common' }),
  relic({ id: 'a', name: 'Anathema Relic', rarity: 'anathema' }),
  relic({ id: 'r', name: 'Rare Token', rarity: 'rare' }),
];

describe('Loculi — the reliquary overlay', () => {
  it('is a labelled dialog that closes from its ✕ and from Esc', () => {
    let closed = 0;
    render({ items: THREE, onClose: () => (closed += 1) });
    const dialog = container!.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe(strings.maleficia.title);
    click(container!.querySelector(`button[aria-label="${strings.maleficia.close}"]`));
    expect(closed).toBe(1);
    press('Escape');
    expect(closed).toBe(2);
  });

  it('keeps the "Mundane." line when nothing is owned', () => {
    render({ items: [] });
    expect(container!.textContent).toContain(strings.maleficia.empty);
    expect(procession()).toHaveLength(0);
    expect(
      container!.querySelector(`button[aria-label="${strings.maleficia.close}"]`),
    ).not.toBeNull();
  });
});

describe('Loculi — stage and procession', () => {
  it('stands one relic per item in procession, anathema first and common last', () => {
    render({ items: THREE });
    expect(procession().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Anathema Relic',
      'Rare Token',
      'Common Charm',
    ]);
  });

  it('puts the rarest relic on stage by default, with its Roman counter', () => {
    render({ items: THREE });
    expect(staged()).toBe('Anathema Relic');
    expect(container!.textContent).toContain('I · III');
    expect(procession()[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens on the relic the Unveiling last showed, and moves to a new one while open', () => {
    render({ items: THREE, focus: { id: 'r', seq: 1 } });
    expect(staged()).toBe('Rare Token');
    rerender({ items: THREE, focus: { id: 'c', seq: 2 } });
    expect(staged()).toBe('Common Charm');
    expect(container!.textContent).toContain('III · III');
  });

  it('selects a relic from the procession', () => {
    render({ items: THREE });
    click(procession()[2]);
    expect(staged()).toBe('Common Charm');
    expect(procession()[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(procession()[0]!.getAttribute('aria-pressed')).toBe('false');
  });

  it('browses with the ‹ › arrows, wrapping at both ends', () => {
    render({ items: THREE });
    const prev = container!.querySelector(`button[aria-label="${strings.maleficia.previous}"]`);
    const next = container!.querySelector(`button[aria-label="${strings.maleficia.next}"]`);
    click(prev);
    expect(staged()).toBe('Common Charm');
    click(next);
    expect(staged()).toBe('Anathema Relic');
    click(next);
    expect(staged()).toBe('Rare Token');
  });

  it('browses with the ← → keys', () => {
    render({ items: THREE });
    press('ArrowRight');
    expect(staged()).toBe('Rare Token');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(staged()).toBe('Common Charm');
  });

  it('shows no arrows for a single relic', () => {
    render({ items: [relic({ id: 'a', name: 'Alone', rarity: 'rare' })] });
    expect(container!.querySelector(`button[aria-label="${strings.maleficia.next}"]`)).toBeNull();
    expect(container!.textContent).toContain('I · I');
  });

  it('hands the stage to the neighbour when the selected relic vanishes', () => {
    render({ items: THREE });
    click(procession()[1]); // Rare Token
    rerender({ items: THREE.filter((x) => x.id !== 'r') });
    expect(staged()).toBe('Common Charm');
  });

  it('names a relic with no art in its place on stage (the text label)', () => {
    render({ items: [relic({ id: 'd', name: 'The Dadu', img: '' })] });
    const stage = container!.querySelector('[role="dialog"]')!;
    expect(stage.querySelectorAll('canvas').length).toBeGreaterThan(0); // the halo + floor glows
    expect(
      Array.from(stage.querySelectorAll('span')).some((s) => s.textContent === 'The Dadu'),
    ).toBe(true);
  });
});

describe('Loculi — the effect and the rite', () => {
  it('sets the effect as a headline number over its remainder', () => {
    render({
      items: [relic({ id: 'm', name: 'Obsidian Mirror', effect: '-33% Indagatio time.' })],
    });
    const text = container!.textContent ?? '';
    expect(text).toContain(strings.maleficia.effect);
    expect(text).toContain('−33%');
    expect(text).toContain('Indagatio time');
  });

  it("states the relic's invoking power, and shows no line for a relic that grants none", () => {
    render({ items: [relic({ id: 'codex_gigas', name: 'Codex Gigas', invokingPower: 4 })] });
    expect(container!.textContent).toContain(`${strings.maleficia.invokingPower} \u00B7 4`);
    rerender({ items: [relic({ id: 'mark_of_cain', name: 'Mark of Cain', invokingPower: 0 })] });
    expect(container!.textContent).not.toContain(strings.maleficia.invokingPower);
  });

  it('shows remaining uses only for a consumable', () => {
    render({ items: [relic({ id: 'codex_gigas', name: 'Codex Gigas' })] });
    expect(container!.textContent).not.toContain(strings.maleficia.usesRemaining);
    rerender({
      items: [
        relic({
          id: 'black_salt_pouch',
          name: 'Black Salt Pouch ×3',
          use: { label: 'Use', enabled: true, remaining: 3 },
        }),
      ],
    });
    expect(container!.textContent).toContain(`${strings.maleficia.usesRemaining} \u00B7 3`);
  });

  it('labels a consumable single-use and fires its rite', () => {
    let used: string | null = null;
    render({
      items: [
        relic({
          id: 'hand_of_glory',
          name: 'Hand of Glory',
          rarity: 'rare',
          effect: 'Single-use: +33% reprobate generation for an hour.',
          use: { label: 'Use', enabled: true, status: '12m 3s remaining', remaining: 2 },
        }),
      ],
      onUse: (id) => {
        used = id;
      },
    });
    const text = container!.textContent ?? '';
    expect(text).toContain(strings.maleficia.singleUseEffect);
    expect(text).toContain('+33%');
    expect(text).toContain('12m 3s remaining');
    expect(text).toContain(`${strings.maleficia.usesRemaining} \u00B7 2`);
    const useBtn = buttonByText('Use');
    expect(useBtn!.disabled).toBe(false);
    click(useBtn);
    expect(used).toBe('hand_of_glory');
  });

  it('renders a disabled rite when the consumable cannot be used right now', () => {
    render({
      items: [
        relic({
          id: 'defixio',
          name: 'Defixio',
          use: { label: 'Use', enabled: false, remaining: 1 },
        }),
      ],
    });
    expect(buttonByText('Use')!.disabled).toBe(true);
  });

  it('still renders an oracular odds reveal for a scrying relic', () => {
    render({
      items: [
        relic({
          id: 'oracle',
          name: 'An Oracle',
          reveal: [
            {
              category: 'suasio',
              label: 'Suasio',
              actions: [
                {
                  action: 'suggestion',
                  name: 'Suggestion',
                  tiers: [
                    { tier: 'stellar', label: 'Stellar', pct: 0.1 },
                    { tier: 'good', label: 'Good', pct: 0.6 },
                    { tier: 'bad', label: 'Bad', pct: 0.3 },
                  ],
                },
              ],
            },
          ],
        }),
      ],
    });
    const bar = container!.querySelector('[role="img"]');
    expect(bar?.getAttribute('aria-label')).toContain('Suggestion');
  });
});
