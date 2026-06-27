import { useEffect, useRef, useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import type { CallInView } from '../game/callIn.js';
import { CALL_AUDIO_BASE, CALL_PLATE_ANSWERING, CALL_PLATE_BASE } from './calls-in.data.js';

/**
 * "The voice in the room" — the answered incoming-call stage (Claude Design handoff, "Smartphone
 * Call-In System"). A self-framed full-viewport overlay (mounted by App like Ars Goetia / the PC /
 * the dialer, NOT via PanelShell). It is opened ALREADY ANSWERED — the `ring` phase lives in the
 * room (the studio backdrop swaps + the phone vibrates; see `useIncomingCall`), and tapping the
 * phone there is the answer gesture that mounts this. From here the call walks its own FSM:
 *
 *   speaking → ready → done → fading   (a recording: its mp3 plays, options reveal on `ended`)
 *   type     → ready → done → fading   (a typed line: the typewriter writes it out)
 *
 * Tap the stage to skip (cut the recording short / reveal the full text + options at once); pick an
 * option to resolve. Purely presentational: it owns only the transient phase/typed/chosen state and
 * the imperative audio/timer handles; the choice EFFECT is the integrator's `onChoose` hook (a
 * documented stub until the calls-in engine lands — docs/PANVITIUM-CALLS-IN.md), and `onDone` unmounts
 * the overlay once the call has faded.
 */

type Phase = 'speaking' | 'type' | 'ready' | 'done' | 'fading';

export interface SmartphoneCallInProps {
  /** The resolved call (caller, tag, line, choices) — see `buildCallInView`. */
  call: CallInView;
  /** Fired the instant an option is picked (index into `call.choices`). The effect hook lands here. */
  onChoose: (choiceIndex: number) => void;
  /** Fired when the call has fully resolved (after the ~1.65s fade cadence) — unmount the overlay. */
  onDone: () => void;
  /** Typewriter base interval (ms/char) for typed calls. Default 32. */
  textSpeedMs?: number;
  /** Answered-plate translucency (scrim alpha = value × 0.6). Keep < 1 so the room shows through. */
  plateOpacity?: number;
  /** Base path for the call recordings (`<id>.mp3`). Default `/assets/panvitium/music/`. */
  audioBase?: string;
}

// Choose → reset cadence (design): pick → `done` at once; +950ms → `fading`; +1650ms → resolved.
const DONE_TO_FADING_MS = 950;
const DONE_TO_RESOLVED_MS = 1650;
// Typewriter punctuation pauses, as multiples of the base interval — the cadence of speech.
const SENTENCE_PAUSE = 14; // after . ! ?
const CLAUSE_PAUSE = 7; // after , ; : —

/** Audio safety-reveal fallback (s) when the mp3's real duration is unknown: ~0.42s/word, 4–12s. */
function estimateDuration(call: CallInView): number {
  if (call.dur !== undefined) return call.dur;
  const words = call.line.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.min(12, words * 0.42));
}

export function SmartphoneCallIn({
  call,
  onChoose,
  onDone,
  textSpeedMs = 32,
  plateOpacity = 0.66,
  audioBase = CALL_AUDIO_BASE,
}: SmartphoneCallInProps): ReactElement {
  const [phase, setPhaseState] = useState<Phase>(call.audio ? 'speaking' : 'type');
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);

  // Event handlers read the live phase off a ref (their closures would otherwise see a stale value).
  const phaseRef = useRef<Phase>(phase);
  const setPhase = (p: Phase): void => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  // Imperative handles to tear down. A generation counter guards async callbacks (audio `ended`, the
  // safety timer) so a stale timer from a skipped/finished call can never reveal options into a new
  // phase — preserved from the design.
  const gen = useRef(0);
  const timers = useRef<{
    type: ReturnType<typeof setTimeout> | null;
    sim: ReturnType<typeof setTimeout> | null;
    fade: ReturnType<typeof setTimeout> | null;
    arm: ReturnType<typeof setTimeout> | null;
  }>({ type: null, sim: null, fade: null, arm: null });
  const voice = useRef<HTMLAudioElement | null>(null);

  const clearTimers = (): void => {
    for (const k of ['type', 'sim', 'fade', 'arm'] as const) {
      const t = timers.current[k];
      if (t) clearTimeout(t);
      timers.current[k] = null;
    }
  };
  const stopVoice = (): void => {
    if (voice.current) {
      try {
        voice.current.pause();
      } catch {
        /* element already gone */
      }
      voice.current = null;
    }
  };

  // ── Kick the call off on mount; tear everything down on unmount. The component is keyed per call in
  // App, so `call.id` is fixed for its mounted life — start exactly once.
  useEffect(() => {
    gen.current = 0;
    if (call.audio) {
      const g = ++gen.current;
      // reveal: stop the recording and show the options. Guarded so only the current generation fires.
      const reveal = (): void => {
        if (g !== gen.current) return;
        clearTimers();
        stopVoice();
        gen.current += 1;
        setPhase('ready');
      };
      // Safety / fileless fallback so a missing mp3 (tests, preview) still flows to the options.
      timers.current.sim = setTimeout(reveal, estimateDuration(call) * 1000);
      try {
        const a = new Audio(audioBase + call.id + '.mp3');
        voice.current = a;
        a.preload = 'auto';
        a.addEventListener('ended', reveal);
        a.addEventListener('loadedmetadata', () => {
          if (g !== gen.current) return;
          if (isFinite(a.duration) && a.duration > 0) {
            if (timers.current.sim) clearTimeout(timers.current.sim);
            timers.current.sim = setTimeout(reveal, (a.duration + 0.4) * 1000);
          }
        });
        void a.play().catch(() => undefined); // autoplay may be blocked — the safety timer still reveals
      } catch {
        /* no Audio (SSR/test) — the safety timer handles the reveal */
      }
    } else {
      // Typewriter: write the line out one char at a time, with punctuation pauses.
      const line = call.line;
      let i = 0;
      const step = (): void => {
        if (phaseRef.current !== 'type') return;
        i += 1;
        setTyped(line.slice(0, i));
        if (i >= line.length) {
          setPhase('ready');
          return;
        }
        const ch = line[i - 1] ?? '';
        let d = textSpeedMs;
        if ('.!?'.includes(ch)) d = textSpeedMs * SENTENCE_PAUSE;
        else if (',;:—'.includes(ch)) d = textSpeedMs * CLAUSE_PAUSE;
        timers.current.type = setTimeout(step, d);
      };
      timers.current.type = setTimeout(step, textSpeedMs);
    }
    return () => {
      clearTimers();
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per mounted call (keyed by id)
  }, [call.id]);

  // ── Tap-to-skip (the stage). Options handle their own clicks; ready/done/fading ignore stage taps.
  const onStageClick = (): void => {
    const p = phaseRef.current;
    if (p === 'speaking') {
      gen.current += 1; // invalidate the recording's pending reveal
      clearTimers();
      stopVoice();
      setPhase('ready');
    } else if (p === 'type') {
      clearTimers();
      setTyped(call.line);
      setPhase('ready');
    }
  };

  const choose = (i: number): void => {
    if (phaseRef.current !== 'ready') return;
    clearTimers();
    stopVoice();
    setPhase('done');
    setChosen(i);
    onChoose(i);
    timers.current.fade = setTimeout(() => setPhase('fading'), DONE_TO_FADING_MS);
    timers.current.arm = setTimeout(() => onDone(), DONE_TO_RESOLVED_MS);
  };

  // ── Derived presentation (mirrors the design's `renderVals`). ──────────────────────────────────
  const choicesShown = phase === 'ready' || phase === 'done' || phase === 'fading';
  const isAudio = call.audio;
  const speaking = phase === 'speaking';
  const showCaller = isAudio && (speaking || choicesShown);
  const showTag = !isAudio && phase !== 'speaking';
  const showText = !isAudio && phase !== 'speaking';
  const answeringBg = speaking || phase === 'type' || phase === 'ready' ? 1 : 0;
  const overlayOpacity = phase === 'fading' ? 0 : 1;
  const scrimBg = `rgba(8,6,5,${(plateOpacity * 0.6).toFixed(3)})`;

  return (
    <div
      className="callin-stage"
      onClick={onStageClick}
      role="dialog"
      aria-label="Incoming call"
      aria-live="polite"
    >
      {/* phase-driven background plates (base resting + crossfading answered) */}
      <div
        className="callin-plate"
        style={{ backgroundImage: `url('${CALL_PLATE_BASE}')` }}
        aria-hidden="true"
      />
      <div
        className="callin-plate callin-plate--answering"
        style={{ backgroundImage: `url('${CALL_PLATE_ANSWERING}')`, opacity: answeringBg }}
        aria-hidden="true"
      />
      <div className="callin-vignette" aria-hidden="true" />
      <div className="callin-kicker" aria-hidden="true">
        {strings.phone.callIn.kicker}
      </div>

      {/* the answered overlay — translucent, so the room stays behind */}
      <div className="callin-answered" style={{ opacity: overlayOpacity }}>
        <div className="callin-scrim" style={{ background: scrimBg }} aria-hidden="true" />
        <div className="callin-radial" aria-hidden="true" />
        <div className="callin-breath" aria-hidden="true" />

        <div className="callin-column">
          {showTag && (
            <div className="callin-tagrow">
              <span className="callin-rule callin-rule--l" aria-hidden="true" />
              <span className="callin-tag">{call.tag}</span>
              <span className="callin-rule callin-rule--r" aria-hidden="true" />
            </div>
          )}

          {showCaller && (
            <div className="callin-caller-block">
              <div className="callin-caller">{call.caller}</div>
              {speaking && <div className="callin-hint">{strings.phone.callIn.skip}</div>}
            </div>
          )}

          {showText && <div className="callin-text">{typed}</div>}

          {choicesShown && (
            <div className="callin-choices">
              {call.choices.map((c, i) => {
                const cls =
                  'callin-choice' +
                  (c.dim ? ' is-dim' : '') +
                  (chosen === i ? ' is-chosen' : '') +
                  (chosen !== null && chosen !== i ? ' is-faded' : '');
                return (
                  <button
                    type="button"
                    key={`${i}-${c.label}`}
                    className={cls}
                    style={{ animationDelay: `${(0.12 + i * 0.12).toFixed(2)}s` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      choose(i);
                    }}
                  >
                    <span className="callin-dash" aria-hidden="true">
                      {'—'}
                    </span>
                    {c.label}
                    {c.sub && <span className="callin-sub">{c.sub}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
