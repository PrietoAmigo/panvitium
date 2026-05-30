import { useState, type ReactElement } from 'react';
import { SINS, SIGILS } from './menus.data.js';
import { useHold } from './useHold.js';

interface KatabasisProps {
  onClose: () => void;
}

function HoldButton({
  className,
  label,
  onTick,
  disabled,
}: {
  className?: string;
  label: string;
  onTick: () => void;
  disabled?: boolean;
}): ReactElement {
  const hold = useHold(onTick);
  const props = disabled ? {} : hold;
  return (
    <button
      type="button"
      className={'kat-hold ' + (className || '')}
      disabled={disabled}
      {...props}
    >
      {label}
    </button>
  );
}

function katPips(level: number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += i < level ? '\u25C6' : '\u25C7';
  return out;
}

// Katabasis — the demonic descent. Two pages: pour souls into the eight Cardinal
// Sins, or bind souls to the Goetia sigils. Press-and-hold to pour, ramping rate.
// Full-screen shell. TODO(wire): seed `pool` from the player's banked souls, and
// commit `poured`/`bound` to the sim on Ascend (and apply the resulting levels/sigils).
export function Katabasis({ onClose }: KatabasisProps): ReactElement {
  const [pool, setPool] = useState(666);
  const [page, setPage] = useState<'sins' | 'goetia'>('sins');
  const [poured, setPoured] = useState<Record<string, number>>({});
  const [bound, setBound] = useState<Record<number, number>>({});

  const offer = (latin: string) =>
    setPool((p) => {
      if (p <= 0) return p;
      setPoured((m) => ({ ...m, [latin]: (m[latin] || 0) + 1 }));
      return p - 1;
    });
  const bind = (n: number) =>
    setPool((p) => {
      if (p <= 0) return p;
      setBound((m) => ({ ...m, [n]: (m[n] || 0) + 1 }));
      return p - 1;
    });
  const free = (n: number) =>
    setBound((m) => {
      if (!m[n]) return m;
      setPool((p) => p + 1);
      return { ...m, [n]: m[n] - 1 };
    });

  return (
    <div className="katabasis" role="dialog" aria-label="Katabasis">
      <div className="kat-embers" aria-hidden="true" />
      <div className="kat-inner">
        <h1 className="kat-title">Katabasis</h1>
        <p className="kat-intro">
          You lie still; the soul descends to settle its accounts. Hold to pour souls — the longer
          you hold, the faster they flow.
        </p>
        <p className="kat-pool">
          Souls in the pool <strong>{pool}</strong>
        </p>

        <div className="kat-pager">
          <button
            type="button"
            className={'kat-tab' + (page === 'sins' ? ' kat-tab--active' : '')}
            onClick={() => setPage('sins')}
          >
            Cardinal Sins
          </button>
          <button
            type="button"
            className={'kat-tab' + (page === 'goetia' ? ' kat-tab--active' : '')}
            onClick={() => setPage('goetia')}
          >
            The Goetia
          </button>
        </div>

        {page === 'sins' ? (
          <div className="prince-grid">
            {SINS.map((s) => {
              const pour = poured[s.latin] || 0;
              const level = Math.min(4, s.level + Math.floor(pour / 60));
              return (
                <div className="prince-card" key={s.latin}>
                  <div className="prince-head">
                    <span className="prince-name">{s.prince}</span>
                    <span className="prince-sin">
                      {s.latin} · {s.english}
                    </span>
                  </div>
                  <span className="prince-pips">{katPips(level)}</span>
                  <span className="prince-devotion">
                    {s.devotion}
                    {pour > 0 ? ` + ${pour}` : ''}
                  </span>
                  <HoldButton
                    className="offer-hold"
                    label="Hold to offer"
                    onTick={() => offer(s.latin)}
                    disabled={pool <= 0}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sigil-grid">
            {SIGILS.map((g) => {
              const b = bound[g.n] || 0;
              return (
                <div className={'sigil-card' + (b > 0 ? ' sigil-card--bound' : '')} key={g.n}>
                  <div className="sigil-head">
                    <span className="sigil-seal">{g.n}</span>
                    <div className="sigil-meta">
                      <span className="sigil-name">{g.name}</span>
                      <span className="sigil-desc">{g.desc}</span>
                    </div>
                    <span className="sigil-bound">{b}</span>
                  </div>
                  <div className="sigil-actions">
                    <HoldButton
                      className="sigil-bind"
                      label="Hold to bind"
                      onTick={() => bind(g.n)}
                      disabled={pool <= 0}
                    />
                    <HoldButton
                      className="sigil-free"
                      label="Hold to free"
                      onTick={() => free(g.n)}
                      disabled={b <= 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="kat-ascend" onClick={onClose}>
          Ascend — rise to the world
        </button>
      </div>
    </div>
  );
}
