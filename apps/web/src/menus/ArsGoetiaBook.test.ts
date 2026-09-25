/**
 * Render tests for the painted plates in the Ars Goetia (Claude Design, "Invocation Plates"
 * handoff): an entry's leaf sets its plate on the right-hand page as a decorative image (alt="",
 * hidden from assistive tech, since the name already heads the left page) sized for the 600 × 800
 * bake; the index shows none; a plate that fails to load is hidden with no fallback copy, for that
 * entry only; and an entry without a plate leaves the page bare. The plates themselves are pinned in
 * art/invocationPlates.test.ts, and the adapter's plate urls in game/invocations.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ArsGoetiaBook } from './ArsGoetiaBook.js';
import type { GoetiaEntry } from './ars-goetia.types.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

const plateUrl = (id: string): string => `/assets/panvitium/invocations-ars-goetia/${id}.png`;

function entry(id: string, name: string, rank: string): GoetiaEntry {
  return {
    id,
    name,
    rank,
    cost: 'free',
    cap: '1',
    isApex: false,
    unlocked: true,
    active: 0,
    atCap: false,
    illus: plateUrl(id),
  };
}

const FAMILIAR = entry('familiar', 'Familiar', '');
const IMP = entry('imp', 'Imp', 'I');
/** An entry the adapter gave no plate. */
const { illus: _unplated, ...UNPLATED } = entry('beelzebub', 'Beelzebub', 'II');

function render(entries: GoetiaEntry[]): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(ArsGoetiaBook, {
        entries,
        invokingPower: '4',
        onSummon: () => {},
        onDispel: () => {},
        onClose: () => {},
      }),
    );
  });
}

function click(el: Element | null | undefined): void {
  act(() => (el as HTMLElement).click());
}

/** Open an entry's leaf from the index by its name. */
function open(name: string): void {
  const names = Array.from(container!.querySelectorAll('.gb-entry .gb-name'));
  click(names.find((n) => n.textContent === name)?.closest('button'));
}

const back = (): void => click(container!.querySelector('.gb-back'));
const rightPage = (): Element | null => container!.querySelector('.gb-page--right');
const plate = (): HTMLImageElement | null => container!.querySelector('img');

describe('the Ars Goetia plates', () => {
  it('shows no plate on the index', () => {
    render([FAMILIAR, IMP]);
    expect(container!.querySelector('.gb-page--index')).not.toBeNull();
    expect(plate()).toBeNull();
  });

  it("sets an entry's plate on the right-hand page, as a decorative image", () => {
    render([FAMILIAR, IMP]);
    open('Imp');
    const img = rightPage()?.querySelector('img');
    expect(img).toBe(plate());
    expect(img?.getAttribute('src')).toBe(plateUrl('imp'));
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect([img?.getAttribute('width'), img?.getAttribute('height')]).toEqual(['600', '800']);
    // The name heads the left page.
    expect(container!.querySelector('.gb-page--left .gb-detail-name')?.textContent).toBe('Imp');
  });

  it('shows each entry its own plate', () => {
    render([FAMILIAR, IMP]);
    open('Familiar');
    expect(plate()?.getAttribute('src')).toBe(plateUrl('familiar'));
    back();
    open('Imp');
    expect(plate()?.getAttribute('src')).toBe(plateUrl('imp'));
  });

  it('hides a plate that fails to load, with no fallback copy, for that entry only', () => {
    render([FAMILIAR, IMP]);
    open('Imp');
    act(() => {
      plate()!.dispatchEvent(new Event('error'));
    });
    expect(plate()).toBeNull();
    expect(rightPage()?.textContent).toBe('');
    back();
    open('Familiar');
    expect(plate()?.getAttribute('src')).toBe(plateUrl('familiar'));
  });

  it('leaves the right-hand page bare for an entry without a plate', () => {
    render([FAMILIAR, UNPLATED]);
    open('Beelzebub');
    expect(rightPage()).not.toBeNull();
    expect(plate()).toBeNull();
    expect(rightPage()?.textContent).toBe('');
  });
});
