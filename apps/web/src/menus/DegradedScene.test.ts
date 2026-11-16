/**
 * The room's degradation pass holds still while the scene is covered. An opaque full-surface menu
 * (the Chthonic Logos) hides the room entirely, so the pass stops rendering frames no one can see
 * and resumes when the menu closes. The engine is stubbed: jsdom has no 2D canvas, and this pins
 * only when the pass runs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const engine = vi.hoisted(() => ({ running: false, starts: 0, stops: 0 }));

vi.mock('./degrade.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./degrade.js')>();
  class FakePass {
    set(): void {}
    setGlows(): void {}
    setScene(): void {}
    start(): void {
      engine.running = true;
      engine.starts += 1;
    }
    stop(): void {
      engine.running = false;
      engine.stops += 1;
    }
  }
  return { ...actual, DegradePass: FakePass };
});

import { DegradedScene } from './DegradedScene.js';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(paused: boolean): void {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root!.render(createElement(DegradedScene, { roomId: 'studio', backdrop: '', paused }));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
  engine.running = false;
  engine.starts = 0;
  engine.stops = 0;
});

describe('DegradedScene', () => {
  it('runs the pass while the room is in view', () => {
    render(false);
    expect(engine.running).toBe(true);
  });

  it('holds the pass while the room is covered, and resumes when it is uncovered', () => {
    render(false);
    render(true);
    expect(engine.running).toBe(false);
    const stops = engine.stops;
    render(true); // staying covered does not restart it
    expect(engine.running).toBe(false);
    expect(engine.stops).toBe(stops);
    render(false);
    expect(engine.running).toBe(true);
  });

  it('is held once mounted already covered', () => {
    render(true);
    expect(engine.running).toBe(false);
  });

  it('stops the pass when it unmounts', () => {
    render(false);
    act(() => root!.unmount());
    root = null;
    expect(engine.running).toBe(false);
  });
});
