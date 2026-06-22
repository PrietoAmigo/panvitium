import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { gt, bn, type BigNum } from '@panvitium/sim';
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

  // Tally inclusion rules: resources only if gained; reprobates if net != 0. Influence is omitted
  // from the display by design — the payload still carries it.
  const items: Tally[] = [];
  const addGain = (label: string, v: BigNum): void => {
    if (gt(v, bn(0))) items.push({ label, sign: '+', value: formatBigNum(v), signColor: ACCENT });
  };
  addGain(strings.resources.souls, recap.souls);
  addGain(strings.resources.gold, recap.gold);
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
