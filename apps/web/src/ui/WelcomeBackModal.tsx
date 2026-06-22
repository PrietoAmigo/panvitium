import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { gt, lt, bn, sub } from '@panvitium/sim';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum, formatDuration } from '../game/format.js';
import './welcome-back.css';

const ACCENT = '#e0b66a';
const BLOOD = '#d97a7d';

type Tally = { label: string; sign: string; value: string; signColor: string };

/**
 * The "while you were away" recap — the Litany. A full-bleed typographic title-card carrying the
 * creed of Acedia (PRAEMIUM SINE LABORE — "reward without labor") over the game's oxblood field,
 * with the away-duration as an eyebrow and a hairline tally of net gains at the foot. Shown once on
 * load after a meaningful absence (see `offlineRecap`); the Reengage button clears it.
 */
export function WelcomeBackModal(): ReactElement | null {
  const recap = useGameStore((s) => s.offlineRecap);
  const dismiss = useGameStore((s) => s.dismissOfflineRecap);
  if (!recap) return null;

  const w = strings.welcomeBack;

  // Tally inclusion rules: a column appears only when its value moved. Souls are gain-only (the tick
  // never subtracts them), so they show a `+` when earned. Gold is a spendable balance, so offline
  // automation can leave a net loss — it shows either a `+` gain or a blood-red `−` loss, like
  // reprobates. Reprobates likewise. Influence is omitted from the display by design.
  const items: Tally[] = [];
  if (gt(recap.souls, bn(0))) {
    items.push({
      label: strings.resources.souls,
      sign: '+',
      value: formatBigNum(recap.souls),
      signColor: ACCENT,
    });
  }
  if (gt(recap.gold, bn(0))) {
    items.push({
      label: strings.resources.gold,
      sign: '+',
      value: formatBigNum(recap.gold),
      signColor: ACCENT,
    });
  } else if (lt(recap.gold, bn(0))) {
    items.push({
      label: strings.resources.gold,
      sign: '−',
      value: formatBigNum(sub(bn(0), recap.gold)),
      signColor: BLOOD,
    });
  }
  if (recap.reprobates !== 0) {
    const positive = recap.reprobates > 0;
    items.push({
      label: strings.reprobates,
      sign: positive ? '+' : '−',
      value: Math.abs(recap.reprobates).toLocaleString('en-US'),
      signColor: positive ? ACCENT : BLOOD,
    });
  }

  const hasGains = items.length > 0;
  const eyebrow = `${w.away} · ${formatDuration(recap.awaySeconds * 1000)}`;

  return (
    <div className="litany" role="dialog" aria-label={w.title}>
      <div className="litany-vignette" aria-hidden="true" />
      <div className="litany-inner">
        <div className="litany-eyebrow">{eyebrow}</div>

        <div className="litany-motto">
          <div className="litany-motto-lead">{w.mottoLead}</div>
          <div className="litany-motto-conj">{w.mottoConjunction}</div>
          <div className="litany-motto-trail">{w.mottoTrail}</div>
          {!hasGains && <p className="litany-quiet">{w.nothing}</p>}
        </div>

        <div className="litany-foot">
          {hasGains && (
            <div className="litany-tally">
              {items.map((item) => (
                <div className="litany-stat" key={item.label}>
                  <div className="litany-stat-value">
                    <span className="litany-stat-sign" style={{ color: item.signColor }}>
                      {item.sign}
                    </span>
                    {item.value}
                  </div>
                  <div className="litany-stat-label">{item.label}</div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="litany-reengage" onClick={dismiss}>
            {w.dismiss}
            {'  ↗'}
          </button>
        </div>
      </div>
    </div>
  );
}
