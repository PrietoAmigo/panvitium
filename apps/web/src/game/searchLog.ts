// View-model adapter for the Indagatio menu's log: each recent Indagatio or Emptio outcome (the
// store's `searchLog`, newest first) becomes one pre-formatted line for the Orbis Tenebrarum. The
// line says what came of the rite in its own words: what a search surfaced onto the Emptio list (or
// why it surfaced nothing), and what became of the relic a purchase was buying. Any gold the outcome
// moved closes the line as a signed change, in the "g" the Emptio prices beside it use. No game
// logic: this only reads the event.
import { bn, MALEFICIA, type OutcomeEvent } from '@panvitium/sim';
import { strings } from '@panvitium/shared';
import type { OrbisLogEntry } from '../menus/orbis-tenebrarum/index.js';
import { formatBigNum } from './format.js';

const S = strings.opera.searchLog;

/** A maleficium's display name; an unknown id falls back to the id itself. */
const relicName = (id: string): string => MALEFICIA[id]?.name ?? id;

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${S.and} ${names[names.length - 1]!}`;
}

/** Fill a `{name}` template; a template that opens on the name gets a capital first letter. */
function fill(template: string, name: string): string {
  const text = template.replace('{name}', name);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What an Indagatio outcome did: the relics it surfaced, or the failure it met instead. */
function indagatioDetail(e: OutcomeEvent): string {
  const surfaced = e.maleficiaSurfaced ?? [];
  if (surfaced.length > 0) return fill(S.found, joinNames(surfaced.map(relicName)));
  switch (e.tier) {
    case 'bad':
      return S.falseLead;
    case 'terrible':
      return S.churchTrap;
    case 'apocalyptic':
      return S.higherPower;
    default:
      // A surfacing tier that found nothing: every candidate owned or listed, or a full list of
      // rarer relics that a lesser find may not displace.
      return S.foundNothing;
  }
}

/** What an Emptio outcome did to the relic it was buying. */
function emptioDetail(e: OutcomeEvent): string {
  const target = e.target ?? e.maleficiaAcquired?.[0] ?? e.maleficiaLost?.[0];
  const name = target !== undefined ? relicName(target) : S.someRelic;
  if ((e.maleficiaAcquired ?? []).length > 0) return fill(S.bound, name);
  if ((e.maleficiaLost ?? []).length > 0) {
    return fill(e.tier === 'apocalyptic' ? S.bait : S.snatched, name);
  }
  // Neither bought nor lost: the relic left the list before the deal closed (its price refunded,
  // so gold came back), or a Bad deal that kept the paid gold and left the relic listed.
  return fill(e.goldDelta > 0 ? S.vanished : S.fellThrough, name);
}

/** A signed gold change for the end of a line, in the ledger's unit: "+450 g", "-1,350 g". */
function goldChange(delta: number): string {
  const sign = delta > 0 ? '+' : '-';
  return S.gold.replace('{gold}', `${sign}${formatBigNum(bn(Math.abs(delta)))}`);
}

/** One Search log line for one Indagatio or Emptio outcome. */
export function searchLogEntry(e: OutcomeEvent, index: number): OrbisLogEntry {
  const emptio = e.actionId === 'emptio';
  const base = emptio ? emptioDetail(e) : indagatioDetail(e);
  return {
    key: `${index}-${e.actionId}-${e.tier}`,
    rite: emptio ? 'emptio' : 'indagatio',
    action: emptio ? strings.opera.emptio : strings.opera.indagatio,
    tier: e.tier,
    tierLabel: strings.tiers[e.tier],
    detail: e.goldDelta !== 0 ? `${base}, ${goldChange(e.goldDelta)}` : base,
    ...(e.source === 'tracing' ? { source: { tag: S.tracing, title: S.tracingTitle } } : {}),
  };
}

/** The Indagatio menu's log: the store's recent Indagatio / Emptio outcomes, newest first. */
export function buildSearchLog(events: readonly OutcomeEvent[]): OrbisLogEntry[] {
  return events.map(searchLogEntry);
}
