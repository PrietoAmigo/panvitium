/**
 * Render tests for the painted plates in the Magna Goetia (Claude Design, "Invocation Plates"
 * handoff): an entry's leaf sets its plate on the right-hand page as a decorative image (alt="",
 * hidden from assistive tech, since the name already heads the left page) sized for the 600 × 800
 * bake; the index shows none; a plate that fails to load is hidden with no fallback copy, for that
 * entry only; and an entry without a plate leaves the page bare. The plates themselves are pinned in
 * art/invocationPlates.test.ts, and the adapter's plate urls in game/invocations.test.ts. Also the
 * lore: set apart from both pages (its own flow across their bottom halves, laid out in menus.css and
 * measured in e2e/magna-goetia.spec.ts), with its `*…*` spans as `<em>`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MagnaGoetiaBook } from './MagnaGoetiaBook.js';
import type { GoetiaEntry } from './magna-goetia.types.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

const plateUrl = (id: string): string => `/assets/panvitium/invocations-magna-goetia/${id}.png`;

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
      createElement(MagnaGoetiaBook, {
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

describe('the Magna Goetia plates', () => {
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

describe('the Magna Goetia lore', () => {
  const lore = (): Element | null => container!.querySelector('.gb-lore');

  it('sets the lore apart from both pages, under them', () => {
    render([{ ...IMP, lore: 'A graft of wrath. Formula: *I, et morde quod ostendo.*' }]);
    open('Imp');
    expect(lore()?.textContent).toBe('A graft of wrath. Formula: I, et morde quod ostendo.');
    // Its own flow, not inside either page, and after both in reading order.
    expect(lore()?.closest('.gb-page')).toBeNull();
    expect(rightPage()?.compareDocumentPosition(lore()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('sets each *…* span as an <em>, the rest as plain text', () => {
    render([{ ...IMP, lore: 'The *impe*, a graft. Formula: *I, et morde.*' }]);
    open('Imp');
    const ems = Array.from(lore()!.querySelectorAll('em')).map((e) => e.textContent);
    expect(ems).toEqual(['impe', 'I, et morde.']);
    expect(lore()!.innerHTML).not.toContain('*');
  });

  it('shows no lore block for an entry without lore', () => {
    render([FAMILIAR, IMP]);
    open('Imp');
    expect(lore()).toBeNull();
  });
});
