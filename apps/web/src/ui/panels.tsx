import { useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import {
  floor,
  SINS,
  sinLevel,
  MAX_SIN_LEVEL,
  ACTIONS,
  categoryEfficiency,
  MALEFICIA,
  countCopies,
  totalInvokingPower,
  type OutcomeEvent,
} from '@panvitium/sim';
import { type PanelId } from '../rooms/rooms.js';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';

interface PanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A diegetic modal styled as an aged grimoire page (02 §10). */
export function Panel({ title, onClose, children }: PanelProps): ReactElement {
  return (
    <div className="panel-overlay" onClick={onClose} role="presentation">
      <div className="panel" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

const ACTION_NAME: Record<string, string> = {
  suggestion: strings.opera.suggestion,
  caedis: strings.opera.caedis,
};

/** A single outcome rendered as a terminal log line: "Caedis · Good — +1 Souls, -1 Reprobates". */
function describeOutcome(e: OutcomeEvent): string {
  const name = ACTION_NAME[e.actionId] ?? e.actionId;
  const parts: string[] = [];
  const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
  if (e.soulsDelta !== 0) parts.push(`${sign(e.soulsDelta)} ${strings.resources.souls}`);
  if (e.reprobateDelta !== 0) parts.push(`${sign(e.reprobateDelta)} ${strings.reprobates}`);
  if (e.goldDelta !== 0) parts.push(`${sign(e.goldDelta)} ${strings.resources.gold}`);
  const effect = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  return `${name} · ${strings.tiers[e.tier]}${effect}`;
}

/** One Opera action row: name, cost, and a button that triggers it (disabled if unaffordable). */
function ActionRow({
  name,
  cost,
  cta,
  disabled,
  onAct,
}: {
  name: string;
  cost: string;
  cta: string;
  disabled: boolean;
  onAct: () => void;
}): ReactElement {
  return (
    <div className="opera-action">
      <div className="opera-meta">
        <span className="opera-name">{name}</span>
        <span className="opera-cost">{cost}</span>
      </div>
      <button type="button" className="opera-btn" disabled={disabled} onClick={onAct}>
        {cta}
      </button>
    </div>
  );
}

/** The Suasio scroll (Studio): tempt ordinary humans into reprobates. */
/** True while a player-driven rite is in flight (02 §3: one action at a time). */
function useUnderway(): boolean {
  return useGameStore((s) => (s.state ? s.state.lifetime.actionQueue.length > 0 : false));
}

/** The Suasio scroll (Studio): tempt ordinary humans into reprobates. */
function SuasioPanel(): ReactElement {
  const influence = useGameStore((s) =>
    s.state ? floor(s.state.lifetime.influence).toNumber() : 0,
  );
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'suasio') : 1));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  // Efficiency scales cost and outcome the same percentage (03 §2.1). Display the actual cost the
  // player will pay so the bump from Gula levels never silently surprises them.
  const cost = Math.ceil((ACTIONS.suggestion?.cost.influence ?? 0) * eff);
  return (
    <div className="opera">
      <p className="opera-intro">{strings.opera.suasioIntro}</p>
      <ActionRow
        name={strings.opera.suggestion}
        cost={`${cost} ${strings.resources.influence} · 10s`}
        cta={strings.opera.tempt}
        disabled={underway || influence < cost}
        onAct={() => act('suggestion')}
      />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </div>
  );
}

/** The terminal log (02 §10): the last hundred outcomes, newest first. */
function OutcomeLog(): ReactElement {
  const log = useGameStore((s) => s.log);
  if (log.length === 0) return <p className="pc-empty">{strings.opera.emptyLog}</p>;
  return (
    <ul className="pc-log">
      {log.map((e, i) => (
        <li className={`pc-log-line tier-${e.tier}`} key={`${i}-${e.actionId}-${e.tier}`}>
          {describeOutcome(e)}
        </li>
      ))}
    </ul>
  );
}

/** Decimatio actions (only Caedis wired so far). */
function DecimatioGroup(): ReactElement {
  const gold = useGameStore((s) => (s.state ? floor(s.state.lifetime.gold).toNumber() : 0));
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'decimatio') : 1));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  const cost = Math.ceil((ACTIONS.caedis?.cost.gold ?? 0) * eff);
  return (
    <>
      <ActionRow
        name={strings.opera.caedis}
        cost={`${cost} ${strings.resources.gold} · 10s`}
        cta={strings.opera.cull}
        disabled={underway || gold < cost}
        onAct={() => act('caedis')}
      />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

type PcGroupId = 'depraedatio' | 'decimatio' | 'indagatio' | 'emptio' | 'logs';

const PC_GROUPS: { id: PcGroupId; label: string }[] = [
  { id: 'depraedatio', label: strings.opera.depraedatio },
  { id: 'decimatio', label: strings.opera.decimatio },
  { id: 'indagatio', label: strings.opera.indagatio },
  { id: 'emptio', label: strings.opera.emptio },
  { id: 'logs', label: strings.opera.logs },
];

/** Indagatio (03 §2.5): one long, no-cost search button. Duration scales with player efficiency. */
function IndagatioGroup(): ReactElement {
  const eff = useGameStore((s) => (s.state ? categoryEfficiency(s.state, 'indagatio') : 1));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  const baseSec = ACTIONS.indagatio?.baseTimeSeconds ?? 1800;
  const actualSec = Math.max(1, Math.floor(baseSec / Math.max(eff, 1e-9)));
  return (
    <>
      <p className="opera-intro">{strings.opera.indagatioIntro}</p>
      <ActionRow
        name={strings.opera.indagatio}
        cost={formatDuration(actualSec)}
        cta={strings.opera.indagatioCta}
        disabled={underway}
        onAct={() => act('indagatio')}
      />
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

/** Emptio (03 §2.6): the listed maleficia, each with a buy button at the listed gold cost. */
function EmptioGroup(): ReactElement {
  const list = useGameStore((s) => (s.state ? s.state.lifetime.emptioList : []));
  const gold = useGameStore((s) => (s.state ? floor(s.state.lifetime.gold).toNumber() : 0));
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  if (list.length === 0) {
    return (
      <>
        <p className="opera-intro">{strings.opera.emptioIntro}</p>
        <p className="pc-empty">{strings.opera.emptioEmpty}</p>
      </>
    );
  }
  return (
    <>
      <p className="opera-intro">{strings.opera.emptioIntro}</p>
      <ul className="emptio-list">
        {list.map((id, idx) => {
          const def = MALEFICIA[id];
          if (!def) return null;
          return (
            <li key={`${idx}-${id}`} className="emptio-row">
              <span className={`rarity-badge rarity-${def.rarity}`}>
                {strings.maleficia.rarity[def.rarity]}
              </span>
              <span className="emptio-name">{def.name}</span>
              <span className="emptio-cost">
                {def.cost} {strings.resources.gold}
              </span>
              <button
                type="button"
                className="opera-btn emptio-buy"
                disabled={underway || gold < def.cost}
                onClick={() => act('emptio', id)}
              >
                {strings.opera.buy}
              </button>
            </li>
          );
        })}
      </ul>
      {underway && <p className="opera-hint">{strings.opera.underway}</p>}
      {notice !== null && <p className="opera-notice">{notice}</p>}
    </>
  );
}

/** Maleficia shelf: groups owned items by id; stackables show their count. */
function MaleficiaShelf(): ReactElement {
  const owned = useGameStore((s) => (s.state ? s.state.lifetime.maleficia : []));
  if (owned.length === 0) {
    return <p className="pc-empty">{strings.maleficia.empty}</p>;
  }
  // Preserve first-acquired order while collapsing duplicates into counts.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of owned) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  const totalPower = totalInvokingPower(owned);
  return (
    <div className="maleficia-shelf">
      <p className="opera-intro">{strings.maleficia.intro}</p>
      <p className="maleficia-power">
        {totalPower} {strings.maleficia.invokingPower}
      </p>
      <ul className="maleficia-list">
        {order.map((id) => {
          const def = MALEFICIA[id];
          if (!def) return null;
          const count = countCopies(owned, id);
          return (
            <li key={id} className="maleficium-row">
              <span className={`rarity-badge rarity-${def.rarity}`}>
                {strings.maleficia.rarity[def.rarity]}
              </span>
              <span className="maleficium-name">
                {def.name}
                {count > 1 ? ` ×${count}` : ''}
              </span>
              <span className="maleficium-desc">{def.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Format a duration in seconds as HH:MM:SS or MMm SS, etc. */
function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Body for a selected PC group. */
function PcGroupBody({ group }: { group: PcGroupId }): ReactElement {
  if (group === 'decimatio') return <DecimatioGroup />;
  if (group === 'indagatio') return <IndagatioGroup />;
  if (group === 'emptio') return <EmptioGroup />;
  if (group === 'logs') return <OutcomeLog />;
  return <p className="pc-empty">{strings.opera.notYet}.</p>;
}

/**
 * The desk terminal (Studio, 02 §10): a simple Win95-style menu of action groups; selecting one
 * opens that group's actions, with a way back to the menu.
 */
function PcPanel(): ReactElement {
  const [group, setGroup] = useState<PcGroupId | null>(null);

  if (group === null) {
    return (
      <div className="pc">
        <p className="pc-prompt">
          {'C:\\LAIR> '}
          {strings.opera.selectLedger}
        </p>
        <div className="pc-menu">
          {PC_GROUPS.map((g) => (
            <button key={g.id} type="button" className="pc-menu-btn" onClick={() => setGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const label = PC_GROUPS.find((g) => g.id === group)?.label ?? group;
  return (
    <div className="pc">
      <button type="button" className="pc-back" onClick={() => setGroup(null)}>
        ← {strings.opera.back}
      </button>
      <h3 className="pc-heading">{label}</h3>
      <PcGroupBody group={group} />
    </div>
  );
}

interface PanelContent {
  title: string;
  body: ReactNode;
}

/** Four pips, `level` filled — a Sin's 0..4 progress. */
function altarPips(level: number): string {
  let out = '';
  for (let i = 0; i < MAX_SIN_LEVEL; i++) out += i < level ? '●' : '○';
  return out;
}

/** The altar menu (02 §10): Devotion and level per Prince, plus the descent trigger. */
function AltarPanel(): ReactElement {
  const state = useGameStore((s) => s.state);
  const begin = useGameStore((s) => s.beginKatabasis);
  if (!state) return <p>{strings.altar.intro}</p>;
  return (
    <div className="altar">
      <p className="altar-intro">{strings.altar.intro}</p>
      <ul className="devotion-list">
        {SINS.map((sin) => {
          const info = strings.sins[sin];
          return (
            <li className="devotion-row" key={sin}>
              <span className="devotion-name">
                {info.prince} · {info.latin}
              </span>
              <span className="devotion-pips">{altarPips(sinLevel(state.devotion[sin]))}</span>
              <span className="devotion-total">{formatBigNum(state.devotion[sin])}</span>
            </li>
          );
        })}
      </ul>
      <p className="altar-sigils">{strings.altar.sigilsNone}</p>
      <button type="button" className="opera-btn descend-btn" onClick={() => begin()}>
        {strings.altar.descend}
      </button>
    </div>
  );
}

/** Placeholder copy in the game's voice; each panel's real menu lands with its system. */
export const PANELS: Record<PanelId, PanelContent> = {
  'ars-goetia': {
    title: 'Ars Goetia',
    body: (
      <p>
        The seventy-two seals wait beneath the ink, unlit. The <em>Invocatio</em> rite is not yet
        bound to this page.
      </p>
    ),
  },
  maleficia: {
    title: 'The Maleficia Shelf',
    body: <MaleficiaShelf />,
  },
  'altar-menu': {
    title: 'The Altar',
    body: <AltarPanel />,
  },
  pc: {
    title: 'The Desk',
    body: <PcPanel />,
  },
  suasio: {
    title: 'The Suasio Scroll',
    body: <SuasioPanel />,
  },
};
