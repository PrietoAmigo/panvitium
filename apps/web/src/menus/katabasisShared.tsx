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
