/**
 * Render smoke tests for the Opus Suasio scroll (Claude Design rework). These pin the wiring the
 * visual rework introduced: the scroll is a self-framed dialog with a close affordance, each rite
 * renders its sigil row, the active rite surfaces its progress ring + bar + flicker status, a
 * sealed (locked) rite shows redacted Latin + its Sin gate and offers no action, an open rite's
 * verb fires the real action, and the overlay / close both dismiss. The store wiring and the
 * action/cost math live in their own suites; this component is purely presentational.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SuasioPanel, type SuasioActionView } from './SuasioPanel.js';

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

function baseAction(over: Partial<SuasioActionView>): SuasioActionView {
  return {
    id: 'suggestion',
    numeral: 'I',
    glyph: '\u263F',
    name: 'Suggestion',
    quote: 'A word left where a thought will find it.',
    cost: '5 Influence \u00b7 5s',
    cta: 'Speak',
    status: 'A word is being left\u2026',
    locked: false,
    active: false,
    progress: 0,
    disabled: false,
    onTempt: () => {},
    ...over,
  };
}

function render(props: { actions: SuasioActionView[]; onClose: () => void }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(SuasioPanel, {
        eyebrow: 'The Honeyed Tongue',
        title: 'Opus Suasio',
        maxim: 'Veritatis simplex oratio est',
        closeLabel: 'Close the scroll',
        actions: props.actions,
        onClose: props.onClose,
      }),
    );
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

describe('Opus Suasio scroll', () => {
  it('renders a labelled dialog with one row per temptation', () => {
    render({
      actions: [
        baseAction({ id: 'suggestion' }),
        baseAction({ id: 'logismoi', numeral: 'II', name: 'Logismoi', cta: 'Infiltrate' }),
        baseAction({ id: 'imperium', numeral: 'III', name: 'Imperium', cta: 'Command' }),
      ],
      onClose: () => {},
    });
    const dialog = container!.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Opus Suasio');
    expect(container!.querySelectorAll('.suasio-row').length).toBe(3);
  });

  it('shows the progress ring, bar and flicker status only for the active rite', () => {
    render({
      actions: [
        baseAction({ id: 'suggestion', active: true, progress: 60, disabled: true }),
        baseAction({ id: 'logismoi', numeral: 'II', name: 'Logismoi' }),
        baseAction({ id: 'imperium', numeral: 'III', name: 'Imperium' }),
      ],
      onClose: () => {},
    });
    expect(container!.querySelectorAll('.suasio-arc').length).toBe(1);
    const bar = container!.querySelector('.suasio-bar') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('60%');
    expect(container!.querySelector('.suasio-status')?.textContent).toContain(
      'A word is being left',
    );
  });

  it('renders a locked rite as sealed: redacted name, the gate, and no action button', () => {
    render({
      actions: [
        baseAction({ id: 'suggestion' }),
        baseAction({
          id: 'imperium',
          numeral: 'III',
          name: 'Xherum Volctan',
          quote: 'Qoth velim sarnu, ut nescias quod petat.',
          locked: true,
          disabled: true,
          lockLabel: 'Requires Luxuria III',
        }),
      ],
      onClose: () => {},
    });
    const sealed = container!.querySelector('.suasio-row--locked');
    expect(sealed).not.toBeNull();
    expect(sealed!.querySelector('.suasio-name')?.textContent).toBe('Xherum Volctan');
    expect(sealed!.querySelector('.suasio-gate')?.textContent).toBe('Requires Luxuria III');
    // A sealed rite is unactionable — no Speak/Command button.
    expect(sealed!.querySelector('.suasio-act')).toBeNull();
  });

  it('fires the real action when an open rite is spoken', () => {
    const tempt = spy();
    render({
      actions: [baseAction({ id: 'suggestion', onTempt: tempt.fn })],
      onClose: () => {},
    });
    const btn = container!.querySelector('.suasio-act') as HTMLButtonElement;
    act(() => btn.click());
    expect(tempt.calls).toBe(1);
  });

  it('dismisses on the overlay and the close button, but not on the scroll body', () => {
    const close = spy();
    render({ actions: [baseAction({})], onClose: close.fn });

    const scroll = container!.querySelector('.suasio-scroll') as HTMLElement;
    act(() => scroll.click());
    expect(close.calls).toBe(0); // clicking the parchment must not close it

    const closeBtn = container!.querySelector('.suasio-close') as HTMLButtonElement;
    act(() => closeBtn.click());
    expect(close.calls).toBe(1);

    const overlay = container!.querySelector('.suasio-overlay') as HTMLElement;
    act(() => overlay.click());
    expect(close.calls).toBe(2);
  });
});
