/* Ars Goetia — presentation types. Self-contained: this menu no longer depends
   on the degradation-layer types.ts, so it can be integrated on its own.

   One GoetiaEntry is design FLAVOUR (rank numeral, lore, illustration) merged
   with sim MECHANICS (name, cost, gate, effect, unlocked) by invocation id.
   All numeric/gated values arrive PRE-FORMATTED as strings — never format raw
   bignums in the component (DESIGNING_FOR_PANVITIUM §5). */

export interface GoetiaEntry {
  /** Invocation id (imp, upir, harpy, fama, nightmare, behemoth, …). */
  id: string;
  /** Canonical display name. REAL (from the strings table). */
  name: string;
  /** Rank numeral. FLAVOUR. */
  rank: string;
  /** Pre-formatted soul/power cost, e.g. '12 Souls'. REAL. */
  cost: string;
  /** Pre-formatted gate label, e.g. 'Gula III'. REAL. Omit if ungated. */
  gate?: string;
  /** Effect copy. REAL string where one exists, else omit. */
  effect?: string;
  /** Lore prose. FLAVOUR. */
  lore?: string;
  /** Illustration url. Omit → the book falls back to a text plate gracefully. */
  illus?: string;
  /** Whether the entry passes its gate (invoking power + Sin level). REAL. */
  unlocked: boolean;
  /** How many copies are currently bound/active. REAL (0 = none summoned). */
  active: number;
  /** True when at its max-active cap (apexes + the runner singletons cap at 1). REAL. */
  atCap: boolean;
  /** True when the current soul (and gold) cost is affordable right now. REAL. */
  affordable: boolean;
  /** Pre-formatted bound badge, e.g. 'bound' or 'bound ×2'. Omit when nothing is bound. REAL. */
  bound?: string;
}

export interface ArsGoetiaBookProps {
  /** The roster, in book order. Un-illustrated entries degrade gracefully. */
  entries: GoetiaEntry[];
  /** Pre-formatted current invoking power, e.g. '14'. REAL. */
  invokingPower: string;
  /** Bind an entry (Summon). */
  onSummon: (id: string) => void;
  /** Unbind an entry (Dispel). */
  onDispel: (id: string) => void;
  /** Close the overlay. */
  onClose: () => void;
}
