import { type ReactElement } from 'react';

/** One temptation as shown on the scroll. Locked actions render their Sin gate instead of a cost. */
export interface SuasioActionView {
  id: string;
  name: string;
  /** Efficiency-scaled cost label, e.g. "5 Influence · 5s". */
  cost: string;
  /** True while a rite is underway, the player can't afford it, or it is still locked. */
  disabled: boolean;
  /** Not yet unlocked at the required Sin level. */
  locked: boolean;
  /** Gate label for a locked action, e.g. "Luxuria 2". */
  lockLabel?: string;
  /** Fire the real action. */
  onTempt: () => void;
}

interface SuasioPanelProps {
  intro: string;
  actions: readonly SuasioActionView[];
}

// The Suasio scroll — the three temptations, written to be spoken. Rendered inside
// <PanelShell variant="scroll"/>. Driven by the real actions; outcomes surface in the PC's Logs.
export function SuasioPanel({ intro, actions }: SuasioPanelProps): ReactElement {
  return (
    <div>
      <p className="opera-intro">{intro}</p>
      {actions.map((a) => (
        <div key={a.id} className={'opera-action' + (a.locked ? ' opera-action--locked' : '')}>
          <div className="opera-meta">
            <span className="opera-name">{a.name}</span>
            <span className="opera-cost">{a.locked ? (a.lockLabel ?? 'Locked') : a.cost}</span>
          </div>
          <button type="button" className="opera-btn" disabled={a.disabled} onClick={a.onTempt}>
            {a.locked ? 'Locked' : 'Tempt'}
          </button>
        </div>
      ))}
    </div>
  );
}
