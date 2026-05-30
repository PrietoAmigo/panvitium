import { type ReactElement } from 'react';
import { INVOCATION_BY_ID } from './menus.data.js';

interface SummonedCreaturesProps {
  summoned: string[];
}

// The currently-bound invocations, standing in the red circle on the Invocation
// Room floor. Positions/scale are tuned to that plate's circle. The prototype
// only ever shows one at a time, but this lays out N along a shallow arc.
export function SummonedCreatures({ summoned }: SummonedCreaturesProps): ReactElement | null {
  const n = summoned.length;
  if (n === 0) return null;
  const CENTER_X = 32.5,
    BASE_Y = 85,
    SPREAD = Math.min(24, 8 * (n - 1));
  return (
    <>
      {summoned.map((id, i) => {
        const iv = INVOCATION_BY_ID[id];
        if (!iv) return null;
        const frac = n === 1 ? 0.5 : i / (n - 1);
        const x = CENTER_X + (frac - 0.5) * SPREAD;
        const depth = Math.abs(frac - 0.5) * 2; // 0 at center, 1 at edges
        const h = 33 - depth * 4;
        const yb = BASE_Y - depth * 2.5;
        return (
          <img
            key={id + '-' + i}
            className="summon-creature"
            src={iv.img}
            alt={iv.name}
            style={{
              left: x + '%',
              bottom: 100 - yb + '%',
              height: h + '%',
              zIndex: 4 + Math.round((1 - depth) * 3),
              animationDelay: i * 0.07 + 's',
            }}
          />
        );
      })}
    </>
  );
}
