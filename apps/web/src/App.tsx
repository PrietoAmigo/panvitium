import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useGameLoop } from './game/useGameLoop.js';
import { useIncomingCall } from './game/useIncomingCall.js';
import { buildCallInView, eligibleCallIds } from './game/callIn.js';
import { ROOMS } from './menus/menus.data.js';
import { RoomView } from './menus/RoomView.js';
import { SmartphoneCallIn } from './menus/SmartphoneCallIn.js';
import { CALL_PLATE_ANSWERING } from './menus/calls-in.data.js';
import { ArsGoetiaBook } from './menus/ArsGoetiaBook.js';
import type { RoomId, PanelId, HotspotAction } from './menus/types.js';
import { buildGoetia } from './game/invocations.js';
import { PANELS, PcDesk, SuasioScroll, PhoneDialer } from './ui/panels.js';
import { InfluenceGoldHud } from './ui/InfluenceGoldHud.js';
import { PanelShell, type PanelVariant } from './menus/PanelShell.js';
import { SignaturePopup } from './ui/SignaturePopup.js';
import { AchievementToast } from './ui/AchievementToast.js';
import { KatabasisModal } from './ui/KatabasisModal.js';
import { SyncPanel } from './ui/SyncPanel.js';
import { ConflictModal } from './ui/ConflictModal.js';
import { WelcomeBackModal } from './ui/WelcomeBackModal.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { TitleSequence } from './ui/TitleSequence.js';
import { Jumpscare, JUMPSCARE_IMG } from './ui/Jumpscare.js';
import { preloadImage } from './menus/DegradedScene.js';
import { useGameStore } from './store/gameStore.js';
import { audio } from './audio/audio.js';

/**
 * The themed shell each framed panel wears. The Maleficia shelf wears the dark "niche" frame (the
 * carved-alcove rework paints its own background, so it gets a near-frameless dark shell with a
 * float close rather than the old wooden case). Ars Goetia, the PC, the Suasio scroll and Katabasis
 * are their own full-surface overlays and don't appear here.
 */
const PANEL_SHELL: Partial<Record<PanelId, { variant: PanelVariant; hideHeader?: boolean }>> = {
  maleficia: { variant: 'niche', hideHeader: true },
};

/**
 * Tracks the `prefers-reduced-motion: reduce` media query, reactively. Used to soften the Fausto-curse
 * "Vertigo" layer (its sway/zoom/double-vision are vestibular triggers). SSR-safe: defaults to false
 * when `matchMedia` is unavailable.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * The full-screen Ars Goetia grimoire, wired to real state. Kept as its own subscriber so its
 * per-tick re-render (soul cost tracks the pool) stays local and doesn't re-render the room shell.
 */
function GoetiaBook({ onClose }: { onClose: () => void }): ReactElement {
  const state = useGameStore((s) => s.state);
  const summon = useGameStore((s) => s.summon);
  const banish = useGameStore((s) => s.banish);
  const view = state ? buildGoetia(state) : { invokingPower: '0', entries: [] };
  return (
    <ArsGoetiaBook
      entries={view.entries}
      invokingPower={view.invokingPower}
      onSummon={summon}
      onDispel={banish}
      onClose={onClose}
    />
  );
}

export function App(): ReactElement {
  useGameLoop();

  const [room, setRoom] = useState<RoomId>('altar');
  const [panel, setPanel] = useState<PanelId | null>(null);
  // The incoming call the player has answered (its id), shown as the full-screen call-in stage; null
  // when no call is on the line.
  const [answeredCall, setAnsweredCall] = useState<string | null>(null);
  const katabasisPhase = useGameStore((s) => s.katabasisPhase);
  const openKatabasis = useGameStore((s) => s.openKatabasis);
  const titleOpen = useGameStore((s) => s.titleOpen);
  const ready = useGameStore((s) => s.ready);

  // Inputs to incoming-call requirement-gating, each a stable primitive so App does not re-render
  // every tick: lifetime descents, the Fausto "friendly" branch (open until the threat reply is
  // sent), and a stable join of the inbox ids (unchanged across ticks unless mail actually arrives).
  const katabasisCount = useGameStore((s) => s.state?.katabasisCount ?? 0);
  const fcFriendly = useGameStore((s) => s.state?.lifetime.flagFCThreatSent !== true);
  const inboxKey = useGameStore((s) =>
    s.state ? s.state.lifetime.inbox.map((e) => e.id).join('|') : '',
  );

  // The Studio's red "panvitium" glow while that ritual runs (03 §2.3).
  const signature = useGameStore(
    (s) => s.state?.lifetime.activeToggles.includes('panvitium') ?? false,
  );
  // Fausto's curse (05): while his fourth letter sits unbroken in the inbox, the room sways and
  // doubles — the "Vertigo" degrade layer. Read straight off the flag; the pass eases it in/out.
  const curseActive = useGameStore((s) => s.state?.lifetime.flagFaustoCurse === true);
  // The curse's sway/zoom/double-vision are vestibular triggers; honour prefers-reduced-motion.
  const reducedMotion = usePrefersReducedMotion();
  // The currently-bound invocations. Select a stable primitive key (the sorted set of active ids)
  // so the room only re-renders when the summoned set actually changes, not every 10 Hz tick;
  // RoomView composites the designed display for any id that has one through the degradation pass.
  const summonedKey = useGameStore((s) => {
    const inv = s.state?.lifetime.invocations;
    if (!inv) return '';
    return Object.keys(inv)
      .filter((id) => (inv[id] ?? 0) > 0)
      .sort()
      .join(',');
  });
  const summoned = useMemo(() => (summonedKey ? summonedKey.split(',') : []), [summonedKey]);

  // The Altar backdrop varies with the acolyte count (0–4). A stable primitive selector, so this
  // only re-renders the room when an acolyte is gained/lost, not every tick.
  const acolytes = useGameStore((s) => s.state?.lifetime.acolytes.length ?? 0);

  // The one-time Doppelgänger jumpscare. It arms when a Doppelgänger is bound for the FIRST time ever
  // (the permanent `flagDoppelgaengerSeen` is still unset) and the player is in the Studio; the next
  // interaction (PC / phone / Suasio / the door) then triggers the scare instead of its action.
  const doppelgaengerSeen = useGameStore((s) => s.state?.flagDoppelgaengerSeen ?? false);
  const markDoppelgaengerSeen = useGameStore((s) => s.markDoppelgaengerSeen);
  const [jumpscareArmed, setJumpscareArmed] = useState(false);
  const [jumpscare, setJumpscare] = useState(false);
  const doppelgaengerBound = summoned.includes('doppelgaenger');
  useEffect(() => {
    // Arm once the conditions hold (bound + first time + in the Studio). Stays armed until the next
    // interaction consumes it, so even leaving via the door triggers the scare rather than escaping it.
    if (room === 'studio' && doppelgaengerBound && !doppelgaengerSeen) {
      setJumpscareArmed(true);
      // Decode the plate now (while armed) so the overlay paints it on its first frame — no black flash.
      preloadImage(JUMPSCARE_IMG);
    }
  }, [room, doppelgaengerBound, doppelgaengerSeen]);

  // The descent takes the full screen; close any grimoire panel when it opens.
  useEffect(() => {
    if (katabasisPhase !== null) setPanel(null);
  }, [katabasisPhase]);

  // A call may ring only during eligible active play with the phone reachable: live session, not in
  // the title or a descent, standing in the Studio with no panel/overlay open, and no call already
  // answered or jumpscare running (06-smartphone-content.md §2: active play only, dark in Katabasis).
  const callInEnabled =
    ready &&
    katabasisPhase === null &&
    !titleOpen &&
    room === 'studio' &&
    panel === null &&
    answeredCall === null &&
    !jumpscare;
  // Only calls whose requirements are met may be drawn (e.g. the mutually-exclusive Succubus/Astiwihad
  // lines, gated on the Fausto branch). Memoised off the primitive inputs so it changes only when the
  // gated state does, not every tick.
  const eligibleIds = useMemo(
    () =>
      eligibleCallIds({
        katabasisCount,
        fcFriendly,
        receivedEmailIds: new Set(inboxKey ? inboxKey.split('|') : []),
      }),
    [katabasisCount, fcFriendly, inboxKey],
  );
  const { ringing, answer } = useIncomingCall(callInEnabled, eligibleIds);
  const callInView = answeredCall ? buildCallInView(answeredCall) : null;
  // Defensive: an answered id that has no view (would never happen for catalogue ids) must not strand
  // the line — clear it so a new call can ring.
  useEffect(() => {
    if (answeredCall !== null && callInView === null) setAnsweredCall(null);
  }, [answeredCall, callInView]);
  // Decode the answered plate while the call is still ringing, so the degraded answering scene paints
  // on its first frame when the player picks up (no black flash).
  useEffect(() => {
    if (ringing !== null) preloadImage(CALL_PLATE_ANSWERING);
  }, [ringing]);

  const handleAction = (action: HotspotAction): void => {
    // While armed, the player's very next interaction is replaced by the one-time Doppelgänger scare
    // (no menu opens, no room change). Consume the arming, mark it seen (permanent + persisted), and
    // raise the overlay. Guard on `jumpscare` so a stray event during the scare can't re-fire it.
    if (jumpscareArmed && !jumpscare) {
      setJumpscareArmed(false);
      setJumpscare(true);
      markDoppelgaengerSeen();
      return;
    }
    if (action.type === 'door') {
      setRoom(action.to);
      audio.play('room-change');
    } else if (action.type === 'altar') {
      // The Altar opens the full-screen gate straight away (no ledger step); the gate is where the
      // player commits to the descent or turns back. Nothing is torn down until they commit there.
      openKatabasis();
      audio.play('panel-open');
    } else if (action.panel === 'phone' && ringing !== null) {
      // A call is ringing on the desk: answering the incoming call takes priority over opening the
      // dial-out pad. Tapping the phone IS the answer gesture — raise the full-screen call-in stage.
      const id = answer();
      if (id) setAnsweredCall(id);
      else setPanel('phone');
      audio.play('panel-open');
    } else {
      setPanel(action.panel);
      audio.play('panel-open');
    }
  };

  const closePanel = (): void => {
    setPanel(null);
    audio.play('panel-close');
  };

  // Ars Goetia, the PC, the Suasio scroll and the smartphone dialer are their own full-surface
  // overlays (designed grimoire / desk / parchment / phone), not framed Panels.
  const activePanel =
    panel && panel !== 'ars-goetia' && panel !== 'pc' && panel !== 'suasio' && panel !== 'phone'
      ? PANELS[panel]
      : null;
  const shell = panel ? PANEL_SHELL[panel] : undefined;

  // The persistent Influence/Gold HUD rides over the Invocation and Studio rooms and over the
  // Maleficia shelf, the Ars Goetia book and the Suasio scroll — but not in the Altar room, not over
  // the PC desk or the Altar gate, not during a descent (the Altar gate + an ongoing Katabasis both
  // hold `katabasisPhase !== null`), and not behind the launch title menu. It mounts at the app
  // level (below) so it layers over those menu overlays rather than under them.
  const hudVisible =
    katabasisPhase === null &&
    room !== 'altar' &&
    panel !== 'pc' &&
    answeredCall === null &&
    !titleOpen;

  return (
    <div className="app">
      <main className="stage">
        <RoomView
          room={ROOMS[room]}
          signature={signature}
          summoned={summoned}
          doppelgaengerSeen={doppelgaengerSeen}
          acolytes={acolytes}
          curseActive={curseActive}
          reducedMotion={reducedMotion}
          ringing={ringing !== null}
          onAction={handleAction}
        />
        <div className="room-name">{ROOMS[room].title}</div>
      </main>
      <SignaturePopup />
      <AchievementToast />
      <KatabasisModal />
      <SyncPanel />
      <ConflictModal />
      <WelcomeBackModal />
      <SettingsPanel />
      <TitleSequence />
      {panel === 'ars-goetia' && <GoetiaBook onClose={closePanel} />}
      {panel === 'pc' && <PcDesk onClose={closePanel} />}
      {panel === 'suasio' && <SuasioScroll onClose={closePanel} />}
      {panel === 'phone' && <PhoneDialer onClose={closePanel} />}
      {/* The answered incoming call — a full-screen stage that takes over until the call resolves.
          Keyed by id so each call mounts fresh (its FSM starts at the answer). `onChoose` is the
          effect hook the calls-in engine will fill (docs/PANVITIUM-CALLS-IN.md); today picking an
          option only resolves the call, changing no game state. */}
      {callInView && (
        <SmartphoneCallIn
          key={answeredCall ?? ''}
          call={callInView}
          onChoose={() => {
            // TODO(wire): apply the chosen option's buff/effect through the store once the
            // incoming-call engine lands. Intentionally a no-op for now.
          }}
          onDone={() => setAnsweredCall(null)}
        />
      )}
      {activePanel && shell && (
        <PanelShell
          title={activePanel.title}
          variant={shell.variant}
          onClose={closePanel}
          {...(shell.hideHeader ? { hideHeader: true } : {})}
        >
          {activePanel.body}
        </PanelShell>
      )}
      {/* Rendered last (a sibling of the menu overlays above) so it layers over the Maleficia / Ars
          Goetia / Suasio surfaces, pinned to the viewport's top-left edge. */}
      {hudVisible && <InfluenceGoldHud />}
      {/* The one-time Doppelgänger scare covers EVERYTHING (highest layer), blocks all input, and
          clears itself after 2s — see Jumpscare. */}
      {jumpscare && <Jumpscare onDone={() => setJumpscare(false)} />}
    </div>
  );
}
