import { useState, type CSSProperties, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import type { Maleficium, OracleGroup, Rarity } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// The Maleficia Shelf as a wall of carved NICHES: each owned maleficium sits in
// a recessed alcove in the black, lit from within by the colour of its rarity.
// Click a niche → a full-bleed close-up (large relic in an ember halo + name,
// rarity, flavour, effect, and — for consumables — the Use rite, and — for the
// oracular items — the live odds reveal). Items are shown ordered by rarity,
// anathema → common.
//
// Drop-in replacement for the previous MaleficiaCabinet: same props (`items`
// from `buildCabinet`, `onUse`), same `Maleficium` / `OracleGroup` types, same
// `strings`. All styling is inline — it needs none of the old `.mal-*` /
// `.oracle*` rules in menus.css, and it paints its own dark background.
// ─────────────────────────────────────────────────────────────────────────────

// Rarity → ember palette. One hue per tier; the wash is the same hue at low
// alpha (used for the in-niche glow), the ring a touch stronger (hover border).
const RARITY: Record<Rarity, { ember: string; wash: string; ring: string }> = {
  common: { ember: '#caa85f', wash: 'rgba(202,168,95,.22)', ring: 'rgba(202,168,95,.30)' },
  rare: { ember: '#54b39b', wash: 'rgba(84,179,155,.22)', ring: 'rgba(84,179,155,.32)' },
  profane: { ember: '#9a6fe0', wash: 'rgba(154,111,224,.26)', ring: 'rgba(154,111,224,.34)' },
  anathema: { ember: '#c2403f', wash: 'rgba(194,64,63,.26)', ring: 'rgba(194,64,63,.34)' },
};

// Display order: most potent first.
const RANK: Record<Rarity, number> = { anathema: 4, profane: 3, rare: 2, common: 1 };

// Outcome-tier colours, best → worst (keys match the sim's TIER ids).
const TIER_COLOR: Record<string, string> = {
  stellar: '#e8c75a',
  excellent: '#9fbf7a',
  good: '#6aa37e',
  neutral: '#7a7388',
  bad: '#b0742e',
  terrible: '#9c2f24',
  apocalyptic: '#7c1417',
};

/** The oracular tier-distribution readout (legend + a labelled odds bar per action). */
function OracleReveal({ reveal }: { reveal: OracleGroup[] }): ReactElement {
  const legend = reveal[0]?.actions[0]?.tiers ?? [];
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
      <p
        style={{
          fontFamily: "'IM Fell English', serif",
          fontStyle: 'italic',
          fontSize: 12,
          color: '#7a7388',
          margin: '0 0 9px',
        }}
      >
        {strings.maleficia.oracleCaption}
      </p>
      {legend.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 11px', marginBottom: 11 }}>
          {legend.map((t) => (
            <span
              key={t.tier}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: "'Cinzel', serif",
                fontSize: 8.5,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: '#7a7388',
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: TIER_COLOR[t.tier] ?? '#7a7388',
                }}
              />
              {t.label}
            </span>
          ))}
        </div>
      )}
      {reveal.map((g) => (
        <div key={g.category} style={{ marginBottom: 9 }}>
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: '#a88cd2',
              marginBottom: 5,
            }}
          >
            {g.label}
          </div>
          {g.actions.map((a) => (
            <div
              key={a.action}
              style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}
            >
              <span
                style={{
                  flex: '0 0 92px',
                  fontFamily: "'IM Fell English', serif",
                  fontSize: 12.5,
                  color: '#a39bb4',
                }}
              >
                {a.name}
              </span>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  height: 11,
                  borderRadius: 2,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,.05)',
                }}
                role="img"
                aria-label={`${a.name}: ${a.tiers
                  .map((t) => `${t.label} ${Math.round(t.pct * 100)}%`)
                  .join(', ')}`}
              >
                {a.tiers.map((t) =>
                  t.pct > 0 ? (
                    <span
                      key={t.tier}
                      title={`${t.label} ${Math.round(t.pct * 100)}%`}
                      style={{
                        width: `${t.pct * 100}%`,
                        background: TIER_COLOR[t.tier] ?? '#7a7388',
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface MaleficiaCabinetProps {
  /** The player's owned maleficia (from `buildCabinet`); assumed non-empty. */
  items: Maleficium[];
  /** Activate a single-use consumable by id (Hand of Glory, Defixio). */
  onUse?: (id: string) => void;
}

export function MaleficiaCabinet({ items, onUse }: MaleficiaCabinetProps): ReactElement {
  const [sel, setSel] = useState<string | null>(null);

  // Ordered by rarity (anathema → common); stable within a tier.
  const ordered = [...items].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
  const m = sel !== null ? items.find((x) => x.id === sel) : undefined;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        // The design was authored on a tall standalone page; inside a panel the niche wall needs a
        // floor (so the absolute close-up always has room) and a ceiling (so the grid scrolls
        // internally rather than the panel body — which would otherwise scroll the close-up out of
        // view when many maleficia are owned).
        minHeight: 360,
        maxHeight: 'min(80vh, 700px)',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'radial-gradient(140% 90% at 50% 0%, #131119 0%, #09080c 60%, #040305 100%)',
        padding: '22px 24px 28px',
        fontFamily: "'EB Garamond', Georgia, serif",
      }}
    >
      <div
        className="niche-grid-scroll"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 10,
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          alignContent: 'start',
        }}
      >
        {ordered.map((it) => {
          const R = RARITY[it.rarity];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setSel(it.id)}
              title={it.name}
              aria-label={it.name}
              style={{
                position: 'relative',
                border: '1px solid rgba(0,0,0,.7)',
                borderRadius: 5,
                padding: 0,
                cursor: 'pointer',
                height: 138,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                background: 'linear-gradient(180deg,#0c0b10 0%,#070609 100%)',
                // carved alcove: deep top shadow + ember rising from the floor
                boxShadow: `inset 0 9px 20px rgba(0,0,0,.95), inset 0 -22px 26px ${R.wash}, inset 0 1px 0 rgba(255,255,255,.04)`,
                transition: 'box-shadow .15s ease, border-color .15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `inset 0 9px 20px rgba(0,0,0,.9), inset 0 -30px 34px ${R.wash}, 0 0 18px ${R.wash}`;
                e.currentTarget.style.borderColor = R.ring;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `inset 0 9px 20px rgba(0,0,0,.95), inset 0 -22px 26px ${R.wash}, inset 0 1px 0 rgba(255,255,255,.04)`;
                e.currentTarget.style.borderColor = 'rgba(0,0,0,.7)';
              }}
            >
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingTop: 8,
                }}
              >
                {it.img ? (
                  <img
                    src={it.img}
                    alt={it.name}
                    style={{
                      maxWidth: 74,
                      maxHeight: 84,
                      objectFit: 'contain',
                      filter: `drop-shadow(0 4px 8px rgba(0,0,0,.8)) drop-shadow(0 0 6px ${R.ember})`,
                      opacity: 0.9,
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 4,
                      border: `1px dashed ${R.ring}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'IM Fell English SC', serif",
                      fontSize: 10,
                      color: R.ember,
                      textAlign: 'center',
                      padding: '0 5px',
                    }}
                  >
                    {it.name}
                  </span>
                )}
                {it.use && (
                  <span
                    title="Single-use"
                    style={{
                      position: 'absolute',
                      top: 5,
                      left: 6,
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#c2403f',
                      boxShadow: '0 0 6px #c2403f',
                    }}
                  />
                )}
                {it.reveal && (
                  <span
                    title="Scrying"
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: 5,
                      fontSize: 10,
                      color: '#54b39b',
                    }}
                  >
                    ✦
                  </span>
                )}
              </div>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  padding: '5px 4px 7px',
                  borderTop: '1px solid rgba(255,255,255,.05)',
                  background: 'rgba(0,0,0,.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "'IM Fell English', serif",
                    fontSize: 10.5,
                    color: '#b3acc4',
                    textAlign: 'center',
                    lineHeight: 1.1,
                  }}
                >
                  {it.name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: R.ember }} />
                  <span
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: 7.5,
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: '#6a637a',
                    }}
                  >
                    {strings.maleficia.rarity[it.rarity]}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {m && <NicheDetail item={m} onClose={() => setSel(null)} {...(onUse ? { onUse } : {})} />}
    </div>
  );
}

/** The full-bleed close-up shown over the grid when a niche is opened. */
function NicheDetail({
  item: m,
  onUse,
  onClose,
}: {
  item: Maleficium;
  onUse?: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const R = RARITY[m.rarity];
  const emberText: CSSProperties = {
    fontFamily: "'Cinzel', serif",
    fontSize: 10,
    letterSpacing: '.3em',
    textTransform: 'uppercase',
    color: R.ember,
  };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 36% 45%, rgba(10,8,14,.86), rgba(3,2,4,.97))',
        display: 'flex',
        // Scroll (rather than clip) when a full four-category oracular reveal is taller than the
        // panel; `margin:auto` on the row centres it when it fits and keeps the top reachable when
        // it doesn't (justify-content:center would clip the overflow).
        overflowY: 'auto',
        padding: '30px 46px',
      }}
    >
      {/* text column is pushed well clear of the relic's glow ring (76px gap) */}
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          margin: 'auto',
          display: 'flex',
          gap: 76,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: '0 0 196px',
            position: 'relative',
            height: 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              position: 'absolute',
              width: 228,
              height: 228,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${R.wash}, transparent 66%)`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              width: 248,
              height: 248,
              borderRadius: '50%',
              border: `1px solid ${R.ring}`,
            }}
          />
          {m.img ? (
            <img
              src={m.img}
              alt={m.name}
              style={{
                position: 'relative',
                maxWidth: 168,
                maxHeight: 248,
                objectFit: 'contain',
                filter: `drop-shadow(0 0 18px ${R.ember}) drop-shadow(0 10px 20px rgba(0,0,0,.8))`,
              }}
            />
          ) : (
            <span
              style={{
                position: 'relative',
                fontFamily: "'IM Fell English SC', serif",
                fontSize: 18,
                color: R.ember,
                textAlign: 'center',
              }}
            >
              {m.name}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              letterSpacing: '.24em',
              textTransform: 'uppercase',
              color: '#6a637a',
              padding: 0,
              marginBottom: 14,
            }}
          >
            ‹ back to the niches
          </button>
          <div style={emberText}>{strings.maleficia.rarity[m.rarity]}</div>
          <h3
            style={{
              fontFamily: "'Cinzel', serif",
              fontWeight: 500,
              fontSize: 25,
              letterSpacing: '.04em',
              color: '#e6e0f0',
              margin: '8px 0 2px',
              lineHeight: 1.1,
            }}
          >
            {m.name}
          </h3>
          <p
            style={{
              fontFamily: "'IM Fell English', serif",
              fontStyle: 'italic',
              fontSize: 15.5,
              color: '#a39bb4',
              lineHeight: 1.55,
              margin: '13px 0 0',
            }}
          >
            {m.desc}
          </p>
          {m.effect && (
            <p
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 13.5,
                letterSpacing: '.03em',
                color: R.ember,
                margin: '14px 0 0',
                paddingTop: 11,
                borderTop: '1px solid rgba(255,255,255,.08)',
              }}
            >
              {m.effect}
            </p>
          )}

          {m.use && (
            <div style={{ marginTop: 16 }}>
              {m.use.status && (
                <p
                  style={{
                    fontFamily: "'IM Fell English', serif",
                    fontStyle: 'italic',
                    fontSize: 13,
                    color: '#9a7d6a',
                    margin: '0 0 8px',
                  }}
                >
                  {m.use.status}
                </p>
              )}
              <button
                type="button"
                disabled={!m.use.enabled}
                onClick={() => onUse?.(m.id)}
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 12,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  color: '#e6e0f0',
                  background: 'rgba(124,20,23,.18)',
                  border: '1px solid #7c1417',
                  borderRadius: 3,
                  padding: '10px 20px',
                  cursor: m.use.enabled ? 'pointer' : 'not-allowed',
                  opacity: m.use.enabled ? 1 : 0.55,
                }}
              >
                {m.use.label}
              </button>
            </div>
          )}

          {m.reveal && <OracleReveal reveal={m.reveal} />}
        </div>
      </div>
    </div>
  );
}
