import { useEffect, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';

/**
 * Achievement-unlocked toast (03 §7): a small notice naming the achievement just earned. Like the
 * Stellar/Apocalyptic pop-up it does not pause game time, auto-dismisses, and can be clicked away.
 */
export function AchievementToast(): ReactElement | null {
  const id = useGameStore((s) => s.achievementToast);
  const dismiss = useGameStore((s) => s.dismissAchievementToast);

  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(t);
  }, [id, dismiss]);

  if (!id) return null;
  const name = strings.achievements.names[id] ?? id;
  return (
    <div className="achievement-toast" role="status" onClick={dismiss}>
      <div className="achievement-toast-kicker">{strings.achievements.unlocked}</div>
      <div className="achievement-toast-name">{name}</div>
    </div>
  );
}
