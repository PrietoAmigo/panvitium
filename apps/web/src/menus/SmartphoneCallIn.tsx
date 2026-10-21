import { useEffect, useRef, useState, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import type { CallBeatView, CallInView } from '../game/callIn.js';
import { CALL_AUDIO_BASE, CALL_PLATE_ANSWERING, CALL_PLATE_BASE } from './calls-in.data.js';
import { DegradedScene } from './DegradedScene.js';
import type { BoundInvocationVisual } from './types.js';

/**
 * "The voice in the room" — the answered incoming-call stage (Claude Design handoff, "Smartphone
 * Call-In System"). A self-framed full-viewport overlay (mounted by App like Magna Goetia / the PC /
 * the dialer, NOT via PanelShell). It is opened ALREADY ANSWERED — the `ring` phase lives in the
 * room (the studio backdrop swaps + the phone vibrates; see `useIncomingCall`), and tapping the
 * phone there is the answer gesture that mounts this. An outgoing call placed from the dialer plays
 * here too. From here the call walks its own FSM, one beat at a time:
 *
 *   speaking → ready → done → fading   (a recording: its mp3 plays, options reveal on `ended`)
 *   type     → ready → done → fading   (a typed line: the typewriter writes it out)
 *   speaking → type → …                (a recording whose mp3 cannot play falls back to its typed
 *                                       `line`, when it has one: a call can ship before it is recorded)
 *   … → done → speaking | silence → …  (a pick with a `next` beat: the caller's next recording, or a
 *                                       silence counted from the pick, then that beat's options)
 *
 * A beat with no options ends the call when it does. Tap the stage to skip (cut the recording or the
 * silence short / reveal the full text + options at once), unless the call is unskippable; pick an
 * option to go on or resolve. Purely presentational: it owns only the transient beat/phase/typed/
 * chosen state and the imperative audio/timer handles; the choice EFFECT is the integrator's
 * `onChoose` hook (App routes it to the store's `answerCall`, which applies the option's effects —
 * docs/PANVITIUM-CALLS-IN.md), and `onDone` unmounts the overlay once the call has faded.
 */

type Phase = 'speaking' | 'type' | 'silence' | 'ready' | 'done' | 'fading';

export interface SmartphoneCallInProps {
  /** The resolved call (caller, tag, line, choices) — see `buildCallInView`. */
  call: CallInView;
  /** Fired the instant an option is picked, with the catalogue path to it: the picked choice's
   *  catalogue index at each beat so far (e.g. `[0]`, then `[0, 0]`). The effect hook lands here. */
  onChoose: (path: readonly number[]) => void;
  /** Fired when the call has fully resolved (after the ~1.65s fade cadence) — unmount the overlay. */
  onDone: () => void;
  /** Typewriter base interval (ms/char) for typed calls. Default 32. */
  textSpeedMs?: number;
  /** Answered-plate translucency (scrim alpha = value × 0.6). Keep < 1 so the room shows through. */
  plateOpacity?: number;
  /** Base path for the call recordings (`<recording>.mp3`). Default `/assets/panvitium/music/`. */
  audioBase?: string;
  /** The stage's accessible name. Default "Incoming call"; an outgoing call passes its own. */
  label?: string;
  /** The Studio's bound invocation figures (`boundVisualsFor('studio', …)`), composited into both
   *  plates so whatever stands in the room stays there while the call is answered. */
  figures?: BoundInvocationVisual[];
}

// A stable empty, so an omitted list doesn't read as a new scene on every render.
const NO_FIGURES: BoundInvocationVisual[] = [];

// Choose → reset cadence (design): pick → `done` at once; +950ms → `fading`; +1650ms → resolved.
const DONE_TO_FADING_MS = 950;
const DONE_TO_RESOLVED_MS = 1650;
// A pick that goes on holds lit this long before the next beat starts.
const PICK_HOLD_MS = 950;
// Typewriter punctuation pauses, as multiples of the base interval — the cadence of speech.
const SENTENCE_PAUSE = 14; // after . ! ?
const CLAUSE_PAUSE = 7; // after , ; : —

/** Audio safety-reveal fallback (s) when the mp3's real duration is unknown: ~0.42s/word, 4–12s.
 *  A recording's `line` is only its typed fallback, so this usually floors at 4s; the real
 *  `ended`/`loadedmetadata` events drive the reveal when the audio is present. */
function estimateDuration(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.min(12, words * 0.42));
}

/** The call's opening beat: its first recording (or typed line) and its first options. */
function openingBeat(call: CallInView): CallBeatView {
  return {
    recording: call.audio ? call.recording : null,
    silenceSec: 0,
    line: call.line,
    choices: call.choices,
  };
}

/** The phase a beat opens in: a recording speaks, a silence holds, anything else is typed. */
function beatPhase(beat: CallBeatView): Phase {
  if (beat.recording !== null) return 'speaking';
  return beat.silenceSec > 0 ? 'silence' : 'type';
}

export function SmartphoneCallIn({
  call,
  onChoose,
  onDone,
  textSpeedMs = 32,
  plateOpacity = 0.66,
  audioBase = CALL_AUDIO_BASE,
  label = 'Incoming call',
  figures = NO_FIGURES,
}: SmartphoneCallInProps): ReactElement {
  // The beat on stage (the opening, then each pick's `next`), mirrored on a ref for the handlers.
  const [beat, setBeatState] = useState<CallBeatView>(() => openingBeat(call));
  const beatRef = useRef<CallBeatView>(beat);
  const [phase, setPhaseState] = useState<Phase>(() => beatPhase(beat));
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);
  // A recording that could not play and is being written out from its typed `line` instead.
  const [typedFallback, setTypedFallback] = useState(false);
  // The catalogue path picked so far (see `onChoose`).
  const path = useRef<number[]>([]);

  // Event handlers read the live phase off a ref (their closures would otherwise see a stale value).
  const phaseRef = useRef<Phase>(phase);
  const setPhase = (p: Phase): void => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  // Imperative handles to tear down. A generation counter guards async callbacks (audio `ended`, the
  // safety timer) so a stale timer from a skipped/finished beat can never reveal options into a new
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

  // The call ends: the stage fades, then resolves.
  const endCall = (): void => {
    setPhase('done');
    timers.current.fade = setTimeout(() => setPhase('fading'), DONE_TO_FADING_MS);
    timers.current.arm = setTimeout(() => onDone(), DONE_TO_RESOLVED_MS);
  };

  // A beat is over: offer its options, or end the call when it has none.
  const finishBeat = (b: CallBeatView): void => {
    if (b.choices.length > 0) setPhase('ready');
    else endCall();
  };

  // Typewriter: write the beat's line out one char at a time, with punctuation pauses.
  const startTyping = (b: CallBeatView): void => {
    const line = b.line;
    let i = 0;
    const step = (): void => {
      if (phaseRef.current !== 'type') return;
      i += 1;
      setTyped(line.slice(0, i));
      if (i >= line.length) {
        finishBeat(b);
        return;
      }
      const ch = line[i - 1] ?? '';
      let d = textSpeedMs;
      if ('.!?'.includes(ch)) d = textSpeedMs * SENTENCE_PAUSE;
      else if (',;:—'.includes(ch)) d = textSpeedMs * CLAUSE_PAUSE;
      timers.current.type = setTimeout(step, d);
    };
    timers.current.type = setTimeout(step, textSpeedMs);
  };

  // Put a beat on stage and run it. `heldMs` is how long the pick that led here already held, which
  // a silence (counted from the pick) has already spent.
  const enterBeat = (b: CallBeatView, heldMs: number): void => {
    beatRef.current = b;
    setBeatState(b);
    setChosen(null);
    setTyped('');
    setTypedFallback(false);
    const g = ++gen.current;
    // reveal: the beat is over. Guarded so only the current generation fires.
    const reveal = (): void => {
      if (g !== gen.current) return;
      clearTimers();
      stopVoice();
      gen.current += 1;
      finishBeat(b);
    };
    if (b.recording !== null) {
      setPhase('speaking');
      // Safety / fileless fallback so a missing mp3 (tests, preview) still flows on.
      timers.current.sim = setTimeout(reveal, estimateDuration(b.line) * 1000);
      try {
        const a = new Audio(audioBase + b.recording + '.mp3');
        voice.current = a;
        a.preload = 'auto';
        a.addEventListener('ended', reveal);
        // The mp3 is missing or unplayable: a beat with a typed `line` writes it out instead; one
        // without keeps the safety timer, which still moves the call on.
        a.addEventListener('error', () => {
          if (g !== gen.current || b.line.length === 0) return;
          clearTimers();
          stopVoice();
          gen.current += 1;
          setTypedFallback(true);
          setPhase('type');
          startTyping(b);
        });
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
    } else if (b.silenceSec > 0) {
      setPhase('silence');
      timers.current.sim = setTimeout(reveal, Math.max(0, b.silenceSec * 1000 - heldMs));
    } else {
      setPhase('type');
      startTyping(b);
    }
  };

  // ── Kick the call off on mount; tear everything down on unmount. The component is keyed per call in
  // App, so `call.id` is fixed for its mounted life — start exactly once.
  useEffect(() => {
    gen.current = 0;
    enterBeat(beatRef.current, 0);
    return () => {
      clearTimers();
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per mounted call (keyed by id)
  }, [call.id]);

  // ── Tap-to-skip (the stage), unless the call is unskippable. Options handle their own clicks;
  // ready/done/fading ignore stage taps.
  const onStageClick = (): void => {
    if (!call.skippable) return;
    const p = phaseRef.current;
    if (p === 'speaking' || p === 'silence') {
      gen.current += 1; // invalidate the beat's pending reveal
      clearTimers();
      stopVoice();
      finishBeat(beatRef.current);
    } else if (p === 'type') {
      clearTimers();
      setTyped(beatRef.current.line);
      finishBeat(beatRef.current);
    }
  };

  const choose = (i: number): void => {
    if (phaseRef.current !== 'ready') return;
    const choice = beatRef.current.choices[i];
    if (!choice) return;
    clearTimers();
    stopVoice();
    setPhase('done');
    setChosen(i);
    path.current = [...path.current, choice.index];
    onChoose(path.current);
    const next = choice.next;
    if (next) {
      // The pick holds lit for a moment, then the conversation goes on.
      timers.current.fade = setTimeout(() => enterBeat(next, PICK_HOLD_MS), PICK_HOLD_MS);
      return;
    }
    timers.current.fade = setTimeout(() => setPhase('fading'), DONE_TO_FADING_MS);
    timers.current.arm = setTimeout(() => onDone(), DONE_TO_RESOLVED_MS);
  };

  // ── Derived presentation (mirrors the design's `renderVals`). ──────────────────────────────────
  const choicesShown = phase === 'ready' || phase === 'done' || phase === 'fading';
  // A recording or a silence shows the big caller name; a typed beat (or fallback) shows its text.
  const isAudio = (beat.recording !== null || beat.silenceSec > 0) && !typedFallback;
  const speaking = phase === 'speaking';
  const silence = phase === 'silence';
  const showCaller = isAudio && (speaking || silence || choicesShown);
  const showTag = !isAudio && phase !== 'speaking';
  const showText = !isAudio && phase !== 'speaking';
  const answeringBg = speaking || silence || phase === 'type' || phase === 'ready' ? 1 : 0;
  const overlayOpacity = phase === 'fading' ? 0 : 1;
  const scrimBg = `rgba(8,6,5,${(plateOpacity * 0.6).toFixed(3)})`;

  return (
    <div
      className="callin-stage"
      onClick={onStageClick}
      role="dialog"
      aria-label={label}
      aria-live="polite"
    >
      {/* Phase-driven background plates, composited THROUGH the degradation pass (ADR-021) so the
          call reads at the same crushed/pixelated fidelity as the room — the message + options sit
          ABOVE the degraded scene, not over a clean plate. The base resting plate shows through as
          the answered plate crossfades out on done/fading. The bound figures ride both plates, so
          the room's invocations never vanish when the phone is picked up. */}
      <DegradedScene roomId="studio" backdrop={CALL_PLATE_BASE} figures={figures} />
      <div
        className="callin-degraded-answering"
        style={{ opacity: answeringBg }}
        aria-hidden="true"
      >
        <DegradedScene roomId="studio" backdrop={CALL_PLATE_ANSWERING} figures={figures} />
      </div>
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
              {speaking && call.skippable && (
                <div className="callin-hint">{strings.phone.callIn.skip}</div>
              )}
            </div>
          )}

          {showText && <div className="callin-text">{typed}</div>}

          {choicesShown && (
            <div className="callin-choices">
              {beat.choices.map((c, i) => {
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
