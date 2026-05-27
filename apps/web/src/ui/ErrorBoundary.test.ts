import { describe, it, expect, vi } from 'vitest';
import { Component, act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary.js';

/** A child that throws on render, to trip the boundary. */
class Boom extends Component {
  override render(): ReactNode {
    throw new Error('kaboom');
  }
}

describe('ErrorBoundary', () => {
  it('renders a fallback (with the error message) instead of crashing', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      root.render(createElement(ErrorBoundary, null, createElement(Boom)));
    });

    expect(container.textContent).toContain('The rite collapsed');
    expect(container.textContent).toContain('kaboom');

    spy.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders children when nothing throws', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(ErrorBoundary, null, createElement('span', null, 'all is well')));
    });

    expect(container.textContent).toContain('all is well');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
