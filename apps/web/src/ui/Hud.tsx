import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';
import { ACTIONS, ZERO, totalReprobates, type ActionTimer, type BigNum } from '@panvitium/sim';

const NO_TIMERS: readonly ActionTimer[] = [];

function Resource({ label, value }: { label: string; value: BigNum }): ReactElement {
  return (
    <div className="resource">
      <span className="resource-label">{label}</span>
      <span className="resource-value">{formatBigNum(value)}</span>
    </div>
  );
}

/** The reprobate population — a natural count, not a BigNum resource (03 §3). */
function Population(): ReactElement {
  const total = useGameStore((s) => (s.state ? totalReprobates(s.state) : 0));
  return (
    <div className="resource population">
      <span className="resource-label">{strings.reprobates}</span>
      <span className="resource-value">{total.toLocaleString('en-US')}</span>
    </div>
  );
}

/** In-flight Opera timers with progress, so a queued rite is visible while it resolves. */
function ActiveActions(): ReactElement {
  const queue = useGameStore((s) => s.state?.lifetime.actionQueue ?? NO_TIMERS);
  if (queue.length === 0) return <div className="active-actions idle">{strings.opera.idle}</div>;
  return (
    <div className="active-actions">
      {queue.map((t, i) => {
        const total = ACTIONS[t.actionId]?.baseTimeSeconds ?? 1;
        const pct = Math.max(0, Math.min(1, 1 - t.remainingSeconds / total));
        const name = t.actionId === 'caedis' ? strings.opera.caedis : strings.opera.suggestion;
        return (
          <div className="action-progress" key={`${i}-${t.actionId}`}>
            <span className="action-progress-label">
              {name} · {Math.ceil(t.remainingSeconds)}s
            </span>
            <span className="action-progress-bar">
              <span
                className="action-progress-fill"
                style={{ width: `${(pct * 100).toFixed(0)}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The vigil indicator: shows logical session time, advancing with the tick loop. It is the
 * visible proof that the 10 Hz loop is running.
 */
function Vigil(): ReactElement {
  const lastTickAt = useGameStore((s) => s.state?.lastTickAt ?? 0);
  const seconds = Math.floor(lastTickAt / 1000) % 3600;
  const mm = Math.floor(seconds / 60);
  const ss = (seconds % 60).toString().padStart(2, '0');
  return (
    <div className="vigil" title="The tick loop is running">
      <span className="vigil-dot" />
      vigil kept · {mm}:{ss}
    </div>
  );
}

export function Hud(): ReactElement {
  const souls = useGameStore((s) => s.state?.souls ?? ZERO);
  const gold = useGameStore((s) => s.state?.lifetime.gold ?? ZERO);
  const influence = useGameStore((s) => s.state?.lifetime.influence ?? ZERO);

  return (
    <aside className="hud">
      <div className="hud-title">{strings.appName}</div>
      <Resource label={strings.resources.souls} value={souls} />
      <Resource label={strings.resources.gold} value={gold} />
      <Resource label={strings.resources.influence} value={influence} />
      <Population />
      <ActiveActions />
      <Vigil />
    </aside>
  );
}
