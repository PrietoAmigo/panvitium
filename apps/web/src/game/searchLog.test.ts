/**
 * The Indagatio menu's log lines: each Indagatio / Emptio outcome reads as what came of the rite
 * (what a search surfaced, or why it surfaced nothing; what became of the relic a purchase was
 * buying), closed by any gold it moved in the ledger's own "g".
 */
import { describe, it, expect } from 'vitest';
import type { OutcomeEvent } from '@panvitium/sim';
import { buildSearchLog, searchLogEntry } from './searchLog.js';

function ev(over: Partial<OutcomeEvent> & Pick<OutcomeEvent, 'actionId' | 'tier'>): OutcomeEvent {
  return { soulsDelta: 0, reprobateDelta: 0, goldDelta: 0, ...over };
}

const detail = (e: OutcomeEvent): string => searchLogEntry(e, 0).detail;

describe('searchLogEntry — Indagatio', () => {
  it('names what a search surfaced, joining a double find', () => {
    expect(
      detail(ev({ actionId: 'indagatio', tier: 'good', maleficiaSurfaced: ['ars_serpens'] })),
    ).toBe('Found Ars Serpens');
    expect(
      detail(
        ev({
          actionId: 'indagatio',
          tier: 'stellar',
          maleficiaSurfaced: ['ars_serpens', 'obsidian_mirror', 'thirty_pieces_of_silver'],
        }),
      ),
    ).toBe('Found Ars Serpens, Obsidian Mirror and Thirty Pieces of Silver');
  });

  it('says why a search surfaced nothing, with the gold a failure took', () => {
    expect(detail(ev({ actionId: 'indagatio', tier: 'neutral' }))).toBe('Nothing new to find');
    expect(detail(ev({ actionId: 'indagatio', tier: 'bad' }))).toBe('A false lead');
    expect(detail(ev({ actionId: 'indagatio', tier: 'terrible', goldDelta: -13_500 }))).toBe(
      'A Church trap, -13,500 g',
    );
    expect(detail(ev({ actionId: 'indagatio', tier: 'apocalyptic', goldDelta: -2_500_000 }))).toBe(
      'A Higher Power’s agent, -2.5M g',
    );
    // A trap sprung on an empty purse takes nothing, and the line says nothing of gold.
    expect(detail(ev({ actionId: 'indagatio', tier: 'terrible' }))).toBe('A Church trap');
  });

  it('carries the rite, the tier and its label, and tags PI only on a traced search', () => {
    const own = searchLogEntry(ev({ actionId: 'indagatio', tier: 'bad' }), 2);
    expect(own).toEqual({
      key: '2-indagatio-bad',
      rite: 'indagatio',
      action: 'Indagatio',
      tier: 'bad',
      tierLabel: 'Bad',
      detail: 'A false lead',
    });
    const traced = searchLogEntry(ev({ actionId: 'indagatio', tier: 'bad', source: 'tracing' }), 0);
    expect(traced.source).toEqual({ tag: 'PI', title: 'Asset tracing' });
  });
});

describe('searchLogEntry — Emptio', () => {
  const buy = (over: Partial<OutcomeEvent>): OutcomeEvent =>
    ev({ actionId: 'emptio', tier: 'neutral', target: 'obsidian_mirror', ...over });

  it('binds the relic, with the refund a good deal returned', () => {
    expect(detail(buy({ maleficiaAcquired: ['obsidian_mirror'] }))).toBe('Bound Obsidian Mirror');
    expect(
      detail(buy({ tier: 'good', maleficiaAcquired: ['obsidian_mirror'], goldDelta: 450 })),
    ).toBe('Bound Obsidian Mirror, +450 g');
    const entry = searchLogEntry(buy({ maleficiaAcquired: ['obsidian_mirror'] }), 0);
    expect(entry.rite).toBe('emptio');
    expect(entry.action).toBe('Emptio');
  });

  it('names the relic a failed deal was for', () => {
    expect(detail(buy({ tier: 'bad' }))).toBe('The deal for Obsidian Mirror fell through');
    expect(detail(buy({ tier: 'terrible', maleficiaLost: ['obsidian_mirror'] }))).toBe(
      'Obsidian Mirror snatched away',
    );
    expect(
      detail(buy({ tier: 'apocalyptic', maleficiaLost: ['obsidian_mirror'], goldDelta: -40_000 })),
    ).toBe('Bait: Obsidian Mirror lost, -40,000 g');
  });

  it('reports a relic gone from the list before the deal closed, with its price refunded', () => {
    expect(detail(buy({ tier: 'good', goldDelta: 20_000 }))).toBe(
      'Obsidian Mirror had vanished, +20,000 g',
    );
  });

  it('falls back to the relic it acquired or lost, then to a generic one', () => {
    expect(
      detail(ev({ actionId: 'emptio', tier: 'terrible', maleficiaLost: ['ars_serpens'] })),
    ).toBe('Ars Serpens snatched away');
    expect(detail(ev({ actionId: 'emptio', tier: 'bad' }))).toBe(
      'The deal for the relic fell through',
    );
    expect(detail(ev({ actionId: 'emptio', tier: 'good', goldDelta: 10 }))).toBe(
      'The relic had vanished, +10 g',
    );
  });
});

describe('buildSearchLog', () => {
  it('keeps the store order (newest first) with a distinct key per line', () => {
    const lines = buildSearchLog([
      ev({ actionId: 'emptio', tier: 'bad', target: 'ars_serpens' }),
      ev({ actionId: 'indagatio', tier: 'bad' }),
      ev({ actionId: 'indagatio', tier: 'bad' }),
    ]);
    expect(lines.map((l) => l.rite)).toEqual(['emptio', 'indagatio', 'indagatio']);
    expect(new Set(lines.map((l) => l.key)).size).toBe(3);
  });
});
