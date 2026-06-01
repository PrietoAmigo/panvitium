import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { gt, bn, type BigNum } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';

/**
 * The "while you were away" recap, shown once on load after a meaningful absence (see
 * `offlineRecap`). Lists the net gains accrued during the offline catch-up; if nothing accrued, a
 * quiet acknowledgement instead. Dismissing it clears the store's `offlineRecap`.
 */
export function WelcomeBackModal(): ReactElement | null {
  const recap = useGameStore((s) => s.offlineRecap);
  const dismiss = useGameStore((s) => s.dismissOfflineRecap);
  if (!recap) return null;

  const w = strings.welcomeBack;
  const lines: { label: string; value: string }[] = [];
  const addBig = (label: string, v: BigNum): void => {
    if (gt(v, bn(0))) lines.push({ label, value: `+${formatBigNum(v)}` });
  };
  addBig(strings.resources.souls, recap.souls);
  addBig(strings.resources.gold, recap.gold);
  addBig(strings.resources.influence, recap.influence);
  if (recap.reprobates !== 0) {
    const sign = recap.reprobates > 0 ? '+' : '';
    lines.push({
      label: strings.reprobates,
      value: `${sign}${recap.reprobates.toLocaleString('en-US')}`,
    });
  }

  const away = `${w.away} ${formatDuration(recap.awaySeconds * 1000)}`;

  return (
    <div className="welcome-modal" role="dialog" aria-label={w.title}>
      <div className="welcome-inner">
        <h2 className="welcome-title">{w.title}</h2>
        <p className="welcome-away">{away}</p>
        {lines.length > 0 ? (
          <dl className="welcome-stats">
            {lines.map((l) => (
              <div className="welcome-stat" key={l.label}>
                <dt>{l.label}</dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="welcome-nothing">{w.nothing}</p>
        )}
        <button type="button" className="opera-btn welcome-dismiss" onClick={dismiss}>
          {w.dismiss}
        </button>
      </div>
    </div>
  );
}
