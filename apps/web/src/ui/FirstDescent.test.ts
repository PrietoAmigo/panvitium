/**
 * The first-descent cinematic: its timeline (the designer's final beats), the curves each frame
 * reads off it (overlay, curtain, plate swap, the accelerating shrink), the dissolve's per-pixel
 * mask, and the overlay itself: it swallows clicks and keys without skipping, hands off to the
 * descent at exactly `fall0 + 0.72 · F`, lifts at the end, and does not restart when a re-render
 * hands it fresh callbacks.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  FirstDescent,
  FIRST_DESCENT_DISSOLVE_STEPS,
  FIRST_DESCENT_FALL_AT_MS,
  FIRST_DESCENT_FALL_MS,
  FIRST_DESCENT_TOTAL_MS,
  FIRST_DESCENT_TRANSIT_MS,
  dissolveFrame,
  dissolveIndex,
  dissolveNoise,
  dissolveRadii,
  fallWidth,
  firstDescentFrame,
  firstDescentTimeline,
} from './FirstDescent.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const realGetContext = HTMLCanvasElement.prototype.getContext;

// jsdom has no 2D canvas context: the pass is built to do without one, and the timeline still runs.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function render(props: {
  onTransit: () => void;
  onDone: () => void;
  reducedMotion?: boolean;
}): void {
  container ??= document.createElement('div');
  document.body.appendChild(container);
  root ??= createRoot(container);
  act(() => {
    root!.render(createElement(FirstDescent, props));
  });
}

const overlay = (): HTMLElement | null => container!.querySelector('.first-descent');
const curtain = (): HTMLElement | null => container!.querySelector('.first-descent-curtain');
const advance = (ms: number): void =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('the first-descent timeline', () => {
  it('keeps the designer’s beats: plate hold 1500 ms, fall 3000 ms', () => {
    const tl = firstDescentTimeline();
    expect([tl.plateIIn, tl.plateIShown, tl.plateISink, tl.plateIGone]).toEqual([
      900, 2300, 3800, 4700,
    ]);
    expect([tl.plateIIIn, tl.fallAt]).toEqual([4950, 6350]);
    expect(FIRST_DESCENT_FALL_AT_MS).toBe(6350);
    // The hand-off comes at fall0 + 0.72 · F; the overlay lifts 700 ms after the fall ends.
    expect(FIRST_DESCENT_TRANSIT_MS).toBe(6350 + 0.72 * FIRST_DESCENT_FALL_MS);
    expect(FIRST_DESCENT_TRANSIT_MS).toBe(8510);
    expect(FIRST_DESCENT_TOTAL_MS).toBe(10050);
    expect(tl.falls).toBe(true);
  });

  it('under reduced motion, replaces the fall with a 1.2 s cross-fade into the transit', () => {
    const tl = firstDescentTimeline(true);
    expect(tl.plateIGone).toBe(4700); // the two plate fades stay
    expect(tl.transitAt).toBe(6350);
    expect(tl.end).toBe(7550);
    expect(tl.falls).toBe(false);
    // Plate II holds full size while the overlay cross-fades.
    expect(firstDescentFrame(tl, 7000).fall).toBe(0);
    expect(firstDescentFrame(tl, 6950).overlay).toBeCloseTo(0.5, 5);
  });
});

describe('a frame of the cinematic', () => {
  const tl = firstDescentTimeline();
  const at = (t: number): ReturnType<typeof firstDescentFrame> => firstDescentFrame(tl, t);

  it('blacks out the room, then lifts off the transit from the hand-off to the end', () => {
    expect(at(0).overlay).toBe(0);
    expect(at(350).overlay).toBeCloseTo(0.5, 5);
    expect(at(700).overlay).toBe(1);
    expect(at(8509).overlay).toBe(1);
    expect(at((8510 + 10050) / 2).overlay).toBeCloseTo(0.5, 5);
    expect(at(10050).overlay).toBe(0);
  });

  it('draws the curtain off each plate in turn, swapping them under full black', () => {
    expect(at(0).curtain).toBe(1);
    expect(at(1600).curtain).toBeCloseTo(0.5, 5); // Plate I surfacing
    expect(at(2300).curtain).toBe(0);
    expect(at(3799).curtain).toBe(0); // the hold
    expect(at(4250).curtain).toBeCloseTo(0.5, 5); // Plate I going
    expect(at(4699).plate).toBe(0);
    expect(at(4700)).toMatchObject({ curtain: 1, plate: 1 }); // the swap, at full black
    expect(at(4949).curtain).toBe(1);
    expect(at(5650).curtain).toBeCloseTo(0.5, 5); // Plate II surfacing
    expect(at(6350)).toMatchObject({ curtain: 0, fall: 0 });
  });

  it('starts the fall the moment Plate II has surfaced, ending at fall0 + F', () => {
    expect(at(6349).fall).toBe(0);
    expect(at(6350 + 1500).fall).toBeCloseTo(0.5, 5);
    expect(at(9350).fall).toBe(1);
    expect(at(9800).fall).toBe(1);
  });

  it('shrinks the plate ever faster, toward a speck', () => {
    expect(fallWidth(0)).toBe(1);
    expect(fallWidth(1)).toBeCloseTo(0.01, 10);
    const steps = [0, 0.25, 0.5, 0.75, 1].map(fallWidth);
    const drops = steps.slice(1).map((w, i) => steps[i]! - w);
    for (let i = 1; i < drops.length; i++) expect(drops[i]!).toBeGreaterThan(drops[i - 1]!);
  });

  it('steps through every dissolve frame across the fall', () => {
    const n = FIRST_DESCENT_DISSOLVE_STEPS;
    expect(n).toBe(40);
    expect(dissolveIndex(0.001, n)).toBe(0);
    expect(dissolveIndex(0.5, n)).toBe(20);
    expect(dissolveIndex(1, n)).toBe(n - 1);
  });
});

describe('the dissolve', () => {
  const W = 64;
  const H = 36;
  const radii = dissolveRadii(W, H);
  const noise = dissolveNoise(W, H);
  const src = new Uint8ClampedArray(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 256));
  const alphaAt = (k: number, x: number, y: number): number => {
    const out = new Uint8ClampedArray(src.length);
    dissolveFrame(src, out, W, H, k, radii, noise);
    return out[(y * W + x) * 4 + 3]!;
  };

  it('measures the plain ellipse: 0 at the centre, 1 at the edge midpoints, beyond in the corners', () => {
    expect(radii[(H / 2) * W + W / 2]!).toBeLessThan(0.05);
    expect(radii[(H / 2) * W]!).toBeCloseTo(1, 1);
    expect(radii[0]!).toBeGreaterThan(1.3);
  });

  it('keeps the colour and darkens the rim first, progressively', () => {
    const out = new Uint8ClampedArray(src.length);
    dissolveFrame(src, out, W, H, 1 / 40, radii, noise);
    for (let i = 0; i < src.length; i += 4) {
      expect([out[i], out[i + 1], out[i + 2]]).toEqual([src[i], src[i + 1], src[i + 2]]);
    }
    const corner = (k: number): number => alphaAt(k, 0, 0);
    expect(alphaAt(4 / 40, W / 2, H / 2)).toBe(255); // the centre untouched
    expect(corner(1 / 40)).toBeGreaterThan(250); // never a jump
    expect(corner(4 / 40)).toBeLessThan(250);
    expect(corner(12 / 40)).toBeLessThan(corner(4 / 40));
    expect(corner(12 / 40)).toBeGreaterThan(0);
  });

  it('has eroded everything but the heart by the last frame', () => {
    expect(alphaAt(1, 0, 0)).toBe(0);
    expect(alphaAt(1, W / 2, 1)).toBe(0);
    const out = new Uint8ClampedArray(src.length);
    dissolveFrame(src, out, W, H, 1, radii, noise);
    let left = 0;
    for (let i = 3; i < out.length; i += 4) if (out[i]! > 0) left++;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan((W * H) / 10);
  });

  it('erodes coherently from one fixed noise value per 4 × 4 block: what is gone stays gone', () => {
    expect(noise.length).toBe((W / 4) * (H / 4));
    expect(dissolveNoise(W, H)).toEqual(noise); // a fixed seed, not a draw
    let prev = new Uint8ClampedArray(src.length);
    for (let n = 1; n <= FIRST_DESCENT_DISSOLVE_STEPS; n++) {
      const out = new Uint8ClampedArray(src.length);
      dissolveFrame(src, out, W, H, n / FIRST_DESCENT_DISSOLVE_STEPS, radii, noise);
      if (n > 1) {
        for (let i = 3; i < out.length; i += 4) if (prev[i] === 0) expect(out[i]).toBe(0);
      }
      prev = out;
    }
  });

  it('holds the erosion back: halfway through the fall, the heart is barely touched', () => {
    const out = new Uint8ClampedArray(src.length);
    dissolveFrame(src, out, W, H, 0.5, radii, noise);
    let heart = 0;
    let whole = 0;
    for (let p = 0; p < W * H; p++) {
      if (radii[p]! >= 0.3) continue;
      heart++;
      const a = out[p * 4 + 3]!;
      expect(a === 255 || a === 0).toBe(true); // not darkened yet, only (rarely) eroded
      if (a === 255) whole++;
    }
    expect(whole / heart).toBeGreaterThan(0.85);
  });
});

describe('FirstDescent (the overlay)', () => {
  it('cannot be skipped: clicks and keys do nothing; the hand-off and the end come on time', () => {
    vi.useFakeTimers();
    const onTransit = vi.fn();
    const onDone = vi.fn();
    render({ onTransit, onDone });
    expect(overlay()).not.toBeNull();
    expect(overlay()!.querySelector('canvas.scene-canvas')).not.toBeNull();
    expect(overlay()!.querySelectorAll('button').length).toBe(0);
    act(() => overlay()!.click());
    act(() => curtain()!.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    });
    advance(FIRST_DESCENT_TRANSIT_MS - 1);
    expect(onTransit).not.toHaveBeenCalled();
    advance(1);
    expect(onTransit).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    advance(FIRST_DESCENT_TOTAL_MS - FIRST_DESCENT_TRANSIT_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onTransit).toHaveBeenCalledTimes(1);
  });

  it('a re-render with fresh callbacks mid-way does not restart the timeline', () => {
    vi.useFakeTimers();
    const first = { onTransit: vi.fn(), onDone: vi.fn() };
    render(first);
    advance(5000);
    const latest = { onTransit: vi.fn(), onDone: vi.fn() };
    render(latest);
    advance(FIRST_DESCENT_TRANSIT_MS - 5000);
    expect(latest.onTransit).toHaveBeenCalledTimes(1);
    advance(FIRST_DESCENT_TOTAL_MS - FIRST_DESCENT_TRANSIT_MS);
    expect(latest.onDone).toHaveBeenCalledTimes(1);
    expect(first.onTransit).not.toHaveBeenCalled();
    expect(first.onDone).not.toHaveBeenCalled();
  });

  it('under reduced motion, hands off as Plate II has surfaced and lifts 1.2 s later', () => {
    vi.useFakeTimers();
    const onTransit = vi.fn();
    const onDone = vi.fn();
    render({ onTransit, onDone, reducedMotion: true });
    advance(FIRST_DESCENT_FALL_AT_MS - 1);
    expect(onTransit).not.toHaveBeenCalled();
    advance(1);
    expect(onTransit).toHaveBeenCalledTimes(1);
    advance(1199);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('drives the overlay and the curtain every animation frame', () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    render({ onTransit: () => undefined, onDone: () => undefined });
    advance(350);
    expect(Number(overlay()!.style.opacity)).toBeCloseTo(0.5, 1);
    expect(Number(curtain()!.style.opacity)).toBe(1);
    advance(1600 - 350);
    expect(Number(overlay()!.style.opacity)).toBe(1);
    expect(Number(curtain()!.style.opacity)).toBeCloseTo(0.5, 1);
    advance(3000 - 1600);
    expect(Number(curtain()!.style.opacity)).toBe(0);
  });
});
