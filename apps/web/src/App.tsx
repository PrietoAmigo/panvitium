import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useGameLoop } from './game/useGameLoop.js';
import { useIncomingCall } from './game/useIncomingCall.js';
import { useAltarSigil } from './game/useAltarSigil.js';
import { buildCallInView, eligibleCallIds } from './game/callIn.js';
import { ROOMS } from './menus/menus.data.js';
import { RoomView } from './menus/RoomView.js';
import { SmartphoneCallIn } from './menus/SmartphoneCallIn.js';
import { CALL_PLATE_ANSWERING } from './menus/calls-in.data.js';
import { boundVisualsFor } from './menus/degrade.data.js';
import { MagnaGoetiaBook } from './menus/MagnaGoetiaBook.js';
import type { RoomId, PanelId, HotspotAction } from './menus/types.js';
import { buildGoetia } from './game/invocations.js';
import { Loculi, PcDesk, ChthonicLogos, PhoneDialer } from './ui/panels.js';
import { InfluenceGoldHud } from './ui/InfluenceGoldHud.js';
import { DesidiaHud } from './ui/DesidiaHud.js';
import { BuffsHud } from './ui/BuffsHud.js';
import { usePrefersReducedMotion } from './ui/usePrefersReducedMotion.js';
import { AchievementToast } from './ui/AchievementToast.js';
import { Unveiling } from './ui/Unveiling.js';
import { KatabasisModal } from './ui/KatabasisModal.js';
import { SyncPanel } from './ui/SyncPanel.js';
import { ConflictModal } from './ui/ConflictModal.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { TitleSequence } from './ui/TitleSequence.js';
import { Jumpscare, JUMPSCARE_IMG } from './ui/Jumpscare.js';
import { EmptyHandedWarning } from './ui/EmptyHandedWarning.js';
import { Subliminal } from './ui/Subliminal.js';
import { useRandomSubliminals } from './game/useRandomSubliminals.js';
import { preloadImage } from './menus/DegradedScene.js';
import { useGameStore } from './store/gameStore.js';
import { audio, summonCue } from './audio/audio.js';

/**
 * The full-screen Magna Goetia grimoire, wired to real state. Kept as its own subscriber so its
 * per-tick re-render (soul cost tracks the pool) stays local and doesn't re-render the room shell.
 */
function GoetiaBook({ onClose }: { onClose: () => void }): ReactElement {
  const state = useGameStore((s) => s.state);
  const summon = useGameStore((s) => s.summon);
  const banish = useGameStore((s) => s.banish);
  const view = state ? buildGoetia(state) : { invokingPower: '0', entries: [] };
  // A successful Summon may carry a cue (the Banshee's rare scream); played on the click itself, so
  // the user gesture satisfies the browser's autoplay policy. A refused summon never sounds.
  const onSummon = (id: string): void => {
    if (!summon(id)) return;
    const cue = summonCue(id);
    if (cue !== null) audio.play(cue);
  };
  return (
    <MagnaGoetiaBook
      entries={view.entries}
      invokingPower={view.invokingPower}
      onSummon={onSummon}
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
  const beginKatabasis = useGameStore((s) => s.beginKatabasis);
  const warnEmptyHanded = useGameStore((s) => s.warnEmptyHanded);
  const emptyHandedWarning = useGameStore((s) => s.emptyHandedWarning);
  const endEmptyHandedWarning = useGameStore((s) => s.endEmptyHandedWarning);
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
  // Desidia (the time-acceleration toggle): while active the room reads as a VHS tape shuttled forward, the
  // fast-forward degrade layer. Read straight off the flag; the pass eases it in/out.
  const desidiaActive = useGameStore((s) => s.state?.desidiaActive === true);
  // The curse's sway/zoom/double-vision and the fast-forward tracking motion are vestibular triggers;
  // honour prefers-reduced-motion (each layer drops its sub-effects).
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
  // interaction (PC / phone / Logos / the door) then triggers the scare instead of its action.
  const doppelgaengerSeen = useGameStore((s) => s.state?.flagDoppelgaengerSeen ?? false);
  // The Studio's bound figures, for the answered-call stage: it paints the Studio over the room, so
  // it composites the same figures the room does (picking up the phone never dismisses them).
  const studioFigures = useMemo(
    () => boundVisualsFor('studio', summoned, doppelgaengerSeen),
    [summoned, doppelgaengerSeen],
  );
  const markDoppelgaengerSeen = useGameStore((s) => s.markDoppelgaengerSeen);
  // Applies a chosen incoming-call option's effects to the game state (docs/PANVITIUM-CALLS-IN.md).
  const answerCall = useGameStore((s) => s.answerCall);
  // Records a picked-up call in the save, so an answered once-only call (lore, easter egg) never
  // rings again, even after a reload.
  const markCallAnswered = useGameStore((s) => s.markCallAnswered);
  // The answered calls, as a stable primitive join (changes only when a call is picked up).
  const answeredKey = useGameStore((s) => (s.state?.callsAnswered ?? []).join('|'));
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

  // The altar sigil (Claude Design "Altar sigil" handoff): clicking the altar raises the Katabasis
  // sigil over the room with STATUS QUO beneath it. The second press on the sigil commits the
  // descent (the teardown + freeze, then the Abyss transition into the flow); STATUS QUO opens the
  // read-only Ledger. Untouched for 4 s, it fades away. The first commit of a playthrough made with
  // no souls in hand does not descend: the sigil goes down and the empty-handed warning plays
  // instead (checked before any teardown); the next commit descends as usual.
  const altarSigil = useAltarSigil({
    onDescend: () => {
      if (warnEmptyHanded()) return;
      beginKatabasis();
      audio.play('katabasis');
    },
    onStatusQuo: () => {
      openKatabasis();
      audio.play('panel-open');
    },
  });
  const dismissAltarSigil = altarSigil.dismiss;

  // The descent takes the full screen; close any grimoire panel (and put the sigil away) when it opens.
  useEffect(() => {
    if (katabasisPhase === null) return;
    setPanel(null);
    dismissAltarSigil();
  }, [katabasisPhase, dismissAltarSigil]);

  // A call may ring during eligible active play in the Studio: live session, not in the title or a
  // descent, no call already answered, no jumpscare (06-smartphone-content.md §2: active play only,
  // dark in Katabasis). A Studio menu (PC, Logos, the dialer) does NOT silence the line — the phone
  // still rings behind it (you hear it; close the menu and tap the phone to answer).
  const callInEnabled =
    ready &&
    katabasisPhase === null &&
    !titleOpen &&
    room === 'studio' &&
    answeredCall === null &&
    !jumpscare &&
    !emptyHandedWarning;
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
  const answeredIds = useMemo(
    () => new Set(answeredKey ? answeredKey.split('|') : []),
    [answeredKey],
  );
  const { ringing, answer } = useIncomingCall(callInEnabled, eligibleIds, answeredIds);

  // Subliminal plates (game/subliminals.ts): the head of the store's queue flashes over everything.
  // Fausto's are queued by the tick the moment one of his letters is earned, wherever the player is;
  // the random ones surface about once every six minutes of live play, anywhere but the title, a
  // descent, an answered call, the jumpscare or the empty-handed warning. Fausto's wait in the queue
  // while the warning plays.
  const subliminal = useGameStore((s) => s.subliminalQueue[0] ?? null);
  const flashSubliminal = useGameStore((s) => s.flashSubliminal);
  const dismissSubliminal = useGameStore((s) => s.dismissSubliminal);
  useRandomSubliminals(
    ready &&
      !titleOpen &&
      katabasisPhase === null &&
      answeredCall === null &&
      !jumpscare &&
      !emptyHandedWarning,
    flashSubliminal,
  );
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
      // Leaving puts the altar sigil away at once (no fade).
      altarSigil.dismiss();
      setRoom(action.to);
      audio.play('room-change');
    } else if (action.type === 'altar') {
      // The altar raises its sigil over the room (clicked again, the sigil's timer restarts).
      // Nothing is torn down until the sigil's second press.
      altarSigil.showAltar();
      audio.play('panel-open');
    } else if (action.panel === 'phone' && ringing !== null) {
      // A call is ringing on the desk: answering the incoming call takes priority over opening the
      // dial-out pad. Tapping the phone IS the answer gesture — raise the full-screen call-in stage.
      const id = answer();
      if (id) {
        markCallAnswered(id); // picked up: a once-only call never rings again (persisted)
        setAnsweredCall(id);
      } else setPanel('phone');
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

  // The persistent Influence/Gold HUD rides over the Invocation and Studio rooms and over the
  // Loculi, the Magna Goetia book and the Chthonic Logos — but not in the Altar room, not over
  // the PC desk or the Status Quo Ledger, not during a descent (the Ledger + an ongoing Katabasis
  // both hold `katabasisPhase !== null`), and not behind the launch title menu. It mounts at the app
  // level (below) so it layers over those menu overlays rather than under them.
  const hudVisible =
    katabasisPhase === null &&
    room !== 'altar' &&
    panel !== 'pc' &&
    answeredCall === null &&
    !titleOpen;
  const unveilingVisible =
    katabasisPhase === null &&
    answeredCall === null &&
    !jumpscare &&
    !emptyHandedWarning &&
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
          desidiaActive={desidiaActive}
          reducedMotion={reducedMotion}
          ringing={ringing !== null}
          altarSigil={
            altarSigil.phase === 'off'
              ? null
              : { armed: altarSigil.armed, fading: altarSigil.phase === 'fading' }
          }
          onSigilPress={altarSigil.press}
          onStatusQuo={altarSigil.statusQuo}
          onAction={handleAction}
        />
      </main>
      <AchievementToast />
      <KatabasisModal />
      <SyncPanel />
      <ConflictModal />
      <SettingsPanel />
      <TitleSequence />
      {/* Every menu is its own full-surface overlay (designed reliquary / grimoire / desk /
          parchment / phone); none wears a framed panel. */}
      {panel === 'maleficia' && <Loculi onClose={closePanel} />}
      {panel === 'magna-goetia' && <GoetiaBook onClose={closePanel} />}
      {panel === 'pc' && <PcDesk onClose={closePanel} />}
      {panel === 'logos' && <ChthonicLogos onClose={closePanel} />}
      {panel === 'phone' && <PhoneDialer onClose={closePanel} />}
      {/* The answered incoming call — a full-screen stage that takes over until the call resolves.
          Keyed by id so each call mounts fresh (its FSM starts at the answer). `onChoose` applies the
          picked option's effects to the game state (docs/PANVITIUM-CALLS-IN.md): a timed buff, a
          one-shot cost/cull, or a permanent maxInfluence raise. A decline resolves with no effect. */}
      {callInView && (
        <SmartphoneCallIn
          key={answeredCall ?? ''}
          call={callInView}
          figures={studioFigures}
          onChoose={(i) => {
            if (answeredCall) answerCall(answeredCall, i);
          }}
          onDone={() => setAnsweredCall(null)}
        />
      )}
      {/* Rendered last (a sibling of the menu overlays above) so it layers over the Maleficia / Ars
          Goetia / Logos surfaces, pinned to the viewport's top-left edge. */}
      {hudVisible && <InfluenceGoldHud />}
      {/* Desidia (ADR-033), pinned to the viewport's bottom-left edge; same visibility
          as the Influence & Gold HUD, except over the Loculi: there its vessel would sit on the
          reliquary's ‹ arrow and the first relics of a full procession, and swallow their clicks as
          Desidia toggles. Clicking the vessel toggles Desidia (no separate button). */}
      {hudVisible && panel !== 'maleficia' && <DesidiaHud />}
      {/* The temporary buffs: a countdown ring per live consumable or answered call, in the left
          column between the two vessels. It shares Desidia's column, so it shares its rule and
          steps aside over the Loculi too. Renders nothing while no buff runs. */}
      {hudVisible && panel !== 'maleficia' && <BuffsHud />}
      {/* The Unveiling (z 88): a maleficium Emptio just brought home, over the room and every menu
          overlay and HUD, under the system modals. It waits (the queue holds in the store) while a
          descent, an answered call, the jumpscare or the empty-handed warning has the screen. */}
      {unveilingVisible && <Unveiling />}
      {/* The empty-handed warning (z 9000): the black, the one line, the black lifting. Over the
          room, every menu and the system modals, under the jumpscare and subliminals; it blocks all
          input and clears itself when its timeline ends. See EmptyHandedWarning. */}
      {emptyHandedWarning && <EmptyHandedWarning onDone={endEmptyHandedWarning} />}
      {/* The one-time Doppelgänger scare covers EVERYTHING (highest layer), blocks all input, and
          clears itself after 2s — see Jumpscare. */}
      {jumpscare && <Jumpscare onDone={() => setJumpscare(false)} />}
      {/* A subliminal plate flashes over even the jumpscare, for a fraction of a second, and takes
          no input; it holds in the queue while the empty-handed warning plays. Keyed by its seq so
          each flash mounts fresh. */}
      {subliminal && !emptyHandedWarning && (
        <Subliminal
          key={subliminal.seq}
          src={subliminal.src}
          onDone={() => dismissSubliminal(subliminal.seq)}
        />
      )}
    </div>
  );
}
