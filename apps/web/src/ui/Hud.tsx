import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { formatBigNum } from '../game/format.js';
import { ZERO, type BigNum } from '@panvitium/sim';

function Resource({ label, value }: { label: string; value: BigNum }): ReactElement {
  return (
    <div className="resource">
      <span className="resource-label">{label}</span>
      <span className="resource-value">{formatBigNum(value)}</span>
    </div>
  );
}

/**
 * The vigil indicator: shows logical session time, advancing with the tick loop. It is the
 * visible proof that the 10 Hz loop is running (resources stay still until the economy lands).
 * Isolated in its own component so its ~10 Hz re-render doesn't touch the rest of the HUD.
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
      <Vigil />
    </aside>
  );
}
