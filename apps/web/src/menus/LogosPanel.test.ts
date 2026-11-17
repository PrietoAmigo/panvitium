/**
 * Render smoke tests for the Chthonic Logos drawn as the player's mind (Obsessio). These pin the
 * wiring the redesign introduced: the scroll is a self-framed dialog with a close affordance and
 * no visible title, each rite is a thought-button with its echo trail, the active rite lights its
 * echoes with progress and speaks its status line, a sealed rite shows only echoes of its seal-name
 * plus its Sin gate and cannot be spoken, dwelling on a rite recedes the others and makes the
 * drifting thoughts louder, and the overlay / close / Esc all dismiss. The store wiring and the
 * action/cost math live in their own suites; this component is purely presentational.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { strings } from '@panvitium/shared';
import { LogosPanel, type LogosActionView } from './LogosPanel.js';
import {
  buildLogosThoughts,
  logosEchoes,
  logosPathKeyframes,
  logosSlitherKeyframes,
  logosSlitherName,
  logosSlitherTilt,
  logosVertebrae,
  sampleLogosPath,
  LOGOS_ECHO_COUNT,
  LOGOS_ENTRANCE,
  LOGOS_FIELD_DIM,
  LOGOS_LATIN,
  LOGOS_PATHS,
  LOGOS_PATH_COUNT,
  LOGOS_PATH_STEPS,
  LOGOS_RETURN,
  LOGOS_SERPENT,
  LOGOS_SLITHER_STEPS,
  LOGOS_SWAY_LEVELS,
  LOGOS_THOUGHT_COUNT,
} from './logosThoughts.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

interface Spy {
  fn: () => void;
  calls: number;
}
function spy(): Spy {
  const s: Spy = { calls: 0, fn: () => {} };
  s.fn = () => {
    s.calls += 1;
  };
  return s;
}

function baseAction(over: Partial<LogosActionView>): LogosActionView {
  return {
    id: 'suggestion',
    name: 'Suggestion',
    quote: 'A word left where a thought will find it.',
    cost: '1 Influence · 1s',
    cta: 'Speak',
    status: 'A word is being left…',
    locked: false,
    active: false,
    progress: 0,
    disabled: false,
    onTempt: () => {},
    ...over,
  };
}

const THREE: LogosActionView[] = [
  baseAction({ id: 'suggestion' }),
  baseAction({ id: 'logismoi', name: 'Logismoi', cta: 'Infiltrate' }),
  baseAction({ id: 'imperium', name: 'Imperium', cta: 'Command' }),
];

function render(props: { actions: LogosActionView[]; onClose: () => void }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(LogosPanel, {
        title: 'Chthonic Logos',
        closeLabel: 'Close the scroll',
        actions: props.actions,
        onClose: props.onClose,
      }),
    );
  });
}

function rows(): HTMLElement[] {
  return Array.from(container!.querySelectorAll<HTMLElement>('.logos-row'));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

describe('Chthonic Logos (Obsessio)', () => {
  it('renders a labelled dialog with one thought per temptation and no visible title', () => {
    render({ actions: THREE, onClose: () => {} });
    const dialog = container!.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Chthonic Logos');
    expect(rows().length).toBe(3);
    // The title is the dialog's accessible name only; no heading or maxim is drawn.
    expect(container!.querySelector('h1, h2')).toBeNull();
    expect(container!.textContent).not.toContain('Veritatis');
    // Each rite carries its full echo trail behind the word, hidden from assistive tech.
    for (const row of rows()) {
      const echoes = row.querySelectorAll('.logos-echo');
      expect(echoes.length).toBe(LOGOS_ECHO_COUNT);
      expect(Array.from(echoes).every((e) => e.getAttribute('aria-hidden') === 'true')).toBe(true);
    }
  });

  it('names each thought-button with its verb, rite and cost, and shows the verb and cost', () => {
    render({ actions: THREE, onClose: () => {} });
    const first = rows()[0]!;
    expect(first.querySelector('.logos-act')?.getAttribute('aria-label')).toBe(
      'Speak: Suggestion, 1 Influence · 1s',
    );
    expect(first.querySelector('.logos-cta')?.textContent).toBe('Speak');
    expect(first.querySelector('.logos-cost')?.textContent).toBe('1 Influence · 1s');
    expect(first.querySelector('.logos-line')?.textContent).toBe(
      'A word left where a thought will find it.',
    );
  });

  it('lights the active rite echo by echo with progress and speaks its status line', () => {
    render({
      actions: [
        baseAction({ id: 'suggestion', active: true, progress: 50, disabled: true }),
        baseAction({ id: 'logismoi', name: 'Logismoi', disabled: true }),
      ],
      onClose: () => {},
    });
    const [active, other] = rows();
    expect(active!.classList.contains('logos-row--active')).toBe(true);
    // Half the rite spoken: half the echoes have caught the light.
    expect(active!.querySelectorAll('.logos-echo--lit').length).toBe(LOGOS_ECHO_COUNT / 2);
    expect(other!.querySelectorAll('.logos-echo--lit').length).toBe(0);
    // The status replaces the maxim while the rite is underway.
    const line = active!.querySelector('.logos-line');
    expect(line?.classList.contains('logos-line--status')).toBe(true);
    expect(line?.textContent).toContain('A word is being left');
    // The spoken rite holds the focus: the others recede and the pressure rises.
    expect(other!.classList.contains('logos-row--receded')).toBe(true);
    // Waiting on another rite is not the same as wanting influence.
    expect(other!.classList.contains('logos-row--wanting')).toBe(false);
    expect(container!.querySelector('.logos-press--spoken')).not.toBeNull();
    // The drifting thoughts take no part: the field is as it is at rest.
    expect(container!.querySelector('.logos-drift')!.className).toBe('logos-drift');
  });

  it('renders a locked rite as sealed: echoes of its seal-name, the gate, and no speaking', () => {
    const tempt = spy();
    render({
      actions: [
        baseAction({ id: 'suggestion' }),
        baseAction({
          id: 'imperium',
          name: 'Xherum Oneytan',
          quote: '...ut nescias quod petat.',
          locked: true,
          disabled: true,
          lockLabel: 'Requires Any Sin III',
          onTempt: tempt.fn,
        }),
      ],
      onClose: () => {},
    });
    const sealed = container!.querySelector('.logos-row--locked')!;
    expect(sealed).not.toBeNull();
    expect(sealed.querySelector('.logos-name')?.textContent).toBe('Xherum Oneytan');
    expect(sealed.querySelector('.logos-echo')?.textContent).toBe('Xherum Oneytan');
    expect(sealed.querySelector('.logos-gate')?.textContent).toBe('Requires Any Sin III');
    // A sealed rite offers no verb, cost or controls, and its thought cannot be spoken.
    expect(sealed.querySelector('.logos-meta')).toBeNull();
    const btn = sealed.querySelector('.logos-act') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Xherum Oneytan. Requires Any Sin III');
    act(() => btn.click());
    expect(tempt.calls).toBe(0);
  });

  it('marks a rite the player cannot afford as wanting, and it cannot be spoken', () => {
    const tempt = spy();
    render({
      actions: [baseAction({ id: 'suggestion', disabled: true, onTempt: tempt.fn })],
      onClose: () => {},
    });
    const row = rows()[0]!;
    expect(row.classList.contains('logos-row--wanting')).toBe(true);
    act(() => (row.querySelector('.logos-act') as HTMLButtonElement).click());
    expect(tempt.calls).toBe(0);
  });

  it('fires the real action when an open thought is clicked', () => {
    const tempt = spy();
    render({ actions: [baseAction({ id: 'suggestion', onTempt: tempt.fn })], onClose: () => {} });
    act(() => (container!.querySelector('.logos-act') as HTMLButtonElement).click());
    expect(tempt.calls).toBe(1);
  });

  it('dwelling on a rite spreads its echoes and recedes the others, leaving the thoughts alone', () => {
    render({ actions: THREE, onClose: () => {} });
    const field = (): string => container!.querySelector('.logos-drift')!.outerHTML;
    const resting = field();
    const [first, second] = rows();
    const restingSpread = first!.querySelector<HTMLElement>('.logos-echo')!.style.transform;
    act(() => {
      first!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(first!.classList.contains('logos-row--held')).toBe(true);
    expect(second!.classList.contains('logos-row--receded')).toBe(true);
    expect(field()).toBe(resting);
    expect(first!.querySelector<HTMLElement>('.logos-echo')!.style.transform).not.toBe(
      restingSpread,
    );
    act(() => {
      first!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(first!.classList.contains('logos-row--held')).toBe(false);
    expect(field()).toBe(resting);
  });

  it('keeps the drifting thoughts exactly as they are while a rite is spoken', () => {
    render({ actions: THREE, onClose: () => {} });
    const field = (): string => container!.querySelector('.logos-drift')!.outerHTML;
    const resting = field();
    const speak = (progress: number): void => {
      act(() => {
        root!.render(
          createElement(LogosPanel, {
            title: 'Chthonic Logos',
            closeLabel: 'Close the scroll',
            actions: [
              baseAction({ id: 'suggestion', active: true, progress, disabled: true }),
              ...THREE.slice(1).map((a) => ({ ...a, disabled: true })),
            ],
            onClose: () => {},
          }),
        );
      });
    };
    speak(10);
    expect(container!.querySelector('.logos-row--active')).not.toBeNull();
    expect(field()).toBe(resting);
    speak(90);
    expect(field()).toBe(resting);
    // Its fixed faintness rides each fragment's colour, never an opacity on the field.
    const drift = container!.querySelector<HTMLElement>('.logos-drift')!;
    expect(drift.style.opacity).toBe('');
    const t = buildLogosThoughts()[0]!;
    const alpha = Math.round(t.opacity * LOGOS_FIELD_DIM * 1000) / 1000;
    expect(container!.querySelector<HTMLElement>('.logos-mote')!.style.color).toContain(
      `, ${alpha})`,
    );
  });

  it('carries the delegation controls beside an open rite', () => {
    render({
      actions: [
        baseAction({
          id: 'suggestion',
          delegation: createElement('span', { className: 'probe' }, 'controls'),
        }),
      ],
      onClose: () => {},
    });
    expect(container!.querySelector('.logos-meta .logos-deleg .probe')).not.toBeNull();
  });

  it('dismisses on the overlay, the close button and Esc, but not on the stage', () => {
    const close = spy();
    render({ actions: [baseAction({})], onClose: close.fn });

    const stage = container!.querySelector('.logos-stage') as HTMLElement;
    act(() => stage.click());
    expect(close.calls).toBe(0); // clicking the mind itself must not close it

    act(() => (container!.querySelector('.logos-close') as HTMLButtonElement).click());
    expect(close.calls).toBe(1);

    act(() => (container!.querySelector('.logos-overlay') as HTMLElement).click());
    expect(close.calls).toBe(2);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(close.calls).toBe(3);
  });

  it('draws the drifting thoughts behind the rites, hidden from assistive tech', () => {
    render({ actions: THREE, onClose: () => {} });
    const drift = container!.querySelector('.logos-drift')!;
    expect(drift.getAttribute('aria-hidden')).toBe('true');
    expect(drift.querySelectorAll('.logos-mote').length).toBe(LOGOS_THOUGHT_COUNT);
    // The drift's keyframes ship with the panel.
    expect(container!.querySelector('style')?.textContent).toContain('@keyframes logos-path-1');
  });

  it('draws every thought as a serpent: one vertebra per letter, still reading as its text', () => {
    render({ actions: THREE, onClose: () => {} });
    const field = buildLogosThoughts();
    const motes = Array.from(container!.querySelectorAll<HTMLElement>('.logos-mote'));
    expect(motes.length).toBe(field.length);
    motes.forEach((mote, i) => {
      const t = field[i]!;
      expect(mote.textContent).toBe(t.text);
      // Its presence sits between it and its anchor (no flicker wrapper), on the same round.
      const presence = mote.parentElement!;
      expect(presence.className).toBe('logos-presence');
      expect(presence.parentElement?.className).toBe('logos-thought');
      for (const el of [presence, mote]) {
        expect(el.style.animationDuration).toBe(`${t.cycle}s`);
        expect(el.style.animationDelay).toBe(`${t.enter}s`);
      }
      expect(presence.style.animationTimingFunction).toBe(t.presenceEasing);
      expect(mote.style.animationTimingFunction).toBe(t.driftEasing);
      const vertebrae = Array.from(mote.querySelectorAll<HTMLElement>('.logos-vertebra'));
      expect(vertebrae.length).toBe(Array.from(t.text).length);
      vertebrae.forEach((el, k) => {
        const v = t.vertebrae[k]!;
        // Its wave and nothing else: the thoughts neither fade nor flicker.
        expect(el.style.animationName).toBe(v.keyframes);
        expect(el.style.animationDuration).toBe(`${t.slither}s`);
        expect(el.style.animationDelay).toBe(`${v.delay}s`);
      });
    });
    expect(container!.querySelector('.logos-flicker')).toBeNull();
    // Every set a vertebra names ships with the panel.
    const css = container!.querySelector('style')?.textContent ?? '';
    const named = new Set(field.flatMap((t) => t.vertebrae.map((v) => v.keyframes)));
    for (const name of named) expect(css).toContain(`@keyframes ${name}{`);
  });

  it('animates nothing under a live blur filter or a faded wrapper (both cost a pass per frame)', () => {
    render({
      actions: [
        baseAction({ id: 'suggestion', active: true, progress: 40, disabled: true }),
        baseAction({ id: 'imperium', name: 'Xherum Oneytan', locked: true, disabled: true }),
      ],
      onClose: () => {},
    });
    const styled = Array.from(
      container!.querySelectorAll<HTMLElement>('.logos-thought, .logos-thought *, .logos-echo'),
    );
    expect(styled.length).toBeGreaterThan(LOGOS_THOUGHT_COUNT);
    for (const el of styled) {
      expect(el.style.filter).toBe('');
      expect(el.style.opacity).toBe('');
    }
    // Softness is drawn as a text-shadow over a clear fill instead.
    const soft = buildLogosThoughts().filter((t) => t.blur > 0).length;
    const motes = Array.from(container!.querySelectorAll<HTMLElement>('.logos-mote'));
    expect(motes.filter((m) => m.style.textShadow !== '').length).toBe(soft);
    const echo = container!.querySelector<HTMLElement>('.logos-echo')!;
    expect(echo.style.textShadow.toLowerCase()).toContain('currentcolor');
  });
});

describe('Chthonic Logos thoughts', () => {
  it('builds the same field from the same seed, and a different one from another', () => {
    const a = buildLogosThoughts();
    expect(buildLogosThoughts()).toEqual(a);
    expect(buildLogosThoughts(LOGOS_THOUGHT_COUNT, 'another')).not.toEqual(a);
  });

  it('mixes the untranslated Latin with the English fragments from the strings table', () => {
    const texts = buildLogosThoughts().map((t) => t.text);
    const english = strings.opera.logosThoughts;
    expect(texts.some((t) => LOGOS_LATIN.includes(t))).toBe(true);
    expect(texts.some((t) => english.includes(t))).toBe(true);
    expect(texts.every((t) => LOGOS_LATIN.includes(t) || english.includes(t))).toBe(true);
  });

  it('varies heading, size, opacity and speed within readable bounds', () => {
    const field = buildLogosThoughts();
    for (const t of field) {
      expect(Math.abs(t.rotate)).toBeLessThanOrEqual(75);
      expect(t.path).toBeGreaterThanOrEqual(1);
      expect(t.path).toBeLessThanOrEqual(LOGOS_PATH_COUNT);
      expect(t.fontSize).toBeGreaterThanOrEqual(9);
      expect(t.fontSize).toBeLessThanOrEqual(140);
      expect(t.opacity).toBeGreaterThan(0);
      expect(t.opacity).toBeLessThanOrEqual(0.22);
      expect(t.duration).toBeGreaterThanOrEqual(14);
      expect(t.duration).toBeLessThanOrEqual(220);
    }
    // Not parallel, not uniform: the field spreads across headings, sizes and speeds.
    expect(new Set(field.map((t) => t.rotate)).size).toBeGreaterThan(20);
    expect(new Set(field.map((t) => t.fontSize)).size).toBeGreaterThan(15);
    expect(new Set(field.map((t) => t.duration)).size).toBeGreaterThan(30);
  });

  it('fills the mind gradually and out of order, each thought returning 3-5 s after it leaves', () => {
    const field = buildLogosThoughts();
    expect(field.length).toBe(LOGOS_THOUGHT_COUNT);
    const enters = field.map((t) => t.enter);
    for (const t of field) {
      expect(t.enter).toBeGreaterThanOrEqual(LOGOS_ENTRANCE.from);
      expect(t.enter).toBeLessThanOrEqual(LOGOS_ENTRANCE.to);
      expect(t.gap).toBeGreaterThanOrEqual(LOGOS_RETURN.min);
      expect(t.gap).toBeLessThanOrEqual(LOGOS_RETURN.max);
      expect(t.cycle).toBeCloseTo(t.duration + t.gap, 5);
      // The path runs over the traversal and holds its end through the absence, when the presence
      // has jumped to nothing.
      const held = Math.round((t.duration / t.cycle) * 100000) / 1000;
      expect(t.driftEasing).toBe(`linear(0, 1 ${held}%, 1)`);
      expect(t.presenceEasing).toBe(`linear(0, 0 ${held}%, 1 ${held}%, 1)`);
    }
    // Gradual: they surface across the whole entrance, steadily, never in a burst.
    const sorted = [...enters].sort((a, b) => a - b);
    expect(sorted[0]!).toBeLessThan(LOGOS_ENTRANCE.from + 0.5);
    expect(sorted[sorted.length - 1]!).toBeGreaterThan(LOGOS_ENTRANCE.to - 0.5);
    const densest = Math.max(
      ...sorted.map((a) => sorted.filter((b) => b >= a && b < a + 0.5).length),
    );
    expect(densest).toBeLessThanOrEqual(4);
    // Irregular: the waits between arrivals are uneven.
    const waits = sorted.slice(1).map((e, k) => Math.round((e - sorted[k]!) * 10) / 10);
    expect(new Set(waits).size).toBeGreaterThan(4);
    // Out of order: neither in the field's order nor sweeping across the stage.
    expect(enters).not.toEqual(sorted);
    const byX = [...field].sort((a, b) => a.x - b.x).map((t) => t.enter);
    expect(byX).not.toEqual(sorted);
    expect(byX).not.toEqual([...sorted].reverse());
    // The gaps differ from thought to thought.
    expect(new Set(field.map((t) => t.gap)).size).toBeGreaterThan(5);
  });

  it('samples each path evenly from its start to its end, turning without a jump', () => {
    for (const { d, reverse } of LOGOS_PATHS) {
      const samples = sampleLogosPath(d, reverse, LOGOS_PATH_STEPS);
      expect(samples.length).toBe(LOGOS_PATH_STEPS + 1);
      const start = d.match(/-?\d+/g)!.slice(0, 2).map(Number);
      const end = d.match(/-?\d+/g)!.slice(-2).map(Number);
      expect(samples[0]!.x).toBeCloseTo(start[0]!, 1);
      expect(samples[0]!.y).toBeCloseTo(start[1]!, 1);
      expect(samples[LOGOS_PATH_STEPS]!.x).toBeCloseTo(end[0]!, 1);
      expect(samples[LOGOS_PATH_STEPS]!.y).toBeCloseTo(end[1]!, 1);
      const steps = samples
        .slice(1)
        .map((p, k) => Math.hypot(p.x - samples[k]!.x, p.y - samples[k]!.y));
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      // Even by arc length (chords shorten a little on the tightest curls).
      for (const step of steps) expect(Math.abs(step - mean) / mean).toBeLessThan(0.3);
      // The heading never wraps (a 359° to 1° step would spin the word): the tightest curl turns
      // under a third of a turn between samples.
      for (let k = 1; k < samples.length; k++) {
        expect(Math.abs(samples[k]!.angle - samples[k - 1]!.angle)).toBeLessThan(120);
      }
      // A reversed path is ridden upright: it starts heading back the way it runs.
      const heading = ((samples[1]!.angle % 360) + 360) % 360;
      expect(heading > 90 && heading < 270).toBe(false);
    }
  });

  it('builds the drift from transform keyframes only (no fade)', () => {
    const css = logosPathKeyframes();
    expect(css).not.toContain('offset-');
    expect(css).not.toContain('filter');
    for (let n = 1; n <= LOGOS_PATH_COUNT; n++) {
      expect(css).toContain(`@keyframes logos-path-${n}{0%{transform:`);
      expect(css).toContain(`.logos-path-${n}{animation-name:logos-path-${n}}`);
    }
    const props = new Set(Array.from(css.matchAll(/[{;]([a-z-]+):/g), (m) => m[1]));
    expect([...props].sort()).toEqual(['animation-name', 'transform']);
  });

  it('runs each body wave from the head back to the tail, the head steadier and the tail thinner', () => {
    const { wavelength, taper } = LOGOS_SERPENT;
    const top = LOGOS_SWAY_LEVELS.length - 1;
    const phaseOf = (delay: number): number => -delay / 2;
    for (const headFirst of [false, true]) {
      const body = logosVertebrae('legio nomen mihi', true, headFirst, 0.3, 2);
      expect(body.map((v) => v.ch).join('')).toBe('legio nomen mihi');
      const fromHead = headFirst ? body : [...body].reverse();
      const head = fromHead[0]!;
      const tail = fromHead[fromHead.length - 1]!;
      expect(head.size).toBe(1);
      expect(tail.size).toBeCloseTo(1 - taper, 3);
      expect(head.keyframes).toBe(logosSlitherName(true, headFirst, 0));
      expect(tail.keyframes).toBe(logosSlitherName(true, headFirst, top));
      for (const v of body) {
        expect(v.delay).toBeLessThanOrEqual(0);
        expect(v.delay).toBeGreaterThan(-2);
      }
      // Each vertebra back from the head trails it by 1/wavelength of a turn.
      for (let k = 1; k < fromHead.length; k++) {
        const step = phaseOf(fromHead[k - 1]!.delay) - phaseOf(fromHead[k]!.delay);
        expect((((step % 1) + 1) % 1) - 1 / wavelength).toBeCloseTo(0, 2);
      }
    }
  });

  it('heads each serpent the way it drifts, in its own voice, and slows the larger ones', () => {
    const field = buildLogosThoughts();
    for (const t of field) {
      const headFirst = LOGOS_PATHS[t.path - 1]!.reverse;
      expect(t.vertebrae.map((v) => v.ch).join('')).toBe(t.text);
      const sets = t.vertebrae.map((v) => v.keyframes);
      const prefix = `logos-slither-${t.latin ? 'latin' : 'note'}-${headFirst ? 'w' : 'e'}`;
      expect(sets.every((k) => k.startsWith(prefix))).toBe(true);
    }
    const bySize = [...field].sort((a, b) => a.fontSize - b.fontSize);
    expect(bySize[bySize.length - 1]!.slither).toBeGreaterThan(bySize[0]!.slither);
  });

  it('builds the slither from fixed transform keyframes, rising by the sway and turning with the slope', () => {
    const css = logosSlitherKeyframes();
    // Fixed values only: keyframes reading custom properties are re-resolved on the main thread.
    expect(css).not.toContain('var(');
    const props = new Set(Array.from(css.matchAll(/[{;]([a-z-]+):/g), (m) => m[1]));
    expect([...props]).toEqual(['transform']);
    const frames = (name: string): { y: number; turn: number }[] => {
      const block = css.match(new RegExp(`@keyframes ${name}\\{(.*?)\\}\\}`))![1]!;
      return Array.from(
        block.matchAll(/translateY\((-?[\d.]+)em\) rotate\((-?[\d.]+)deg\)/g),
        (m) => ({
          y: Number(m[1]),
          turn: Number(m[2]),
        }),
      );
    };
    const top = LOGOS_SWAY_LEVELS.length - 1;
    for (const latin of [true, false]) {
      const tilt = logosSlitherTilt(latin);
      expect(tilt).toBeGreaterThan(0);
      expect(tilt).toBeLessThan(60);
      for (const headFirst of [false, true]) {
        const full = frames(logosSlitherName(latin, headFirst, top));
        expect(full.length).toBe(LOGOS_SLITHER_STEPS + 1);
        // A quarter turn in, the vertebra is at the crest (raised by the full sway, level).
        const crest = full[LOGOS_SLITHER_STEPS / 4]!;
        expect(crest.y).toBeCloseTo(-LOGOS_SERPENT.amplitude, 3);
        expect(crest.turn).toBe(0);
        // At the start it lies on the slope: turned one way heading east, the other heading west.
        expect(Math.sign(full[0]!.turn)).toBe(headFirst ? 1 : -1);
        expect(Math.abs(full[0]!.turn)).toBeCloseTo(tilt, 0);
        // The head sways less than the body.
        const head = frames(logosSlitherName(latin, headFirst, 0));
        expect(Math.abs(head[LOGOS_SLITHER_STEPS / 4]!.y)).toBeLessThan(Math.abs(crest.y));
      }
    }
  });

  it('lights echoes in proportion to progress, and spreads them when dwelt on', () => {
    const lit = (progress: number): number =>
      logosEchoes({ sealed: false, held: true, active: true, progress }).filter((e) => e.lit)
        .length;
    expect(lit(0)).toBe(0);
    expect(lit(50)).toBe(LOGOS_ECHO_COUNT / 2);
    expect(lit(100)).toBe(LOGOS_ECHO_COUNT);
    const resting = logosEchoes({ sealed: false, held: false, active: false, progress: 0 });
    const dwelt = logosEchoes({ sealed: false, held: true, active: false, progress: 0 });
    expect(dwelt[5]!.dx).toBeGreaterThan(resting[5]!.dx);
    expect(resting.every((e) => !e.lit)).toBe(true);
  });
});
