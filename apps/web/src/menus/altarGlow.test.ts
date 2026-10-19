/**
 * The altar's glow is painted into the room's degradation pass from live DOM anchors (the glyph,
 * the hidden aura, STATUS QUO's hidden bloom and line). jsdom has no layout, so each anchor's box
 * is stubbed and its live style (opacity, `--seal-breath`) set inline, standing in for what the
 * CSS animations and transitions would report.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  altarGlows,
  AURA_STOPS,
  BLOOM_STOPS,
  LINE_STOPS,
  SEAL_ARMED,
  SEAL_IDLE,
} from './altarGlow.js';
import type {
  EngineGlow,
  EngineGlowBar,
  EngineGlowEllipse,
  EngineGlowSilhouette,
} from './degrade.js';

// The stage: 1600 × 900 CSS px at (100, 50).
const STAGE = { left: 100, top: 50, width: 1600, height: 900 };

function rect(el: Element, r: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({
      ...r,
      x: r.left,
      y: r.top,
      right: r.left + r.width,
      bottom: r.top + r.height,
      toJSON: () => r,
    }) as DOMRect;
}

/** The overlay as `AltarSigil` renders it, laid out on the stub stage. */
function stage(
  opts: { armed?: boolean; breath?: number; fade?: number; sq?: boolean; decoded?: boolean } = {},
) {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="altar-sigil">
      <div class="altar-sigil-wrap">
        <button class="altar-sigil-btn${opts.armed ? ' is-armed' : ''}">
          <span class="altar-sigil-scale">
            <span class="altar-sigil-aura"></span>
            <img class="altar-sigil-glyph" />
          </span>
        </button>
      </div>
      ${
        opts.sq === false
          ? ''
          : `<div class="altar-sq-row"><button class="altar-sq">
               <span class="altar-sq-bloom"></span>Status Quo<span class="altar-sq-line"></span>
             </button></div>`
      }
    </div>`;
  document.body.appendChild(root);
  const q = (sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
  const layer = q('.altar-sigil');
  rect(layer, STAGE);
  if (opts.fade !== undefined) layer.style.opacity = String(opts.fade);
  // The aura: 480 × 400 centred on the stage centre (900, 500), at 0.8 opacity.
  const aura = q('.altar-sigil-aura');
  rect(aura, { left: 660, top: 300, width: 480, height: 400 });
  aura.style.opacity = '0.8';
  // The glyph: laid out 200 px wide, shown 240 px wide (scale 1.2), its art 495 × 561.
  const glyph = q('.altar-sigil-glyph') as HTMLImageElement;
  rect(glyph, { left: 780, top: 360, width: 240, height: 280 });
  Object.defineProperty(glyph, 'complete', { value: true });
  Object.defineProperty(glyph, 'naturalWidth', { value: opts.decoded === false ? 0 : 495 });
  Object.defineProperty(glyph, 'naturalHeight', { value: 561 });
  Object.defineProperty(glyph, 'offsetWidth', { value: 200 });
  if (opts.breath !== undefined) glyph.style.setProperty('--seal-breath', String(opts.breath));
  if (opts.sq !== false) {
    q('.altar-sq').style.opacity = '0.5';
    const bloom = q('.altar-sq-bloom');
    rect(bloom, { left: 700, top: 800, width: 400, height: 46 });
    bloom.style.opacity = '0.85';
    const line = q('.altar-sq-line');
    rect(line, { left: 720, top: 840, width: 360, height: 2 });
    line.style.opacity = '1';
  }
  return root;
}

const of = <K extends EngineGlow['kind']>(glows: EngineGlow[], kind: K) =>
  glows.filter((g): g is Extract<EngineGlow, { kind: K }> => g.kind === kind);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('altarGlows: when there is nothing to cast', () => {
  it('is empty without the sigil, or before the stage has a size', () => {
    expect(altarGlows(null)).toEqual([]);
    expect(altarGlows(document.createElement('div'))).toEqual([]);
    const root = stage();
    rect(root.querySelector('.altar-sigil')!, { left: 0, top: 0, width: 0, height: 0 });
    expect(altarGlows(root)).toEqual([]);
  });

  it('casts no seal glow until the glyph has decoded', () => {
    expect(of(altarGlows(stage({ decoded: false })), 'silhouette')).toEqual([]);
  });
});

describe('altarGlows: the seal', () => {
  it('fills the aura anchor with the aura gradient, at its live opacity', () => {
    const [aura] = of(altarGlows(stage()), 'ellipse') as EngineGlowEllipse[];
    expect(aura).toMatchObject({ stops: AURA_STOPS, alpha: 0.8 });
    expect(aura!.x).toBeCloseTo((660 + 240 - 100) / 1600, 9);
    expect(aura!.y).toBeCloseTo((300 + 200 - 50) / 900, 9);
    expect(aura!.w).toBeCloseTo(480 / 1600, 9);
    expect(aura!.h).toBeCloseTo(400 / 900, 9);
  });

  it('centres the silhouette on the glyph and keeps the art aspect', () => {
    const [seal] = of(altarGlows(stage()), 'silhouette') as EngineGlowSilhouette[];
    expect(seal!.x).toBeCloseTo((780 + 120 - 100) / 1600, 9);
    expect(seal!.y).toBeCloseTo((360 + 140 - 50) / 900, 9);
    expect(seal!.w).toBeCloseTo(240 / 1600, 9);
    expect(seal!.h).toBeCloseTo((240 * (561 / 495)) / 900, 9);
    expect(seal!.fill).toBe(SEAL_IDLE.fill);
  });

  it('rests at breath 0, its blurs scaled by the glyph’s live scale', () => {
    const [seal] = of(altarGlows(stage()), 'silhouette') as EngineGlowSilhouette[];
    const blurs = seal!.shadows.map((s) => s.blur * 1600);
    SEAL_IDLE.rest.forEach((r, i) => expect(blurs[i]).toBeCloseTo(r[0] * 1.2, 9));
    expect(seal!.shadows[0]!.color).toBe('rgba(170, 14, 9, 1)');
  });

  it('swells with --seal-breath, and arms to the armed look', () => {
    const [swell] = of(altarGlows(stage({ breath: 1 })), 'silhouette') as EngineGlowSilhouette[];
    SEAL_IDLE.swell.forEach((s, i) =>
      expect(swell!.shadows[i]!.blur * 1600).toBeCloseTo(s[0] * 1.2, 9),
    );
    document.body.innerHTML = '';
    const [armed] = of(
      altarGlows(stage({ armed: true, breath: 0.5 })),
      'silhouette',
    ) as EngineGlowSilhouette[];
    expect(armed!.fill).toBe(SEAL_ARMED.fill);
    const [r, s] = [SEAL_ARMED.rest[2]!, SEAL_ARMED.swell[2]!];
    expect(armed!.shadows[2]!.blur * 1600).toBeCloseTo(((r[0] + s[0]) / 2) * 1.2, 9);
  });
});

describe('altarGlows: STATUS QUO', () => {
  it('casts the bloom and the line at their anchors, through the label’s own fade', () => {
    const glows = altarGlows(stage());
    const bloom = of(glows, 'ellipse').find((g) => g.stops === BLOOM_STOPS)!;
    expect(bloom.alpha).toBeCloseTo(0.5 * 0.85, 9);
    expect(bloom.y).toBeCloseTo((800 + 23 - 50) / 900, 9);
    const [line] = of(glows, 'bar') as EngineGlowBar[];
    expect(line).toMatchObject({ stops: LINE_STOPS, alpha: 0.5 });
    expect(line!.w).toBeCloseTo(360 / 1600, 9);
    expect(line!.shadows.map((s) => s.blur * 1600)).toEqual([4, 10]);
  });

  it('casts nothing for the label once it is gone (armed)', () => {
    const glows = altarGlows(stage({ sq: false }));
    expect(of(glows, 'bar')).toEqual([]);
    expect(of(glows, 'ellipse').map((g) => g.stops)).toEqual([AURA_STOPS]);
  });
});

describe('altarGlows: the overlay’s fade', () => {
  it('dims every glow with the layer as it fades', () => {
    const glows = altarGlows(stage({ fade: 0.25 }));
    const alpha = (kind: EngineGlow['kind']): number[] => of(glows, kind).map((g) => g.alpha);
    expect(alpha('silhouette')).toEqual([0.25]);
    expect(alpha('ellipse')[0]).toBeCloseTo(0.25 * 0.8, 9);
    expect(alpha('bar')[0]).toBeCloseTo(0.25 * 0.5, 9);
  });
});
