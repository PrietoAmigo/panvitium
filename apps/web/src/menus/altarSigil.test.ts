/**
 * The altar sigil's motion ("Altar sigil" handoff), sampled for the degradation pass: the design's
 * CSS keyframes (vibration, pulse, the darker red glow) and transitions, reproduced as numbers the
 * canvas can paint. These pin the keyframe values, the CSS timing semantics, and reduced motion.
 */
import { describe, it, expect } from 'vitest';
import {
  EASE,
  EASE_IN_OUT,
  cubicBezier,
  glowColor,
  retarget,
  sampleAltarSigil,
  settled,
  tweenAt,
} from './altarSigil.js';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('cubicBezier (CSS timing functions)', () => {
  it('pins both ends and reduces to the identity on the linear curve', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const p of [0, 0.1, 0.37, 0.5, 0.9, 1]) expect(linear(p)).toBeCloseTo(p, 6);
    expect(EASE(0)).toBe(0);
    expect(EASE(1)).toBe(1);
  });

  it('matches the browser curves: `ease` is ~80% done halfway; `ease-in-out` is symmetric', () => {
    expect(EASE(0.5)).toBeCloseTo(0.8024, 3);
    expect(EASE_IN_OUT(0.5)).toBeCloseTo(0.5, 6);
    expect(EASE_IN_OUT(0.25) + EASE_IN_OUT(0.75)).toBeCloseTo(1, 6);
    expect(EASE_IN_OUT(0.25)).toBeLessThan(0.25); // eases in
  });
});

describe('sampleAltarSigil — idle (kat-seal-vibe / -pulse / -breathe)', () => {
  it('starts at the first keyframes: still, scale .97, the resting glow', () => {
    const p = sampleAltarSigil('idle', 0);
    expect(p.dx).toBe(0);
    expect(p.dy).toBe(0);
    expect(p.rot).toBe(0);
    expect(p.scale).toBeCloseTo(0.97, 6);
    expect(p.glow[0].blur).toBeCloseTo(12, 6);
    expect(p.glow[1].blur).toBeCloseTo(28, 6);
    // The handoff's darker red, not the prior gate's orange.
    expect(glowColor(p.glow[0])).toBe('rgba(215,50,30,0.8)');
    expect(glowColor(p.glow[1])).toBe('rgba(195,35,22,0.4)');
  });

  it('swells to scale 1.05 and the full glow halfway through its 3.4 s breath', () => {
    const p = sampleAltarSigil('idle', 1.7);
    expect(p.scale).toBeCloseTo(1.05, 6);
    expect(p.glow[0].blur).toBeCloseTo(24, 6);
    expect(p.glow[1].blur).toBeCloseTo(50, 6);
    expect(glowColor(p.glow[0])).toBe('rgba(230,70,42,1)');
    expect(glowColor(p.glow[1])).toBe('rgba(205,45,28,0.75)');
    // …and is back at rest when the breath closes.
    expect(sampleAltarSigil('idle', 3.4).scale).toBeCloseTo(0.97, 6);
  });

  it('shivers through the 0.12 s vibration keyframes, linear between them', () => {
    const at10 = sampleAltarSigil('idle', 0.012); // 10%
    expect(at10.dx).toBeCloseTo(-3, 4);
    expect(at10.dy).toBeCloseTo(2, 4);
    expect(at10.rot).toBeCloseTo(deg(-1.4), 4);
    const at15 = sampleAltarSigil('idle', 0.018); // halfway from 10% to 20%
    expect(at15.dx).toBeCloseTo(0, 4); // (-3 + 3) / 2
    expect(at15.dy).toBeCloseTo(0, 4); // (2 - 2) / 2
    // It loops: one period later, the same shiver.
    const later = sampleAltarSigil('idle', 0.012 + 0.12 * 7);
    expect(later.dx).toBeCloseTo(at10.dx, 4);
    expect(later.dy).toBeCloseTo(at10.dy, 4);
  });
});

describe('sampleAltarSigil — armed (the -armed / -strong keyframes)', () => {
  it('grows to 1.55–1.78 over a 1 s pulse with the hotter glow', () => {
    const start = sampleAltarSigil('armed', 0);
    expect(start.scale).toBeCloseTo(1.55, 6);
    expect(start.glow[0].blur).toBeCloseTo(28, 6);
    expect(start.glow[1].blur).toBeCloseTo(64, 6);
    const peak = sampleAltarSigil('armed', 0.5);
    expect(peak.scale).toBeCloseTo(1.78, 6);
    expect(peak.glow[0].blur).toBeCloseTo(46, 6);
    expect(peak.glow[1].blur).toBeCloseTo(110, 6);
    expect(glowColor(peak.glow[1])).toBe('rgba(215,50,30,0.95)');
  });

  it('shakes much harder, on a 0.07 s cycle', () => {
    const at8 = sampleAltarSigil('armed', 0.07 * 0.08);
    expect(at8.dx).toBeCloseTo(-9, 4);
    expect(at8.dy).toBeCloseTo(5, 4);
    expect(at8.rot).toBeCloseTo(deg(-3.6), 4);
    const at60 = sampleAltarSigil('armed', 0.07 * 0.6);
    expect(at60.dx).toBeCloseTo(-12, 4);
    expect(at60.rot).toBeCloseTo(deg(-4), 4);
  });
});

describe('sampleAltarSigil — reduced motion', () => {
  it('drops the vibration and the pulse, holding the static glow of the first keyframe', () => {
    for (const t of [0, 0.013, 0.9, 1.7, 2.6]) {
      const idle = sampleAltarSigil('idle', t, true);
      expect([idle.dx, idle.dy, idle.rot]).toEqual([0, 0, 0]);
      expect(idle.scale).toBeCloseTo(0.97, 6);
      expect(idle.glow[0].blur).toBeCloseTo(12, 6);
      const armed = sampleAltarSigil('armed', t, true);
      expect([armed.dx, armed.dy, armed.rot]).toEqual([0, 0, 0]);
      // Still visibly armed: larger, with the armed glow.
      expect(armed.scale).toBeCloseTo(1.55, 6);
      expect(armed.glow[1].blur).toBeCloseTo(64, 6);
    }
  });
});

describe('tweens (the fade and the pointer feedback, CSS-style)', () => {
  it('runs from → to over its duration, eased, and holds at the ends', () => {
    const tw = retarget(settled(0), 1, 10, 0.5, EASE);
    expect(tweenAt(tw, 9)).toBe(0);
    expect(tweenAt(tw, 10)).toBe(0);
    expect(tweenAt(tw, 10.25)).toBeCloseTo(EASE(0.5), 6);
    expect(tweenAt(tw, 10.5)).toBe(1);
    expect(tweenAt(tw, 99)).toBe(1);
  });

  it('restarts mid-flight from where the value is, and keeps running on an unchanged target', () => {
    const up = retarget(settled(1), 1.06, 0, 0.28, EASE);
    const mid = tweenAt(up, 0.14);
    const down = retarget(up, 0.95, 0.14, 0.28, EASE);
    expect(down.from).toBeCloseTo(mid, 9);
    expect(tweenAt(down, 0.14)).toBeCloseTo(mid, 9);
    expect(tweenAt(down, 0.42)).toBe(0.95);
    expect(retarget(down, 0.95, 0.2, 0.28, EASE)).toBe(down);
  });
});
