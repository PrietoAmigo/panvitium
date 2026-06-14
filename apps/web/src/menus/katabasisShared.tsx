import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

// Shared Katabasis primitives, kept in their own module so the descent screen (Katabasis.tsx)
// and the sigil sphere (AetherSigils.tsx) can both import them WITHOUT importing each other —
// a circular import here previously read SEMET_ID before it was initialised and blanked the app.

export const SEMET_ID = 32;

// ── Press-and-hold pour (exponential ramp) ───────────────────────────────────
// A tap pours a little; the longer the hold, the faster souls flow. Each tick reads fresh state
// through `onStep`, so the store clamps to the available pool / bound. Constants from the handoff.
const HOLD_BASE = 8;
const HOLD_GROWTH = 22;
const HOLD_RAMP_MS = 550;
const HOLD_STEP_MS = 60;
const HOLD_MAX_STEP = 2.5e9;

export function HoldButton({
  onStep,
  disabled = false,
  variant = 'blood',
  children,
  ariaLabel,
}: {
  onStep: (delta: number) => void;
  disabled?: boolean;
  variant?: 'blood' | 'ash';
  children: ReactNode;
  ariaLabel?: string;
}): ReactElement {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const [holding, setHolding] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    setHolding(false);
  }, []);

  const frame = useCallback((now: number) => {
    if (now - lastRef.current >= HOLD_STEP_MS) {
      lastRef.current = now;
      const held = now - startRef.current;
      const amt = Math.min(
        HOLD_MAX_STEP,
        Math.max(HOLD_BASE, Math.floor(HOLD_BASE * Math.pow(HOLD_GROWTH, held / HOLD_RAMP_MS))),
      );
      onStepRef.current(amt);
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const begin = useCallback(() => {
    if (disabled) return;
    stop();
    const now = performance.now();
    startRef.current = now;
    lastRef.current = now - HOLD_STEP_MS; // one step immediately on press
    setHolding(true);
    rafRef.current = requestAnimationFrame(frame);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [disabled, frame, stop]);

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      className={`hold-btn${variant === 'ash' ? ' hold-btn--ash' : ''}${holding ? ' is-holding' : ''}`}
      disabled={disabled}
      onPointerDown={begin}
      onPointerLeave={stop}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{children}</span>
    </button>
  );
}

// Concise boon per seal (the design handoff's GOETIA_DESC, derived from sim/sigils.ts effects).
// Used only as a fallback where `strings.sigils.descriptions` has no authoritative entry yet, so
// every seal reads meaningfully in the panel. '↑'/'↓' = raise/soften. Effect accuracy is deferred.
export const GOETIA_BOON: Record<number, string> = {
  1: 'Conversion rate \u2191',
  2: 'Indagatio fortune \u2191',
  3: 'Profane finds \u2191',
  4: 'Tristitia invocations \u2191',
  5: 'Influence gain \u2191',
  6: 'Gold gain \u2191',
  7: 'Reprobate generation \u2191',
  8: 'Gula invocations \u2191',
  9: 'Influence costs \u2193',
  10: 'The Familiar grows stronger',
  11: 'Terrible outcomes \u2193',
  12: 'The Succubus grows stronger',
  13: 'Decimatio fortune \u2191',
  14: 'Gold per Choleric kill',
  15: 'Celebrity conversion \u2191',
  16: 'Reprobate generation \u2193',
  17: 'Suasio mishaps \u2193',
  18: 'Acolyte efficiency \u2191',
  19: 'Offline gold \u2191',
  20: 'Gold kept on descent \u2191',
  21: 'Offline time \u2191',
  22: 'Decimatio mishaps \u2193',
  23: 'Choleric murder rate \u2191',
  24: 'Suasio success \u2191',
  25: 'Murder favours Celebrities',
  26: 'Vanagloria invocations \u2191',
  27: 'Nihilist suicide \u2191',
  28: 'Superbia invocations \u2191',
  29: 'Stellar Indagatio \u2191',
  30: 'Offline influence \u2191',
  31: 'Apocalyptic outcomes \u2193',
  32: 'All carried on descent \u2191',
  33: 'Sigma influence penalty \u2193',
  34: 'Luxuria invocations \u2191',
  35: 'Maximum influence \u2191',
  36: 'Rare finds \u2191',
  37: 'Celebrity conversion \u2191',
  38: 'Maleficia kept on descent \u2191',
  39: 'Celebrity gold penalty \u2193',
  40: 'Decimatio efficiency \u2191',
  41: 'Nihilist suicide \u2191',
  42: 'Ira invocations \u2191',
  43: 'Murder favours Gluttons',
  44: 'Avaritia invocations \u2191',
  45: 'Shutdown refund \u2191',
  46: 'Indagatio efficiency \u2191',
  47: 'Degenerate death penalty \u2193',
  48: 'Flat gold generation',
  49: 'Reprobate suicide rate \u2191',
  50: 'Double Indagatio find',
  51: 'Terrible outcomes \u2193',
  52: 'Acedia invocations \u2191',
  53: 'Murder favours Degenerates',
  54: 'Invocation efficiency \u2191',
  55: 'Invocation soul cost \u2193',
  56: 'Degenerate suicide penalty \u2193',
  57: 'Convert toward the minority',
  58: 'Emptio gold cost \u2193',
  59: 'Convert toward the majority',
  60: 'Vitium Mercatura output \u2191',
  61: 'Vitium Compositum output \u2191',
  62: 'Gambler generation penalty \u2193',
  63: 'Stellar Emptio \u2191',
  64: 'Cholerics murder Cholerics',
  65: 'Invoking power \u2191',
  66: 'Maleficia kept on descent \u2191',
  67: 'Choleric murder rate \u2191',
  68: 'Influence gain \u2191',
  69: 'Flat influence generation',
  70: 'Emptio efficiency \u2191',
  71: 'Suasio efficiency \u2191',
  72: 'Emptio fortune \u2191',
};
