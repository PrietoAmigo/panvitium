/**
 * The Exstinctio transit's maths (exstinctio.ts) and the room read-back it starts from
 * (roomSnapshot.ts): the light dies in the order of its weakness (candle flame outlives marble, and
 * marble the dark), each step keeps its share, the last candles become the embers, and the timeline
 * plays the steps down on the descent and back up on the ascent inside the 5 s hold.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASCENT_EMBERS_AT_MS,
  ASCENT_STEP_AT_MS,
  DESCENT_EMBERS_AT_MS,
  DESCENT_EMBERS_MS,
  DESCENT_STEP_AT_MS,
  EXSTINCTIO_ALIVE,
  EXSTINCTIO_REST_MS,
  EXSTINCTIO_STEPS,
  EXSTINCTIO_VOID,
  SEAL_LIGHT_STEPS_MS,
  aliveThresholds,
  emberOffset,
  exstinctioAt,
  lightKeys,
  lowResSize,
  mixSealLight,
  playExstinctio,
  renderExstinctioStep,
  sampleBlocks,
  survivingEmbers,
  type PixelBuffer,
} from './exstinctio.js';
import { registerRoomStage, snapshotRoom } from './roomSnapshot.js';
import { TRANSIT_HOLD_MS } from './Katabasis.js';

const W = 60;
const H = 40;
const DARK: readonly [number, number, number] = [12, 10, 9];
const MARBLE: readonly [number, number, number] = [220, 210, 195];
const FLAME: readonly [number, number, number] = [255, 170, 60];
/** Four 2 × 2 candles (top-left corners), well apart. */
const CANDLES: readonly (readonly [number, number])[] = [
  [20, 20],
  [30, 22],
  [40, 20],
  [50, 24],
];
const CANDLE_PX = CANDLES.length * 4;

const isCandle = (x: number, y: number): boolean =>
  CANDLES.some(([cx, cy]) => x >= cx && x < cx + 2 && y >= cy && y < cy + 2);
const isMarble = (x: number): boolean => x < 15;

/** A dark room with a marble wall down its left side and four candles burning. */
function room(lit = true): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = !lit ? DARK : isCandle(x, y) ? FLAME : isMarble(x) ? MARBLE : DARK;
      const i = (y * W + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

const px = (b: Uint8ClampedArray, x: number, y: number): number[] => {
  const i = (y * W + x) * 4;
  return [b[i]!, b[i + 1]!, b[i + 2]!];
};

describe('the extinction', () => {
  it('weighs candle flame above marble, and marble above the dark', () => {
    const keys = lightKeys(room());
    let flame = Infinity;
    let marble = [Infinity, -Infinity];
    let dark = -Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = keys[y * W + x]!;
        if (isCandle(x, y)) flame = Math.min(flame, k);
        else if (isMarble(x)) marble = [Math.min(marble[0]!, k), Math.max(marble[1]!, k)];
        else dark = Math.max(dark, k);
      }
    }
    expect(flame).toBeGreaterThan(marble[1]!);
    expect(marble[0]).toBeGreaterThan(dark);
  });

  it('keeps each step its share of the light, fewer and fewer', () => {
    const keys = lightKeys(room());
    const thresholds = aliveThresholds(keys);
    expect(thresholds).toHaveLength(EXSTINCTIO_STEPS);
    expect(thresholds[0]).toBe(-Infinity);
    const alive = thresholds.map((t) => keys.filter((k) => k >= t).length);
    alive.forEach((n, i) => {
      expect(n).toBeGreaterThanOrEqual(Math.floor(EXSTINCTIO_ALIVE[i]! * keys.length) - 1);
      if (i > 0) {
        expect(thresholds[i]!).toBeGreaterThanOrEqual(thresholds[i - 1]!);
        expect(n).toBeLessThanOrEqual(alive[i - 1]!);
      }
    });
  });

  it('shows the room untouched at step 0, and only the void past the last step', () => {
    const src = room();
    const keys = lightKeys(src);
    const thresholds = aliveThresholds(keys);
    const out = new Uint8ClampedArray(src.data.length);
    renderExstinctioStep(src, keys, thresholds, 0, out);
    expect(out).toEqual(src.data);
    renderExstinctioStep(src, keys, thresholds, EXSTINCTIO_STEPS, out);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) expect(px(out, x, y)).toEqual([...EXSTINCTIO_VOID]);
    }
  });

  it('puts the dark out first, then the marble, and leaves the candles, reddened, to the last', () => {
    const src = room();
    const keys = lightKeys(src);
    // Three steps: everything, the marble and candles (the lit share), the candles alone.
    const lit = (CANDLE_PX + 15 * H) / (W * H);
    const thresholds = aliveThresholds(keys, [1, lit, CANDLE_PX / (W * H)]);
    const out = new Uint8ClampedArray(src.data.length);

    renderExstinctioStep(src, keys, thresholds, 1, out);
    expect(px(out, 30, 5)).toEqual([...EXSTINCTIO_VOID]); // the dark is gone
    expect(px(out, 3, 5)).not.toEqual([...EXSTINCTIO_VOID]); // the marble still lit
    expect(px(out, 20, 20)).not.toEqual([...EXSTINCTIO_VOID]);

    renderExstinctioStep(src, keys, thresholds, 2, out);
    expect(px(out, 3, 5)).toEqual([...EXSTINCTIO_VOID]); // the marble is gone
    for (const [cx, cy] of CANDLES) {
      const [r, g, b] = px(out, cx, cy);
      expect([r, g, b]).not.toEqual([...EXSTINCTIO_VOID]);
      // Pushed toward the grimoire ramp, so no longer the flame as drawn, and still warm.
      expect([r, g, b]).not.toEqual([...FLAME]);
      expect(r!).toBeGreaterThan(b!);
    }
  });
});

describe('the embers', () => {
  it('gathers the last candles into embers where they burned, biggest first', () => {
    const src = room();
    const keys = lightKeys(src);
    const [, last] = aliveThresholds(keys, [1, CANDLE_PX / (W * H)]);
    const embers = survivingEmbers(src, keys, last!);
    expect(embers).toHaveLength(CANDLES.length);
    for (const [cx, cy] of CANDLES) {
      const hit = embers.find(
        (e) => Math.abs(e.x - (cx + 0.5)) < 1 && Math.abs(e.y - (cy + 0.5)) < 1,
      );
      expect(hit).toBeDefined();
      expect(hit!.color[0]).toBeGreaterThan(hit!.color[2]);
    }
    expect(survivingEmbers(src, keys, last!, 2)).toHaveLength(2);
  });

  it('finds no embers in a dark room, whatever survives', () => {
    const src = room(false);
    const keys = lightKeys(src);
    const thresholds = aliveThresholds(keys);
    expect(survivingEmbers(src, keys, thresholds[thresholds.length - 1]!)).toEqual([]);
  });

  it('falls from the candle out of the frame, and rises from below into it', () => {
    for (let k = 0; k < 9; k++) {
      expect(emberOffset('down', k, 0, 100)).toBe(0);
      expect(emberOffset('down', k, 1, 100)).toBe(100);
      expect(emberOffset('up', k, 0, 100)).toBe(100);
      expect(emberOffset('up', k, 1, 100)).toBe(0);
      expect(emberOffset('down', k, 0.6, 100)).toBeGreaterThan(emberOffset('down', k, 0.3, 100));
      expect(emberOffset('up', k, 0.6, 100)).toBeLessThan(emberOffset('up', k, 0.3, 100));
    }
  });
});

describe('the timeline', () => {
  it('fits every beat inside the 5 s hold, the steps in order', () => {
    expect(DESCENT_STEP_AT_MS).toHaveLength(EXSTINCTIO_STEPS);
    expect(ASCENT_STEP_AT_MS).toHaveLength(EXSTINCTIO_STEPS);
    for (let i = 1; i < EXSTINCTIO_STEPS; i++) {
      expect(DESCENT_STEP_AT_MS[i]!).toBeGreaterThan(DESCENT_STEP_AT_MS[i - 1]!);
      expect(ASCENT_STEP_AT_MS[i]!).toBeLessThan(ASCENT_STEP_AT_MS[i - 1]!);
    }
    expect(DESCENT_EMBERS_AT_MS).toBeGreaterThan(DESCENT_STEP_AT_MS[EXSTINCTIO_STEPS - 1]!);
    expect(DESCENT_EMBERS_AT_MS + DESCENT_EMBERS_MS).toBeLessThan(TRANSIT_HOLD_MS);
    expect(ASCENT_STEP_AT_MS[0]!).toBeLessThan(TRANSIT_HOLD_MS);
  });

  it('puts the light out step by step, then lets the embers fall', () => {
    expect(exstinctioAt('down', 0)).toEqual({ step: 0, embers: null, seal: 1 });
    expect(exstinctioAt('down', 499)).toEqual({ step: 0, embers: null, seal: 0 });
    expect(exstinctioAt('down', 500)).toEqual({ step: 1, embers: null, seal: 0 });
    expect(exstinctioAt('down', 3449)).toEqual({ step: 12, embers: null, seal: 0 });
    expect(exstinctioAt('down', 3450)).toEqual({ step: 13, embers: null, seal: 0 });
    expect(exstinctioAt('down', DESCENT_EMBERS_AT_MS)).toEqual({ step: null, embers: 0, seal: 0 });
    expect(exstinctioAt('down', DESCENT_EMBERS_AT_MS + DESCENT_EMBERS_MS / 2).embers).toBe(0.5);
    expect(exstinctioAt('down', TRANSIT_HOLD_MS)).toEqual({ step: null, embers: 1, seal: 0 });
  });

  it("takes the seal's light out of the room in the glyph's three steps, before the room's own", () => {
    expect(SEAL_LIGHT_STEPS_MS[SEAL_LIGHT_STEPS_MS.length - 1]!).toBeLessThan(
      DESCENT_STEP_AT_MS[1]!,
    );
    expect([0, 199, 200, 299, 300, 399, 400].map((t) => exstinctioAt('down', t).seal)).toEqual([
      1, 1, 0.66, 0.66, 0.33, 0.33, 0,
    ]);
    expect(exstinctioAt('up', 0).seal).toBe(0);
    expect(exstinctioAt('up', 2000).seal).toBe(0);
  });

  it('raises the embers, then brings the light back from the candles to the whole room', () => {
    expect(exstinctioAt('up', 0)).toEqual({ step: null, embers: null, seal: 0 });
    expect(exstinctioAt('up', ASCENT_EMBERS_AT_MS)).toEqual({ step: null, embers: 0, seal: 0 });
    expect(exstinctioAt('up', 750).embers).toBe(0.5);
    expect(exstinctioAt('up', 1200)).toEqual({ step: 13, embers: null, seal: 0 });
    expect(exstinctioAt('up', 1399)).toEqual({ step: 13, embers: null, seal: 0 });
    expect(exstinctioAt('up', 1400)).toEqual({ step: 12, embers: null, seal: 0 });
    expect(exstinctioAt('up', 3599)).toEqual({ step: 1, embers: null, seal: 0 });
    expect(exstinctioAt('up', 3600)).toEqual({ step: 0, embers: null, seal: 0 });
    expect(exstinctioAt('up', TRANSIT_HOLD_MS)).toEqual({ step: 0, embers: null, seal: 0 });
  });

  it('holds still on the candles alone going down, and on the room nearly lit going up', () => {
    expect(exstinctioAt('down', EXSTINCTIO_REST_MS).step).toBe(12);
    expect(exstinctioAt('up', EXSTINCTIO_REST_MS).step).toBe(2);
  });
});

describe('reading the room back', () => {
  afterEach(() => {
    registerRoomStage(null);
  });

  it("matches the pass's buffer: one pixel per block, read at its centre (between the scanlines)", () => {
    expect(lowResSize(1280, 720)).toEqual({ w: 427, h: 240 });
    // A 12 × 6 frame whose every pixel names its own column and row.
    const data = new Uint8ClampedArray(12 * 6 * 4);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 12; x++) {
        data[(y * 12 + x) * 4] = x;
        data[(y * 12 + x) * 4 + 1] = y;
      }
    }
    const low = sampleBlocks({ width: 12, height: 6, data }, 4, 2);
    const at = (x: number, y: number): number[] => [
      low.data[(y * 4 + x) * 4]!,
      low.data[(y * 4 + x) * 4 + 1]!,
    ];
    expect([at(0, 0), at(1, 0), at(3, 0), at(0, 1), at(3, 1)]).toEqual([
      [1, 1],
      [4, 1],
      [10, 1],
      [1, 4],
      [10, 4],
    ]);
  });

  it("snapshots the registered stage's room canvas, and nothing without one", () => {
    expect(snapshotRoom()).toBeNull();
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas';
    canvas.width = 12;
    canvas.height = 6;
    stage.appendChild(canvas);
    const data = new Uint8ClampedArray(12 * 6 * 4).fill(200);
    canvas.getContext = (() => ({
      getImageData: () => ({ width: 12, height: 6, data }),
    })) as unknown as typeof canvas.getContext;
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 640, height: 360 }) as DOMRect;
    const unregister = registerRoomStage(stage);
    const snap = snapshotRoom();
    expect(snap?.rect).toEqual({ left: 10, top: 20, width: 640, height: 360 });
    expect(snap?.image.width).toBe(4);
    expect(snap?.image.height).toBe(2);
    unregister();
    expect(snapshotRoom()).toBeNull();
  });
});

describe('the player', () => {
  /** The room with the pressed seal's crimson light still on its vault, over (25..35, 5..15). */
  const GLOW: readonly [number, number, number] = [170, 20, 18];
  const inGlow = (x: number, y: number): boolean => x >= 25 && x < 35 && y >= 5 && y < 15;
  function litRoom(): PixelBuffer {
    const lit = room();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inGlow(x, y)) continue;
        lit.data.set(GLOW, (y * W + x) * 4);
      }
    }
    return lit;
  }

  /** A canvas whose 2D context records every frame put on it, and an animation-frame queue run by
   *  hand. */
  function stage(): {
    canvas: HTMLCanvasElement;
    painted: Uint8ClampedArray[];
    frame: (now: number) => void;
    pending: () => number;
  } {
    const painted: Uint8ClampedArray[] = [];
    const queue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ({
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: (img: { data: Uint8ClampedArray }) =>
        painted.push(Uint8ClampedArray.from(img.data)),
      fillRect: () => undefined,
      fillStyle: '',
    })) as unknown as typeof canvas.getContext;
    return {
      canvas,
      painted,
      frame: (now) => queue.splice(0).forEach((cb) => cb(now)),
      pending: () => queue.length,
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('paints nothing without a 2D context', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => null) as unknown as typeof canvas.getContext;
    const stop = playExstinctio(canvas, room(), 'down', false);
    expect(() => stop()).not.toThrow();
  });

  it("opens on the room as it stood, lets the seal's light go, then puts out the bare room", () => {
    const { canvas, painted, frame } = stage();
    const lit = litRoom();
    const bare = room();
    const settle = vi.fn(() => bare);
    playExstinctio(canvas, lit, 'down', false, settle);
    // The mount frame is the snapshot itself, glow and all; nothing is read again yet.
    expect(canvas.width).toBe(W);
    expect(canvas.height).toBe(H);
    expect(painted[0]).toEqual(lit.data);
    expect(settle).not.toHaveBeenCalled();
    // The first animation frame reads the bare room once.
    frame(1016);
    expect(settle).toHaveBeenCalledTimes(1);
    // Two thirds of the glow at 0.25 s, none at 0.45 s: the bare room.
    frame(1250);
    const mid = px(painted[painted.length - 1]!, 30, 10);
    expect(mid[0]).toBeCloseTo(GLOW[0] * 0.66 + DARK[0] * 0.34, 0);
    frame(1450);
    expect(painted[painted.length - 1]).toEqual(bare.data);
    // The last step burns the bare room's candles, not the glow (which was never in it): every
    // survivor is a candle, and some survive.
    frame(1000 + 3500);
    const last = painted[painted.length - 1]!;
    let survivors = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px(last, x, y).join() === EXSTINCTIO_VOID.join()) continue;
        survivors++;
        expect(isCandle(x, y)).toBe(true);
      }
    }
    expect(survivors).toBeGreaterThan(0);
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('mixes the lit room into the bare one by the light left', () => {
    const out = new Uint8ClampedArray(W * H * 4);
    mixSealLight(litRoom(), room(), 0.33, out);
    expect(px(out, 30, 10)[0]).toBeCloseTo(GLOW[0] * 0.33 + DARK[0] * 0.67, 0);
    expect(px(out, 3, 5)).toEqual([...MARBLE]); // where the two agree, nothing changes
  });

  it('under reduced motion paints the rest frame of the bare room once and stops', () => {
    const { canvas, painted, frame, pending } = stage();
    const bare = room();
    playExstinctio(canvas, litRoom(), 'down', true, () => bare);
    frame(1016);
    expect(pending()).toBe(0);
    const keys = lightKeys(bare);
    const expected = new Uint8ClampedArray(bare.data.length);
    renderExstinctioStep(bare, keys, aliveThresholds(keys), 12, expected);
    expect(painted[painted.length - 1]).toEqual(expected);
  });
});
