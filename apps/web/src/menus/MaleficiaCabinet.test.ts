/**
 * Render smoke tests for the Maleficia Shelf "Niches" rework (Claude Design). These pin the wiring
 * the visual swap relies on: items render one niche per maleficium ordered by rarity (anathema →
 * common), opening a niche shows the close-up, a single-use consumable's rite fires `onUse` (and is
 * disabled when not usable), the oracular items render their odds bars, and "back to the niches"
 * returns to the grid. The `buildCabinet` adapter and the odds math live in their own suites; this
 * component is purely presentational and prop-driven.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MaleficiaCabinet } from './MaleficiaCabinet.js';
import type { Maleficium } from './types.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(items: Maleficium[], onUse?: (id: string) => void): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(MaleficiaCabinet, onUse ? { items, onUse } : { items }));
  });
}

function click(el: Element | null): void {
  act(() => (el as HTMLElement).click());
}

/** Find a button by its (trimmed) visible text. */
function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container!.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

const ordinary = (over: Partial<Maleficium>): Maleficium => ({
  id: 'x',
  name: 'X',
  rarity: 'common',
  img: '',
  desc: 'a desc',
  effect: 'an effect',
  ...over,
});

describe('Maleficia Shelf — niches', () => {
  it('renders one niche per item, ordered by rarity (anathema first, common last)', () => {
    render([
      ordinary({ id: 'c', name: 'Common Charm', rarity: 'common' }),
      ordinary({ id: 'a', name: 'Anathema Relic', rarity: 'anathema' }),
      ordinary({ id: 'r', name: 'Rare Token', rarity: 'rare' }),
    ]);
    const niches = Array.from(container!.querySelectorAll('button[aria-label]'));
    expect(niches.length).toBe(3);
    expect(niches[0]!.getAttribute('aria-label')).toBe('Anathema Relic');
    expect(niches[2]!.getAttribute('aria-label')).toBe('Common Charm');
  });

  it('opens the close-up when a niche is clicked, and returns on "back"', () => {
    render([ordinary({ id: 'a', name: 'Anathema Relic', rarity: 'anathema' })]);
    expect(buttonByText('‹ back to the niches')).toBeUndefined();
    click(container!.querySelector('button[aria-label="Anathema Relic"]'));
    const back = buttonByText('‹ back to the niches');
    expect(back).toBeDefined();
    expect(container!.querySelector('h3')?.textContent).toBe('Anathema Relic');
    click(back!);
    expect(buttonByText('‹ back to the niches')).toBeUndefined();
  });

  it('fires onUse for a single-use rite, and disables it when not usable', () => {
    let used: string | null = null;
    render(
      [
        ordinary({
          id: 'hand_of_glory',
          name: 'Hand of Glory',
          rarity: 'profane',
          use: { label: 'Use', enabled: true },
        }),
      ],
      (id) => {
        used = id;
      },
    );
    click(container!.querySelector('button[aria-label="Hand of Glory"]'));
    const useBtn = buttonByText('Use');
    expect(useBtn).toBeDefined();
    expect(useBtn!.disabled).toBe(false);
    click(useBtn!);
    expect(used).toBe('hand_of_glory');
  });

  it('renders a disabled rite when the consumable cannot be used right now', () => {
    render([
      ordinary({
        id: 'defixio',
        name: 'Defixio',
        rarity: 'profane',
        use: { label: 'Use', enabled: false, status: 'A curse already runs.' },
      }),
    ]);
    click(container!.querySelector('button[aria-label="Defixio"]'));
    expect(buttonByText('Use')!.disabled).toBe(true);
  });

  it('renders the oracular odds reveal for a scrying item', () => {
    render([
      ordinary({
        id: 'obsidian_mirror',
        name: 'Obsidian Mirror',
        rarity: 'rare',
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
    ]);
    click(container!.querySelector('button[aria-label="Obsidian Mirror"]'));
    const bar = container!.querySelector('[role="img"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-label')).toContain('Suggestion');
  });
});
