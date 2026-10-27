import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

// Shared Katabasis primitives, kept in their own module so the descent screen (Katabasis.tsx)
// and the sigil sphere (AetherSigils.tsx) can both import them WITHOUT importing each other —
// a circular import here previously read SEMET_ID before it was initialised and blanked the app.

export const SEMET_ID = 32;

/**
 * A seal's effect label, as the Status Quo ledger and the Aether browse bar show it: the boon text
 * with every ↑/↓ direction arrow kept (one per leg on a composite seal, Andrealphus #65: "Invocation
 * costs ↓, Desidia speed ↑"), so the label always says which way the seal pushes, with or without
 * the live magnitude beside it. Only a trailing "(flat)" qualifier is dropped (e.g. "Murder rate ↑
 * (flat)" → "Murder rate ↑"); the ledger's magnitude carries the flat per-second unit.
 */
export function boonLabel(desc: string): string {
  return desc.replace(/\s*\(flat\)\s*$/i, '').trimEnd();
}

// ── Press-and-hold pour (exponential ramp) ───────────────────────────────────
// A tap pours a little; the longer the hold, the faster souls flow. Each tick reads fresh state
// through `onStep`, so the store clamps to the available pool / bound. Constants from the handoff.
const HOLD_BASE = 8;
const HOLD_GROWTH = 22;
const HOLD_RAMP_MS = 550;
const HOLD_STEP_MS = 60;
const HOLD_MAX_STEP = 2.5e9;

/**
 * The press-and-hold pour, apart from any element: `begin` (wire it to `onPointerDown`) starts the
 * ramp, stepping `onStep` every HOLD_STEP_MS; it stops on pointerup / pointercancel anywhere in the
 * window, or on `stop` (wire it to `onPointerLeave`). While `disabled` a press does nothing. The
 * HoldButton is one target; the end-state obelisk, an invisible hotspot, is another.
 */
export function useHoldPour(
  onStep: (delta: number) => void,
  disabled = false,
): { holding: boolean; begin: () => void; stop: () => void } {
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

  return { holding, begin, stop };
}

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
  const { holding, begin, stop } = useHoldPour(onStep, disabled);

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
