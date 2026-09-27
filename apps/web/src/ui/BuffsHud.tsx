import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import {
  buffAriaLabel,
  buffKindLabel,
  buildBuffs,
  ringFraction,
  type BuffView,
} from '../game/buffs.js';
import { formatDuration, formatShortDuration } from '../game/format.js';
import { PixelSprite } from '../menus/PixelRelic.js';
import { RARITY } from '../menus/relics.js';
import { useGameStore } from '../store/gameStore.js';
import './buffs-hud.css';

/** The relic art's box inside a ring, in px (design handoff). */
const ART_BOX = 30;
/** Its art-pixel size: the Loculi's pixelation, finer (the reliquary's is 3) so a 30px relic reads. */
const ART_PIXEL = 2;
/** Art pixels on the relic's long side. The sprite pads one outline pixel each side, so this fills
 *  the box in whole art pixels (15 × 2px = 30px), crisp at 1× rather than smeared across fractions. */
const ART_GRID = ART_BOX / ART_PIXEL - 2;

/** The ring's middle: the relic in pixel art where it has art, else the magnitude glyph. */
function RingArt({ ring }: { ring: BuffView }): ReactElement {
  const glyph = <span className="buffs-hud-glyph">{ring.glyph}</span>;
  if (!ring.img || !ring.rarity) return glyph;
  return (
    <span className="buffs-hud-art">
      <PixelSprite
        src={ring.img}
        grid={ART_GRID}
        pixelSize={ART_PIXEL}
        rgb={RARITY[ring.rarity].rgb}
        fallback={glyph}
      />
    </span>
  );
}

/** The details card beside a hovered or focused ring. Its words are already in the ring's name. */
function BuffCard({ ring }: { ring: BuffView }): ReactElement {
  return (
    <div className="buffs-hud-card" aria-hidden="true">
      <div className="buffs-hud-card-head">
        <span className="buffs-hud-card-name">{ring.name}</span>
        <span className="buffs-hud-card-kind">{buffKindLabel(ring)}</span>
      </div>
      {ring.effects.map((e, i) => (
        <span key={i} className={'buffs-hud-card-effect' + (e.debuff ? ' is-debuff' : '')}>
          {e.text}
        </span>
      ))}
      <span className="buffs-hud-card-time">
        {formatDuration(ring.remainingSec * 1000)} {strings.maleficia.buffRemaining}
      </span>
    </div>
  );
}

/**
 * The temporary-buffs HUD (Claude Design "Temporary buffs HUD" handoff, board 2a): a column of
 * countdown rings between the Influence and Desidia vessels, one per live single-use maleficium or
 * answered call (maleficia first, each group soonest to expire first), wrapping into a further column
 * when the band is full. Each ring drains as its timer runs down and carries the relic art (or the
 * call's multiplier) with a short countdown beneath; hovering or focusing it opens a card with the
 * source, its effect lines and the exact time left. Renders nothing while no buff runs.
 *
 * Reads the stable `state` and derives the rings in render (the repo's Zustand guidance); the store's
 * 10 Hz tick redraws the countdowns, and a ring leaves on the tick its buff expires. Mounting and
 * visibility are owned by App (the Desidia rule: hidden over the Loculi).
 */
export function BuffsHud(): ReactElement | null {
  const state = useGameStore((s) => s.state);
  // The ring whose card is open: the last one hovered or focused (only one card at a time).
  const [openId, setOpenId] = useState<string | null>(null);
  const rings = state ? buildBuffs(state) : [];
  const openRingLive = rings.some((r) => r.id === openId);
  // A ring that ran out under the pointer never saw its mouseleave. Forget it, or its card would
  // spring open by itself when the same source runs again.
  useEffect(() => {
    if (openId !== null && !openRingLive) setOpenId(null);
  }, [openId, openRingLive]);

  if (rings.length === 0) return null;
  const release = (id: string): void => setOpenId((cur) => (cur === id ? null : cur));

  return (
    <div className="buffs-hud" role="group" aria-label={strings.buffs.label}>
      {rings.map((ring) => (
        <div
          key={ring.id}
          className={`buffs-hud-tile buffs-hud-tile--${ring.kind}`}
          onMouseEnter={() => setOpenId(ring.id)}
          onMouseLeave={() => release(ring.id)}
        >
          <button
            type="button"
            className="buffs-hud-ring"
            style={{ '--buff-fill': `${(ringFraction(ring) * 100).toFixed(2)}%` } as CSSProperties}
            aria-label={buffAriaLabel(ring)}
            onFocus={() => setOpenId(ring.id)}
            onBlur={() => release(ring.id)}
          >
            <span className="buffs-hud-disc">
              <RingArt ring={ring} />
            </span>
          </button>
          <span className="buffs-hud-time" aria-hidden="true">
            {formatShortDuration(ring.remainingSec * 1000)}
          </span>
          {openId === ring.id && <BuffCard ring={ring} />}
        </div>
      ))}
    </div>
  );
}
