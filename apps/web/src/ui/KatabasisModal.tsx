import { type ReactElement } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { Katabasis } from '../menus/Katabasis.js';

/**
 * The full-screen Katabasis flow. The `menu` phase renders the cinematic descent
 * (`menus/Katabasis`), where naming Semet raises the Semet screen over the cleared Court (ADR-041).
 * The Anabasis commits the lifetime and lands straight back in the room: there is no recap screen
 * after it (ADR-043).
 */
export function KatabasisModal(): ReactElement | null {
  const phase = useGameStore((s) => s.katabasisPhase);
  return phase === 'menu' ? <Katabasis /> : null;
}
