/**
 * Render smoke tests for the reworked Indagatio menu (Claude Design "Orbis Tenebrarum"): the old
 * separate Indagatio and Emptio PC apps are merged into one surface — a draggable orthographic globe
 * (the Search) on the left and the Emptio market ledger on the right. The Emptio app was removed; its
 * buying flow now lives in this ledger.
 *
 * Two layers are pinned here. First, the presentational `OrbisTenebrarum` against mock finds: the
 * Indagatio stage with the Cast button, the Emptio ledger with one row per located maleficium, the
 * detail panel with its Acquire button, and the three callbacks (onCast/onSelect/onAcquire). Second,
 * a single live-wiring smoke for `IndagatioEmptioProgram`, the store-backed wrapper that replaced the
 * two old menus, confirming the merged surface mounts against fresh store state. The globe's canvas
 * rendering degrades gracefully when no 2D context exists (jsdom), so these assert the JSX only.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameStore } from '../../store/gameStore.js';
import { OrbisTenebrarum } from './index.js';
import { WORLD_LAND, isLand, LAND_POINTS } from './orbis.land.js';
import { coordForFind, MALEFICIA_COORDS, ORBIS_RARITY } from './orbis.data.js';
import type { OrbisFind } from './index.js';
import { IndagatioEmptioProgram } from '../../ui/panels.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const store = (): ReturnType<typeof useGameStore.getState> => useGameStore.getState();

function mount(element: ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
}

function click(el: Element): void {
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const MOCK_FINDS: OrbisFind[] = [
  {
    id: 'ars_serpens',
    name: 'Ars Serpens',
    rarity: 'common',
    effect: '+2 invoking power',
    desc: 'A serpent coiled in ink.',
    costLabel: '120 g',
    acquired: false,
    affordable: true,
  },
  {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    rarity: 'rare',
    effect: '+5 invoking power',
    desc: 'It reflects nothing.',
    costLabel: '900 g',
    acquired: false,
    affordable: false,
  },
];

const noop = (): void => {};

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ state: null, ready: false });
  store().init();
  // jsdom has no 2D canvas context; the globe is built to degrade when getContext returns null.
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('OrbisTenebrarum — globe Search + Emptio ledger', () => {
  it('renders the Indagatio stage and one Emptio row per located maleficium', () => {
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        gold: '1,500',
        searching: false,
        onCast: noop,
        onSelect: noop,
        onAcquire: noop,
      }),
    );

    // The two old menus are now one surface.
    expect(container!.querySelector('.orbis-surface')).not.toBeNull();
    expect((container!.querySelector('.orbis-eyebrow')?.textContent ?? '').trim()).toBe(
      'Indagatio',
    );
    expect((container!.querySelector('.orbis-ledger-title')?.textContent ?? '').trim()).toBe(
      'Emptio',
    );

    // The Cast (Search) control and the globe canvas are present.
    const cast = container!.querySelector<HTMLButtonElement>('.orbis-cast-btn');
    expect((cast?.textContent ?? '').trim()).toBe('Cast the Search');
    expect(container!.querySelector('canvas.orbis-canvas')).not.toBeNull();

    // One ledger row per find, carrying the real name + pre-formatted cost.
    const rows = container!.querySelectorAll('.orbis-row');
    expect(rows.length).toBe(MOCK_FINDS.length);
    const text = container!.textContent ?? '';
    expect(text).toContain('Ars Serpens');
    expect(text).toContain('120 g');
    expect(text).toContain('Obsidian Mirror');
  });

  it('selecting a find opens its detail and Acquire fires onAcquire with the find id', () => {
    let acquired: string | null = null;
    let selected: string | null = null;
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        gold: '1,500',
        searching: false,
        selectedId: 'ars_serpens',
        onCast: noop,
        onSelect: (id: string) => {
          selected = id;
        },
        onAcquire: (id: string) => {
          acquired = id;
        },
      }),
    );

    // Detail panel reflects the selected find.
    const detail = container!.querySelector('.orbis-detail');
    expect(detail).not.toBeNull();
    expect(detail!.textContent ?? '').toContain('A serpent coiled in ink.');

    // Affordable → the Acquire button is enabled and reports the cost.
    const acquire = container!.querySelector<HTMLButtonElement>('.orbis-acquire');
    expect(acquire).not.toBeNull();
    expect(acquire!.disabled).toBe(false);
    expect(acquire!.textContent ?? '').toContain('Acquire');
    click(acquire!);
    expect(acquired).toBe('ars_serpens');

    // Clicking a ledger row selects it.
    const row = container!.querySelector('.orbis-row');
    click(row!);
    expect(selected).toBe('ars_serpens');
  });

  it('Cast fires onCast, and is disabled while a search is underway', () => {
    let casts = 0;
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        gold: '1,500',
        searching: false,
        onCast: () => {
          casts += 1;
        },
        onSelect: noop,
        onAcquire: noop,
      }),
    );
    const cast = container!.querySelector<HTMLButtonElement>('.orbis-cast-btn');
    expect(cast!.disabled).toBe(false);
    click(cast!);
    expect(casts).toBe(1);

    // Re-render mid-search: the Cast control locks.
    act(() =>
      root!.render(
        createElement(OrbisTenebrarum, {
          finds: MOCK_FINDS,
          gold: '1,500',
          searching: true,
          onCast: noop,
          onSelect: noop,
          onAcquire: noop,
        }),
      ),
    );
    expect(container!.querySelector<HTMLButtonElement>('.orbis-cast-btn')!.disabled).toBe(true);
    expect(container!.querySelector('.orbis-status')).not.toBeNull();
  });
});

describe('bundled world coastline data', () => {
  it('ships non-empty rings of in-bounds [lon, lat] pairs for the globe to draw', () => {
    expect(WORLD_LAND.length).toBeGreaterThan(50);
    let points = 0;
    let valid = true;
    for (const ring of WORLD_LAND) {
      if (ring.length % 2 !== 0 || ring.length < 8) valid = false;
      for (let i = 0; i < ring.length; i += 2) {
        const lon = ring[i]!;
        const lat = ring[i + 1]!;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) valid = false;
      }
      points += ring.length / 2;
    }
    expect(valid).toBe(true);
    expect(points).toBeGreaterThan(2000);
  });
});

describe('OrbisTenebrarum — search countdown, Emptio progress, effect gating', () => {
  it('shows a live time-left countdown while searching', () => {
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        gold: '1,000',
        searching: true,
        searchDuration: '05:00',
        searchRemaining: '02:30',
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
      }),
    );
    const meter = container!.querySelector('.orbis-meter-value');
    expect(meter?.textContent).toBe('02:30');
    expect(meter?.className).toContain('is-counting');
  });

  it('renders an Emptio progress bar only on the row being bought', () => {
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        gold: '1,000',
        searching: false,
        emptioProgress: { id: MOCK_FINDS[0]!.id, fraction: 0.4 },
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
      }),
    );
    const fill = container!.querySelector(
      '.orbis-row.is-buying .orbis-row-progress-fill',
    ) as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('40%');
    expect(container!.querySelectorAll('.orbis-row-progress').length).toBe(1);
  });

  it('omits the effect line when a relic grants no effect to show', () => {
    const finds: OrbisFind[] = [{ ...MOCK_FINDS[0]!, effect: '' }];
    mount(
      createElement(OrbisTenebrarum, {
        finds,
        gold: '1,000',
        searching: false,
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
      }),
    );
    expect(container!.querySelector('.orbis-row-effect')).toBeNull();
  });
});

describe('rarity colours', () => {
  it('paints anathema red and profane purple (swapped)', () => {
    expect(ORBIS_RARITY.anathema.color).toBe('#d05a4d'); // red
    expect(ORBIS_RARITY.profane.color).toBe('#a574d8'); // purple
    expect(ORBIS_RARITY.anathema.glow).toBe('rgba(208,90,77,.6)');
    expect(ORBIS_RARITY.profane.glow).toBe('rgba(165,116,216,.6)');
  });
});

describe('maleficia are placed on land', () => {
  it('the curated coordinate table sits entirely on land', () => {
    for (const [lon, lat] of Object.values(MALEFICIA_COORDS)) {
      expect(isLand(lon, lat)).toBe(true);
    }
  });

  it('exposes a non-empty land-anchor set, every point on land', () => {
    expect(LAND_POINTS.length).toBeGreaterThan(200);
    for (const [lon, lat] of LAND_POINTS) {
      expect(isLand(lon, lat)).toBe(true);
    }
  });

  it('coordForFind lands unlisted ids on land via the hash fallback', () => {
    const make = (id: string): OrbisFind => ({
      id,
      name: id,
      rarity: 'common',
      effect: '',
      desc: '',
      costLabel: '',
      acquired: false,
      affordable: true,
    });
    for (const id of ['unlisted_alpha', 'sea_ward_42', 'qzx', 'relic_of_the_deep']) {
      const [lon, lat] = coordForFind(make(id));
      expect(isLand(lon, lat)).toBe(true);
    }
  });
});

describe('IndagatioEmptioProgram — live wiring', () => {
  it('mounts the merged Indagatio + Emptio surface against fresh store state', () => {
    mount(createElement(IndagatioEmptioProgram));
    // The merge replaced the two old menus: one surface, Indagatio stage + Emptio ledger.
    expect(container!.querySelector('.orbis-surface')).not.toBeNull();
    expect((container!.querySelector('.orbis-eyebrow')?.textContent ?? '').trim()).toBe(
      'Indagatio',
    );
    expect((container!.querySelector('.orbis-ledger-title')?.textContent ?? '').trim()).toBe(
      'Emptio',
    );
    expect(container!.querySelector('.orbis-cast-btn')).not.toBeNull();
  });
});
