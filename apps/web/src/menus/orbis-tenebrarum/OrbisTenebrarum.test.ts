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
import {
  coordForFind,
  formatCoord,
  MALEFICIA_COORDS,
  ORBIS_RARITY,
  ORBIS_TIER_COLOR,
} from './orbis.data.js';
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
        investmentPercent: '4%',
        investmentGold: '1,500',
        gold: '31,000',
        searching: false,
        onCast: noop,
        onSelect: noop,
        onAcquire: noop,
        onInvest: noop,
        onDivest: noop,
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
        investmentPercent: '4%',
        investmentGold: '1,500',
        gold: '31,000',
        searching: false,
        selectedId: 'ars_serpens',
        onCast: noop,
        onSelect: (id: string) => {
          selected = id;
        },
        onAcquire: (id: string) => {
          acquired = id;
        },
        onInvest: noop,
        onDivest: noop,
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
        investmentPercent: '4%',
        investmentGold: '1,500',
        gold: '31,000',
        searching: false,
        onCast: () => {
          casts += 1;
        },
        onSelect: noop,
        onAcquire: noop,
        onInvest: noop,
        onDivest: noop,
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
          investmentPercent: '4%',
          investmentGold: '1,500',
          gold: '31,000',
          searching: true,
          onCast: noop,
          onSelect: noop,
          onAcquire: noop,
          onInvest: noop,
          onDivest: noop,
        }),
      ),
    );
    expect(container!.querySelector<HTMLButtonElement>('.orbis-cast-btn')!.disabled).toBe(true);
    // The globe spins to signal the search; there is no "Scrying…" status line any more.
    expect(container!.querySelector('.orbis-status')).toBeNull();
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
        investmentPercent: '4%',
        investmentGold: '1,000',
        gold: '31,000',
        searching: true,
        searchDuration: '05:00',
        searchRemaining: '02:30',
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
        onInvest: () => {},
        onDivest: () => {},
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
        investmentPercent: '4%',
        investmentGold: '1,000',
        gold: '31,000',
        searching: false,
        emptioProgress: { id: MOCK_FINDS[0]!.id, fraction: 0.4 },
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
        onInvest: () => {},
        onDivest: () => {},
      }),
    );
    const fill = container!.querySelector(
      '.orbis-row.is-buying .orbis-row-progress-fill',
    ) as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe('40%');
    expect(container!.querySelectorAll('.orbis-row-progress').length).toBe(1);
  });

  it('locks Acquire while an Emptio is in flight, even for a different affordable relic', () => {
    const finds: OrbisFind[] = [
      { ...MOCK_FINDS[0]!, id: 'ars_serpens', affordable: true },
      { ...MOCK_FINDS[0]!, id: 'second_relic', name: 'Second Relic', affordable: true },
    ];
    mount(
      createElement(OrbisTenebrarum, {
        finds,
        investmentPercent: '4%',
        investmentGold: '9,000',
        gold: '31,000',
        searching: false,
        selectedId: 'second_relic', // a different, affordable relic than the one being bought
        emptioProgress: { id: 'ars_serpens', fraction: 0.5 },
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
        onInvest: () => {},
        onDivest: () => {},
      }),
    );
    // Only one purchase runs at a time, so the whole Acquire control is disabled and names the relic
    // being bought, with its progress.
    const acquire = container!.querySelector<HTMLButtonElement>('.orbis-acquire');
    expect(acquire).not.toBeNull();
    expect(acquire!.disabled).toBe(true);
    expect((acquire!.textContent ?? '').trim()).toBe('Emptio busy: Ars Serpens 50%');
  });

  it('omits the effect line when a relic grants no effect to show', () => {
    const finds: OrbisFind[] = [{ ...MOCK_FINDS[0]!, effect: '' }];
    mount(
      createElement(OrbisTenebrarum, {
        finds,
        investmentPercent: '4%',
        investmentGold: '1,000',
        gold: '31,000',
        searching: false,
        onCast: () => {},
        onSelect: () => {},
        onAcquire: () => {},
        onInvest: () => {},
        onDivest: () => {},
      }),
    );
    expect(container!.querySelector('.orbis-row-effect')).toBeNull();
  });
});

describe('OrbisTenebrarum — Indagatio investment controls', () => {
  it('shows the Investment, Gold and Duration meters and fires Invest / Divest', () => {
    let invested = 0;
    let divested = 0;
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        investmentPercent: '12%',
        investmentGold: '640',
        gold: '5,333',
        searching: false,
        onCast: noop,
        onSelect: noop,
        onAcquire: noop,
        onInvest: () => {
          invested += 1;
        },
        onDivest: () => {
          divested += 1;
        },
      }),
    );

    // Left to right: the Investment meter, then the gold held, then the Time left / Duration meter.
    const labels = [...container!.querySelectorAll('.orbis-meter-label')].map((n) =>
      (n.textContent ?? '').trim(),
    );
    expect(labels).toEqual(['Investment', 'Gold', 'Duration']);
    // The Investment meter reads the default percentage first, then the live gold in parentheses.
    const investValue = container!.querySelector('.orbis-invest-value');
    expect((investValue?.querySelector('.orbis-invest-pct')?.textContent ?? '').trim()).toBe('12%');
    expect((investValue?.querySelector('.orbis-invest-gold')?.textContent ?? '').trim()).toBe(
      '(640)',
    );
    expect((investValue?.textContent ?? '').trim()).toBe('12% (640)');
    // The Gold meter shows the gold held.
    expect((container!.querySelector('.orbis-gold-value')?.textContent ?? '').trim()).toBe('5,333');

    const invest = container!.querySelector<HTMLButtonElement>('.orbis-invest-btn');
    const divest = container!.querySelector<HTMLButtonElement>('.orbis-divest-btn');
    expect((invest?.textContent ?? '').trim()).toBe('Invest');
    expect((divest?.textContent ?? '').trim()).toBe('Divest');
    click(invest!);
    click(divest!);
    expect(invested).toBe(1);
    expect(divested).toBe(1);
  });

  it('disables Invest / Divest at the percentage bounds', () => {
    mount(
      createElement(OrbisTenebrarum, {
        finds: MOCK_FINDS,
        investmentPercent: '4%',
        investmentGold: '0',
        gold: '31,000',
        searching: false,
        canInvest: false,
        canDivest: false,
        onCast: noop,
        onSelect: noop,
        onAcquire: noop,
        onInvest: noop,
        onDivest: noop,
      }),
    );
    expect(container!.querySelector<HTMLButtonElement>('.orbis-invest-btn')!.disabled).toBe(true);
    expect(container!.querySelector<HTMLButtonElement>('.orbis-divest-btn')!.disabled).toBe(true);
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

  it("states a listed relic's invoking power, and no line for one that grants none", () => {
    const s = store().state!;
    useGameStore.setState({
      state: {
        ...s,
        lifetime: { ...s.lifetime, emptioList: ['spear_of_longinus', 'codex_gigas'] },
      },
    });
    mount(createElement(IndagatioEmptioProgram));
    const lines = Array.from(container!.querySelectorAll('.orbis-row-effect')).map(
      (e) => e.textContent,
    );
    // The Spear of Longinus grants none: its row carries no line; the Codex Gigas grants 4.
    expect(lines).toEqual(['+4 invoking power']);
  });
});

/** The props every enhanced-surface test shares; each test overrides what it pins. */
function baseProps(
  over: Partial<Parameters<typeof OrbisTenebrarum>[0]> = {},
): Parameters<typeof OrbisTenebrarum>[0] {
  return {
    finds: MOCK_FINDS,
    investmentPercent: '4%',
    investmentGold: '1,240',
    gold: '31,000',
    searching: false,
    onCast: noop,
    onSelect: noop,
    onAcquire: noop,
    onInvest: noop,
    onDivest: noop,
    ...over,
  };
}

const TIER_CHANCES = [
  { tier: 'stellar', label: 'Stellar', chance: '2.1%', share: 0.021 },
  { tier: 'excellent', label: 'Excellent', chance: '6.4%', share: 0.064 },
  { tier: 'good', label: 'Good', chance: '18.0%', share: 0.18 },
  { tier: 'neutral', label: 'Neutral', chance: '38.5%', share: 0.385 },
  { tier: 'bad', label: 'Bad', chance: '22.0%', share: 0.22 },
  { tier: 'terrible', label: 'Terrible', chance: '9.8%', share: 0.098 },
  { tier: 'apocalyptic', label: 'Apocalyptic', chance: '3.2%', share: 0.032 },
];

describe('OrbisTenebrarum — enhanced ledger', () => {
  it('counts the located maleficia, in total and per rarity', () => {
    mount(createElement(OrbisTenebrarum, baseProps()));
    expect((container!.querySelector('.orbis-ledger-count')?.textContent ?? '').trim()).toBe(
      '2 located',
    );
    const counts = [...container!.querySelectorAll('.orbis-legend-count')].map(
      (n) => n.textContent,
    );
    // Legend order is common, rare, profane, anathema; the mock holds one common and one rare.
    expect(counts).toEqual(['1', '1', '0', '0']);
  });

  it('marks a bound relic in place of its price, and locks an unaffordable one', () => {
    const finds: OrbisFind[] = [
      { ...MOCK_FINDS[0]!, acquired: true, affordable: false },
      MOCK_FINDS[1]!, // obsidian_mirror: not affordable
    ];
    mount(createElement(OrbisTenebrarum, baseProps({ finds, selectedId: 'ars_serpens' })));
    const rows = container!.querySelectorAll('.orbis-row');
    expect(rows[0]!.className).toContain('is-owned');
    expect((rows[0]!.querySelector('.orbis-row-bound')?.textContent ?? '').trim()).toBe('◈ Bound');
    expect(rows[0]!.querySelector('.orbis-row-cost')).toBeNull();
    const locked = rows[1]!.querySelector('.orbis-row-cost.is-locked');
    expect(locked).not.toBeNull();
    expect(locked!.querySelector('svg.orbis-lock')).not.toBeNull();
    expect((locked!.textContent ?? '').trim()).toBe('900 g');
    // The bound relic's Acquire control is disabled and says so.
    const acquire = container!.querySelector<HTMLButtonElement>('.orbis-acquire');
    expect(acquire!.disabled).toBe(true);
    expect((acquire!.textContent ?? '').trim()).toBe('◈ Bound');
  });

  it('shows the percentage on the row being bought, and Acquire for that relic reports it', () => {
    mount(
      createElement(
        OrbisTenebrarum,
        baseProps({
          selectedId: 'ars_serpens',
          emptioProgress: { id: 'ars_serpens', fraction: 0.4 },
        }),
      ),
    );
    const buying = container!.querySelector('.orbis-row.is-buying');
    expect((buying?.querySelector('.orbis-row-cost.is-buying')?.textContent ?? '').trim()).toBe(
      '40%',
    );
    expect((container!.querySelector('.orbis-acquire')?.textContent ?? '').trim()).toBe(
      'Emptio underway · 40%',
    );
  });

  it('gives the detail its coordinates, price, art niche and split effect clause', () => {
    const finds: OrbisFind[] = [
      {
        ...MOCK_FINDS[0]!,
        desc: 'Smooth to the touch and ear.',
        boon: '+33% Logos efficiency.',
        img: '/assets/panvitium/maleficia/ars_serpens.png',
      },
    ];
    mount(createElement(OrbisTenebrarum, baseProps({ finds, selectedId: 'ars_serpens' })));
    const detail = container!.querySelector('.orbis-detail')!;
    expect((detail.querySelector('.orbis-detail-coord')?.textContent ?? '').trim()).toBe(
      formatCoord(coordForFind(finds[0]!)),
    );
    expect((detail.querySelector('.orbis-detail-price-value')?.textContent ?? '').trim()).toBe(
      '120 g',
    );
    expect(detail.querySelector('.orbis-detail-art--common')).not.toBeNull();
    expect((detail.querySelector('.orbis-detail-desc')?.textContent ?? '').trim()).toBe(
      'Smooth to the touch and ear.',
    );
    expect((detail.querySelector('.orbis-detail-boon')?.textContent ?? '').trim()).toBe(
      '+33% Logos efficiency.',
    );
    // The invoking-power line stays as its own line.
    expect((detail.querySelector('.orbis-detail-effect')?.textContent ?? '').trim()).toBe(
      '+2 invoking power',
    );
    // An affordable relic's button just says Acquire: the price sits beside it.
    expect((detail.querySelector('.orbis-acquire')?.textContent ?? '').trim()).toBe('Acquire');
  });

  it('omits the art niche and the effect clause when a find carries neither', () => {
    mount(createElement(OrbisTenebrarum, baseProps({ selectedId: 'ars_serpens' })));
    expect(container!.querySelector('.orbis-detail-art')).toBeNull();
    expect(container!.querySelector('.orbis-detail-boon')).toBeNull();
  });
});

describe('OrbisTenebrarum — enhanced globe stage', () => {
  it('labels the selected find over the globe as DOM, with its rarity and price', () => {
    mount(createElement(OrbisTenebrarum, baseProps({ selectedId: 'obsidian_mirror' })));
    const label = container!.querySelector('.orbis-pin-label');
    expect(label).not.toBeNull();
    expect(label!.className).toContain('orbis-pin-label--rare');
    expect((label!.querySelector('.orbis-pin-label-name')?.textContent ?? '').trim()).toBe(
      'Obsidian Mirror',
    );
    expect((label!.querySelector('.orbis-pin-label-meta')?.textContent ?? '').trim()).toBe(
      'Rare · 900 g',
    );
  });

  it('shows no pin label when nothing is selected, and keeps the drag hint', () => {
    mount(createElement(OrbisTenebrarum, baseProps()));
    expect(container!.querySelector('.orbis-pin-label')).toBeNull();
    expect(container!.querySelector('.orbis-hint')?.textContent ?? '').toContain(
      'drag to turn the world',
    );
  });

  it('relabels Cast while a search is underway', () => {
    mount(createElement(OrbisTenebrarum, baseProps({ searching: true })));
    expect((container!.querySelector('.orbis-cast-btn')?.textContent ?? '').trim()).toBe(
      'Search underway',
    );
  });

  it('places Divest and Invest either side of the Investment meter', () => {
    mount(createElement(OrbisTenebrarum, baseProps()));
    const group = container!.querySelector('.orbis-invest-group')!;
    const kids = [...group.children].map((n) => n.className);
    expect(kids).toEqual([
      'orbis-divest-btn',
      'orbis-meter orbis-meter--invest',
      'orbis-invest-btn',
    ]);
  });

  it('draws the odds as a bar, one segment per tier sized by its share, in its tier colour', () => {
    mount(createElement(OrbisTenebrarum, baseProps({ tierChances: TIER_CHANCES })));
    const segs = [...container!.querySelectorAll<HTMLElement>('.orbis-odds-seg')];
    expect(segs.length).toBe(7);
    expect(segs[0]!.style.flexGrow).toBe('0.021');
    // Stellar red, Good teal; Neutral grey, Bad light cream, Terrible green, Apocalyptic light blue.
    expect(segs[0]!.style.background).toBe('rgb(208, 90, 77)');
    expect(segs[2]!.style.background).toBe('rgb(86, 179, 163)');
    expect(segs[3]!.style.background).toBe('rgb(138, 134, 126)');
    expect(segs[4]!.style.background).toBe('rgb(230, 220, 198)');
    expect(segs[5]!.style.background).toBe('rgb(106, 168, 79)');
    expect(segs[6]!.style.background).toBe('rgb(127, 182, 222)');
    expect(container!.querySelectorAll('.orbis-odds-row').length).toBe(7);
  });

  it("writes each tier's name in the lighter tint of its colour", () => {
    mount(createElement(OrbisTenebrarum, baseProps({ tierChances: TIER_CHANCES })));
    const color = (tier: string): string =>
      container!.querySelector<HTMLElement>(`.orbis-odds-row.tier-${tier} .orbis-odds-tier`)!.style
        .color;
    expect(color('neutral')).toBe('rgb(169, 165, 157)');
    expect(color('bad')).toBe('rgb(239, 230, 210)');
    expect(color('terrible')).toBe('rgb(140, 200, 112)');
    expect(color('apocalyptic')).toBe('rgb(156, 203, 236)');
  });

  it('leaves a zero-chance tier out of the bar but keeps it in the list', () => {
    const tiers = TIER_CHANCES.map((t) =>
      t.tier === 'apocalyptic' ? { ...t, chance: '0.0%', share: 0 } : t,
    );
    mount(createElement(OrbisTenebrarum, baseProps({ tierChances: tiers })));
    expect(container!.querySelectorAll('.orbis-odds-seg').length).toBe(6);
    expect(container!.querySelectorAll('.orbis-odds-row').length).toBe(7);
  });
});

describe('orbis helpers', () => {
  it('formats a globe position as a compact coordinate line', () => {
    expect(formatCoord([12.5, 43.5])).toBe('43.50°N · 12.50°E');
    expect(formatCoord([-99, 19])).toBe('19.00°N · 99.00°W');
    expect(formatCoord([-71, -36])).toBe('36.00°S · 71.00°W');
  });

  it('gives every outcome tier a colour: grey Neutral, cream Bad, green Terrible, blue Apocalyptic', () => {
    expect(Object.keys(ORBIS_TIER_COLOR)).toEqual([
      'stellar',
      'excellent',
      'good',
      'neutral',
      'bad',
      'terrible',
      'apocalyptic',
    ]);
    expect(ORBIS_TIER_COLOR.neutral).toEqual({ bar: '#8a867e', text: '#a9a59d' });
    expect(ORBIS_TIER_COLOR.bad).toEqual({ bar: '#e6dcc6', text: '#efe6d2' });
    expect(ORBIS_TIER_COLOR.terrible).toEqual({ bar: '#6aa84f', text: '#8cc870' });
    expect(ORBIS_TIER_COLOR.apocalyptic).toEqual({ bar: '#7fb6de', text: '#9ccbec' });
  });
});

describe('IndagatioEmptioProgram — enhanced wiring', () => {
  it("passes a relic's art and split copy into the detail, and the odds as bar shares", () => {
    const s = store().state!;
    useGameStore.setState({
      state: { ...s, lifetime: { ...s.lifetime, emptioList: ['voynich_manuscript'] } },
    });
    mount(createElement(IndagatioEmptioProgram));
    click(container!.querySelector('.orbis-row')!);
    const detail = container!.querySelector('.orbis-detail')!;
    expect((detail.querySelector('.orbis-detail-desc')?.textContent ?? '').trim()).toBe(
      'Unreadable to the faithful; fluent to the fallen.',
    );
    expect((detail.querySelector('.orbis-detail-boon')?.textContent ?? '').trim()).toBe(
      '+25% Desidia gain rate.',
    );
    expect(detail.querySelector('.orbis-detail-art--profane')).not.toBeNull();
    // Every tier with a chance gets a bar segment; the shares sum to the whole bar.
    const shares = [...container!.querySelectorAll<HTMLElement>('.orbis-odds-seg')].map((n) =>
      Number(n.style.flexGrow),
    );
    expect(shares.length).toBeGreaterThan(0);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});
