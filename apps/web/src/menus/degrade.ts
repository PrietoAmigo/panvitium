/* =============================================================================
   Panvitium — the Degradation Pass (framework-free engine)
   -----------------------------------------------------------------------------
   The game's "defining constraint" (01-vision-and-core-loop.md §"Visual and
   tonal identity"): every diegetic element — room plates, baked props, summoned
   creatures — passes through ONE uniform recipe so the whole frame reads at a
   single fidelity. The grimoire UI (menus, HUD, hotspots) lives OUTSIDE this
   pass and stays crisp.

   The recipe, in order, runs inside `render()`:
     1. Composite the live scene (backdrop + animated sprites) into a small
        low-resolution buffer  ........................  PIXELATION (block size)
     2. Tone curve — crush blacks, lift floor, add contrast  ......  THE GRADE
     3. Quantise each channel to N steps (optional Bayer dither)  .  COLOUR CRUSH
     4. Blend toward the candle/blood/gold grimoire palette  ......  THE GRADE
     5. Per-frame grain + candlelight flicker  ...................  CURSED CD-ROM
     6. Upscale nearest-neighbour, then scanlines + RGB shift + vignette
     7. Fade-to-black curtain for room changes (see `setScene`)

   Because pixelation happens FIRST, all the per-pixel work runs on the tiny
   buffer (~320x180), so the whole pass is cheap enough to animate.

   This module is pure TypeScript with no framework dependency — it manipulates a
   <canvas> directly. The React `DegradedScene` wrapper owns its lifecycle.
   ========================================================================== */

/** The full degradation recipe. Every knob the pass exposes. */
export interface DegradeSettings {
  /** Master switch. When false the scene renders un-degraded (the source plate). */
  enabled: boolean;
  /** Pixel block size — display px per source block. Higher = chunkier. */
  block: number;
  /** Colour steps per channel (posterise). Lower = harsher crush. */
  levels: number;
  /** Ordered Bayer dither before quantisation — softens banding at low `levels`. */
  dither: boolean;
  /** 0..1 blend toward the grimoire palette ramp (void → blood → ember → gold). */
  grade: number;
  /** Tone-curve contrast about mid-grey. */
  contrast: number;
  /** Black-crush amount — pushes shadows toward the deep void. */
  black: number;
  /** Vignette strength 0..1. */
  vignette: number;
  /** Per-frame grain amplitude (~0..0.3). */
  grain: number;
  /** Candlelight brightness flicker (~0..0.4). */
  flicker: number;
  /** Scanline darkness 0..0.5. */
  scanlines: number;
  /** Chromatic-aberration / RGB shift in px. */
  aberration: number;
  /** Render cadence. Lower reads as more degraded/VHS. */
  fps: number;
  /** Sprites pass through the SAME downsample as the backdrop (uniform fidelity).
      Set false only to demonstrate the mismatched-fidelity failure mode. */
  uniform: boolean;
  /** Creature idle motion (gentle bob + breathe) composited before the pass. */
  bob: boolean;
  /** Fausto-curse "Vertigo" target intensity 0..1. 0 = no curse; the pass eases the applied value
      toward this every frame, so toggling the flag fades the effect in/out (~0.7s) rather than
      snapping. Presentation-only — it reads off `flagFaustoCurse`, never the sim/RNG/save. */
  curseVertigo: number;
  /** Honour `prefers-reduced-motion: reduce`. When set, the Vertigo layer drops the vestibular
      sub-effects (sway / zoom / double-vision / pulse) and keeps only a steady tunnel vignette, so
      the curse still registers without inducing motion sickness. */
  reducedMotion: boolean;
}

/**
 * The current shipped recipe — the "Cursed CD-ROM" preset dialled in design.
 * Spread over any partial override the integrator passes.
 */
export const DEFAULT_DEGRADE: DegradeSettings = {
  enabled: true,
  block: 3,
  levels: 6,
  dither: true,
  grade: 0.12,
  contrast: 1.2,
  black: 0.08,
  vignette: 0.1,
  grain: 0.03,
  flicker: 0.06,
  scanlines: 0.25,
  aberration: 1,
  fps: 24,
  uniform: true,
  bob: true,
  curseVertigo: 0,
  reducedMotion: false,
};

/** A diegetic sprite the engine composites into the scene before degrading. */
export interface EngineSprite {
  img: HTMLImageElement;
  /** Centre X, fraction of width 0..1. */
  x: number;
  /** Baseline (feet) Y, fraction of height 0..1. */
  y: number;
  /** Width, fraction of stage width 0..1. */
  w: number;
  /** Animation phase offset (radians) so multiple sprites don't bob in lockstep. */
  phase: number;
  /** Levitating-trance treatment (bound invocations): slower, larger float + slight roll, and a
      dark enveloping drop-shadow. Composited BEFORE the pass, so it degrades with the frame. The
      float is dropped under `reducedMotion`; the shadow stays. */
  float?: boolean;
  /** Dark enveloping shadow — the widest cast's blur as a fraction of stage height (0 / omitted =
      none). Several stacked black casts off the silhouette build the halo that wraps the figure;
      drawn into the same buffer as the figure, so it crushes and pixelates uniformly with the rest. */
  shadow?: number;
}

/** A composed scene: one backdrop plate + any sprites + the studio ritual glow. */
export interface EngineScene {
  bg: HTMLImageElement | null;
  sprites: EngineSprite[];
  signature: boolean;
  /** Focal-vignette ink alpha (0..1): darkens the room edges so a bound figure reads as the light
      source. Drawn between the backdrop and the sprites, BEFORE the pass — so it degrades too. */
  focalVignette?: number;
}

type Phase = 'idle' | 'out' | 'in';
type Stops = ReadonlyArray<readonly [number, number, number, number]>;

const VW = 1280;
const VH = 720;

// Grimoire palette ramp, indexed by luminance 0..1: void black → blood-black →
// blood → ember → candle → gold-leaf / parchment highlight.
const PALETTE_STOPS: Stops = [
  [0.0, 0x0a, 0x08, 0x07],
  [0.16, 0x21, 0x0c, 0x0a],
  [0.36, 0x6b, 0x12, 0x15],
  [0.58, 0xa8, 0x47, 0x20],
  [0.78, 0xe2, 0x9a, 0x38],
  [1.0, 0xe9, 0xda, 0xb6],
];

// 4x4 ordered Bayer matrix, normalised to ~ -0.5..0.5.
const BAYER: number[] = (() => {
  const m = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const out: number[] = new Array(16);
  for (let y = 0; y < 4; y++) {
    const row = m[y]!;
    for (let x = 0; x < 4; x++) out[y * 4 + x] = row[x]! / 16 - 0.5;
  }
  return out;
})();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildPaletteLUT(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    let s = 0;
    while (s < PALETTE_STOPS.length - 2 && l > PALETTE_STOPS[s + 1]![0]) s++;
    const a = PALETTE_STOPS[s]!;
    const b = PALETTE_STOPS[s + 1]!;
    const t = (l - a[0]) / (b[0] - a[0] || 1);
    lut[i * 3] = lerp(a[1], b[1], t);
    lut[i * 3 + 1] = lerp(a[2], b[2], t);
    lut[i * 3 + 2] = lerp(a[3], b[3], t);
  }
  return lut;
}

const PAL_LUT = buildPaletteLUT();

export class DegradePass {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly crisp: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  private readonly low: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  // Reusable full-res scratch canvas for the Fausto-curse "Vertigo" layer (snapshot the finished
  // frame, then redraw it swayed / doubled). Allocated once; only touched while the curse is active.
  private readonly tmp: HTMLCanvasElement;
  private readonly tctx: CanvasRenderingContext2D;

  private s: DegradeSettings = { ...DEFAULT_DEGRADE };
  private scene: EngineScene = { bg: null, sprites: [], signature: false };

  // Room-change transition: fade out to black, swap, fade back in.
  private _fade = 0; // 0 = clear, 1 = full black
  private _phase: Phase = 'idle';
  private _pending: EngineScene | null = null;

  private _lastBlock = -1;
  private _t0 = performance.now();
  private _lastT = performance.now();
  private _prev = 0;
  private _acc = 0;
  private _raf: number | null = null;

  // Eased curse intensity 0..1 — animation state, NOT a setting. Ramps toward `s.curseVertigo` each
  // rendered frame so the effect fades in/out rather than snapping when the flag flips.
  private _curse = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = VW;
    canvas.height = VH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('DegradePass: 2D context unavailable');
    this.ctx = ctx;

    this.crisp = document.createElement('canvas');
    this.crisp.width = VW;
    this.crisp.height = VH;
    this.cctx = this.crisp.getContext('2d')!;

    this.low = document.createElement('canvas');
    this.lctx = this.low.getContext('2d')!;

    this.tmp = document.createElement('canvas');
    this.tmp.width = VW;
    this.tmp.height = VH;
    this.tctx = this.tmp.getContext('2d')!;
  }

  /** Merge a partial recipe and repaint a frame immediately. */
  set(partial: Partial<DegradeSettings>): void {
    Object.assign(this.s, partial);
    this.renderSafe();
  }

  /**
   * Swap the composed scene. When `animate` is true and a scene is already
   * showing, the current room fades out to black, the scene swaps at full
   * black, then fades back in — the room-change curtain.
   */
  setScene(scene: EngineScene, animate: boolean): void {
    if (animate && this.scene.bg) {
      this._pending = scene;
      this._phase = 'out';
    } else {
      this.scene = scene;
      this._fade = 0;
      this._phase = 'idle';
      this._pending = null;
    }
    this.renderSafe();
  }

  /** Paint one frame now, even if the rAF loop is throttled (backgrounded tab). */
  renderSafe(): void {
    try {
      this.render(performance.now());
    } catch {
      /* images may not be decoded yet; the loop catches up */
    }
  }

  start(): void {
    this.renderSafe();
    if (this._raf === null) this._raf = requestAnimationFrame(this._loop);
  }

  stop(): void {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  private _loop = (now: number): void => {
    this._raf = requestAnimationFrame(this._loop);
    const fps = Math.max(4, this.s.fps);
    const interval = 1000 / fps;
    this._acc += now - (this._prev || now);
    this._prev = now;
    if (this._acc < interval) return;
    this._acc = Math.min(this._acc - interval, interval);
    this.render(now);
  };

  private _ensureLow(): void {
    const block = Math.max(1, Math.round(this.s.block));
    if (block === this._lastBlock) return;
    this._lastBlock = block;
    this.low.width = Math.max(2, Math.round(VW / block));
    this.low.height = Math.max(2, Math.round(VH / block));
  }

  private _drawScene(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    scene: EngineScene,
    t: number,
    withSprites: boolean,
  ): void {
    ctx.clearRect(0, 0, w, h);
    if (scene.bg && scene.bg.complete && scene.bg.naturalWidth) {
      ctx.drawImage(scene.bg, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0a0807';
      ctx.fillRect(0, 0, w, h);
    }
    // Studio "panvitium" signature — the window burns red while the ritual runs.
    if (scene.signature) {
      const g = ctx.createRadialGradient(0.12 * w, 0.42 * h, 0, 0.12 * w, 0.42 * h, 0.5 * w);
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
      g.addColorStop(0, `rgba(198,28,30,${0.42 + 0.28 * pulse})`);
      g.addColorStop(0.5, 'rgba(120,14,18,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // Focal vignette — dim the room around a bound figure so it reads as the light source. Drawn
    // before the sprites (which sit ON the light) and before the pass, so it crushes with the frame.
    if (scene.focalVignette && scene.focalVignette > 0) {
      const a = scene.focalVignette;
      const g = ctx.createRadialGradient(
        0.49 * w,
        0.44 * h,
        0.18 * w,
        0.49 * w,
        0.44 * h,
        0.72 * w,
      );
      g.addColorStop(0, 'rgba(2,1,1,0)');
      g.addColorStop(0.36, 'rgba(2,1,1,0)');
      g.addColorStop(1, `rgba(2,1,1,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (!withSprites) return;
    for (const sp of scene.sprites) {
      const img = sp.img;
      if (!img.complete || !img.naturalWidth) continue;
      const drawW = sp.w * w;
      const drawH = drawW * (img.naturalHeight / img.naturalWidth);
      // Idle motion so a sprite animates THROUGH the pass. A bound figure (`float`) levitates on a
      // slower, larger cadence with a faint roll; ordinary creatures get the gentle bob/breathe.
      const floatStill = sp.float === true && this.s.reducedMotion;
      const motion = this.s.bob && !floatStill;
      let bob = 0;
      let breathe = 1;
      let roll = 0;
      if (motion && sp.float) {
        bob = Math.sin(t * 0.97 + sp.phase) * 0.016 * h;
        breathe = 1 + Math.sin(t * 0.8 + sp.phase) * 0.01;
        roll = Math.sin(t * 0.5 + sp.phase) * 0.01;
      } else if (motion) {
        bob = Math.sin(t * 1.6 + sp.phase) * 0.006 * h;
        breathe = 1 + Math.sin(t * 1.1 + sp.phase) * 0.012;
      }
      const cx = sp.x * w;
      const baseY = sp.y * h + bob;
      const dw = drawW * breathe;
      const dh = drawH * breathe;
      const dx = cx - dw / 2;
      const dy = baseY - dh;
      ctx.save();
      if (roll) {
        const my = baseY - dh / 2;
        ctx.translate(cx, my);
        ctx.rotate(roll);
        ctx.translate(-cx, -my);
      }
      // Enveloping shadow — several stacked black casts off the silhouette (mirroring the original
      // stacked drop-shadows): each pass deepens the dark halo wrapping the figure. It lives in the
      // scene buffer, so it crushes/pixelates with the frame, and is distinct from the room's focal
      // vignette (which dims the whole altar). A single soft cast washes out on the dark plate.
      if (sp.shadow && sp.shadow > 0) {
        ctx.shadowColor = 'rgba(0,0,0,1)';
        ctx.shadowOffsetY = 0.015 * h;
        for (const f of [1, 0.6, 0.35]) {
          ctx.shadowBlur = sp.shadow * h * f;
          ctx.drawImage(img, dx, dy, dw, dh);
        }
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }
  }

  render(now?: number): void {
    const tnow = now ?? performance.now();
    const t = (tnow - this._t0) / 1000;
    const ctx = this.ctx;
    const s = this.s;

    // --- advance the fade-to-black room transition ---
    const dt = Math.min(0.1, (tnow - (this._lastT || tnow)) / 1000);
    this._lastT = tnow;

    // --- ease the Fausto-curse "Vertigo" intensity toward its target (~0.7s each way) ---
    const curseTarget = Math.max(0, Math.min(1, s.curseVertigo));
    const curseRate = dt / 0.7;
    const curseDelta = curseTarget - this._curse;
    this._curse += Math.sign(curseDelta) * Math.min(curseRate, Math.abs(curseDelta));

    const FADE_RATE = 1 / 0.4; // ~0.4s each way
    if (this._phase === 'out') {
      this._fade += dt * FADE_RATE;
      if (this._fade >= 1) {
        this._fade = 1;
        if (this._pending) {
          this.scene = this._pending;
          this._pending = null;
        }
        this._phase = 'in';
      }
    } else if (this._phase === 'in') {
      this._fade -= dt * FADE_RATE;
      if (this._fade <= 0) {
        this._fade = 0;
        this._phase = 'idle';
      }
    }

    // crisp full-res composite (used when the pass is disabled)
    this._drawScene(this.cctx, VW, VH, this.scene, t, true);

    if (!s.enabled) {
      ctx.clearRect(0, 0, VW, VH);
      ctx.drawImage(this.crisp, 0, 0);
      this._postChrome(ctx, t, false);
      if (this._curse > 0.001) this._dizzy(ctx, t, this._curse);
      this._drawFade(ctx);
      return;
    }

    // --- 1. PIXELATION: composite scene into the low-res buffer ---
    this._ensureLow();
    const lw = this.low.width;
    const lh = this.low.height;
    const lctx = this.lctx;
    lctx.imageSmoothingEnabled = true;
    // uniform: sprites share the bg's downsample. Off: bg degraded, sprites crisp
    // on top (the mismatched-fidelity failure mode).
    this._drawScene(lctx, lw, lh, this.scene, t, s.uniform);

    // --- 2–5. tone curve, posterise, palette grade, grain, flicker ---
    const img = lctx.getImageData(0, 0, lw, lh);
    this._processPixels(img, t);
    lctx.putImageData(img, 0, 0);

    // --- 6. upscale nearest-neighbour for crisp blocks ---
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, VW, VH);
    ctx.drawImage(this.low, 0, 0, lw, lh, 0, 0, VW, VH);

    if (!s.uniform) {
      ctx.imageSmoothingEnabled = true;
      const tmp = document.createElement('canvas');
      tmp.width = VW;
      tmp.height = VH;
      const tctx = tmp.getContext('2d')!;
      const spriteOnly: EngineScene = { bg: null, sprites: this.scene.sprites, signature: false };
      this._drawScene(tctx, VW, VH, spriteOnly, t, true);
      ctx.drawImage(tmp, 0, 0);
    }

    this._postChrome(ctx, t, true);
    if (this._curse > 0.001) this._dizzy(ctx, t, this._curse);
    this._drawFade(ctx);
  }

  /**
   * The Fausto-curse "Vertigo" layer (design handoff). An additive pass on top of the finished frame,
   * driven by one eased scalar `c` (0 = clean, 1 = full curse): the room sways and breathes, vision
   * doubles, a queasy chromatic split pulses, and the vignette closes to a tunnel — the malediction
   * given a body. When the curse is inactive (`c ≈ 0`) this never runs, so the frame is byte-for-byte
   * the normal look. Pure canvas math over the existing plates; touches no state, RNG, or save.
   *
   * Accessibility: under `prefers-reduced-motion: reduce` (`s.reducedMotion`) the vestibular
   * sub-effects (sway / zoom / double-vision / pulse) are skipped and only a steady tunnel vignette
   * remains, so the curse still registers without inducing motion sickness.
   */
  private _dizzy(ctx: CanvasRenderingContext2D, t: number, c: number): void {
    if (this.s.reducedMotion) {
      // Reduced motion: no positional motion — a steady tunnel vignette only (no breathing pulse).
      const inner = VH * (0.5 - 0.12 * c);
      const g = ctx.createRadialGradient(VW / 2, VH * 0.48, inner, VW / 2, VH / 2, VH * 0.92);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(2,1,1,${0.55 * c})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
      return;
    }

    const tmp = this.tmp;
    const tctx = this.tctx;
    tctx.clearRect(0, 0, VW, VH);
    tctx.drawImage(this.canvas, 0, 0); // snapshot the finished frame

    // --- 1. lens sway + tiny roll + breathing zoom ---
    const swayX = Math.sin(t * 0.8) * 34 * c;
    const swayY = Math.cos(t * 0.62) * 20 * c;
    const rot = Math.sin(t * 0.5) * 0.016 * c;
    const zoom = 1 + (Math.sin(t * 1.3) * 0.5 + 0.5) * 0.03 * c;

    ctx.clearRect(0, 0, VW, VH);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH); // black behind the swayed frame
    ctx.save();
    ctx.translate(VW / 2 + swayX, VH / 2 + swayY);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-VW / 2, -VH / 2);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();

    // --- 2. double-vision ghost, orbiting slowly (screen blend) ---
    const ox = Math.cos(t * 0.9) * 16 * c;
    const oy = Math.sin(t * 0.9) * 10 * c;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.013 + 0.3 * c;
    ctx.drawImage(tmp, ox, oy);
    ctx.drawImage(tmp, -ox, -oy);
    ctx.restore();

    // --- 3. queasy chromatic split, pulsing ---
    const ab = 2 + 7 * c * (0.6 + 0.4 * Math.sin(t * 2.1));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.12 * c;
    ctx.drawImage(tmp, -ab, 0);
    ctx.drawImage(tmp, ab, 0);
    ctx.restore();

    // --- 4. tunnel-vision vignette, breathing inward ---
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
    const inner = VH * (0.5 - 0.18 * c * (0.55 + 0.45 * pulse));
    const g = ctx.createRadialGradient(VW / 2, VH * 0.48, inner, VW / 2, VH / 2, VH * 0.92);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(2,1,1,${0.55 * c})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  private _processPixels(img: ImageData, t: number): void {
    const s = this.s;
    const d = img.data;
    const w = img.width;
    const levels = Math.max(2, Math.round(s.levels));
    const step = 255 / (levels - 1);
    const grade = s.grade;
    const contrast = s.contrast;
    const black = s.black;
    const dither = s.dither;
    const flick = 1 + s.flicker * (0.6 * Math.sin(t * 9.3) + 0.4 * Math.sin(t * 3.1 + 1.7)) * 0.5;
    const grainAmt = s.grain * 255;
    const cr = 1 + black * 2.2;

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const a = d[i + 3]!;
      if (a === 0) continue;
      let r = d[i]!;
      let g = d[i + 1]!;
      let b = d[i + 2]!;

      // tone curve: contrast about mid, then crush toward the black floor
      r = (r / 255 - 0.5) * contrast + 0.5;
      g = (g / 255 - 0.5) * contrast + 0.5;
      b = (b / 255 - 0.5) * contrast + 0.5;
      r = Math.pow(Math.max(0, r), cr) * flick * 255;
      g = Math.pow(Math.max(0, g), cr) * flick * 255;
      b = Math.pow(Math.max(0, b), cr) * flick * 255;

      // palette grade — blend toward the grimoire ramp by luminance
      if (grade > 0) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
        const li = lum < 0 ? 0 : lum > 255 ? 255 : lum;
        r = r * (1 - grade) + PAL_LUT[li * 3]! * grade;
        g = g * (1 - grade) + PAL_LUT[li * 3 + 1]! * grade;
        b = b * (1 - grade) + PAL_LUT[li * 3 + 2]! * grade;
      }

      // ordered dither offset before quantisation
      if (dither) {
        const bx = (p % w) & 3;
        const by = ((p / w) | 0) & 3;
        const dd = BAYER[by * 4 + bx]! * step;
        r += dd;
        g += dd;
        b += dd;
      }

      if (grainAmt) {
        const n = (Math.random() - 0.5) * grainAmt;
        r += n;
        g += n;
        b += n;
      }

      // posterise (colour-depth crush)
      d[i] = Math.round(r / step) * step;
      d[i + 1] = Math.round(g / step) * step;
      d[i + 2] = Math.round(b / step) * step;
    }
  }

  // Scanlines, chromatic aberration, vignette — applied at display resolution.
  private _postChrome(ctx: CanvasRenderingContext2D, _t: number, doScan: boolean): void {
    const s = this.s;

    if (doScan && s.aberration > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.18;
      ctx.drawImage(this.canvas, -s.aberration, 0);
      ctx.drawImage(this.canvas, s.aberration, 0);
      ctx.restore();
    }

    if (doScan && s.scanlines > 0.01) {
      ctx.save();
      ctx.globalAlpha = s.scanlines;
      ctx.fillStyle = '#000';
      for (let y = 0; y < VH; y += 3) ctx.fillRect(0, y, VW, 1);
      ctx.restore();
    }

    if (s.vignette > 0.01) {
      const g = ctx.createRadialGradient(VW / 2, VH * 0.46, VH * 0.32, VW / 2, VH / 2, VH * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${s.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  // The room-change curtain: pure black over everything (incl. grain + chrome).
  private _drawFade(ctx: CanvasRenderingContext2D): void {
    if (this._fade > 0.001) {
      ctx.fillStyle = `rgba(0,0,0,${this._fade})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }
}
