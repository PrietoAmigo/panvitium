import { useState, type ReactElement, type ReactNode } from 'react';
import { strings } from '@panvitium/shared';
import { floor, type OutcomeEvent } from '@panvitium/sim';
import { type PanelId } from '../rooms/rooms.js';
import { useGameStore } from '../store/gameStore.js';

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
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  return (
    <div className="opera">
      <p className="opera-intro">{strings.opera.suasioIntro}</p>
      <ActionRow
        name={strings.opera.suggestion}
        cost={`5 ${strings.resources.influence} · 10s`}
        cta={strings.opera.tempt}
        disabled={underway || influence < 5}
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
  const notice = useGameStore((s) => s.notice);
  const act = useGameStore((s) => s.act);
  const underway = useUnderway();
  return (
    <>
      <ActionRow
        name={strings.opera.caedis}
        cost={`100 ${strings.resources.gold} · 10s`}
        cta={strings.opera.cull}
        disabled={underway || gold < 100}
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

/** Body for a selected PC group; only Decimatio and Logs are implemented yet. */
function PcGroupBody({ group }: { group: PcGroupId }): ReactElement {
  if (group === 'decimatio') return <DecimatioGroup />;
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
    body: <p>Empty hooks and clean dust-rings. Nothing has yet been found or purchased.</p>,
  },
  'altar-menu': {
    title: 'The Altar',
    body: (
      <p>
        Here the loadout will be read: the Sigil bindings, the Devotion owed each Prince, the buffs
        in force. The stone is silent for now.
      </p>
    ),
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
