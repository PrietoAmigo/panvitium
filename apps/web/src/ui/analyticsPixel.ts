// The Analytics program in the PC programs' pixel dress: the same 3 px art grid as the Orbis
// Tenebrarum program and the Counting House (Depraedatio), on which the report's rules, segmented
// bars and stepped highlights sit (index.css). This module holds the tab glyphs, drawn on that grid.

/** The tabs' glyphs, each a 5 × 5 art-pixel path (viewBox `0 0 5 5`), drawn in currentColor. */
export type AnIconName = 'main' | 'actions' | 'risk';

export const AN_ICONS: Readonly<Record<AnIconName, string>> = {
  // Three rising bars: the resources and their flows.
  main: 'M0 3h1v2h-1z M2 1h1v4h-1z M4 0h1v5h-1z',
  // An hourglass: the work in flight, each timer running down.
  actions: 'M0 0h5v1h-5z M1 1h3v1h-3z M2 2h1v1h-1z M1 3h3v1h-3z M0 4h5v1h-5z',
  // A die's five: the odds of every outcome.
  risk: 'M0 0h1v1h-1z M4 0h1v1h-1z M2 2h1v1h-1z M0 4h1v1h-1z M4 4h1v1h-1z',
};
