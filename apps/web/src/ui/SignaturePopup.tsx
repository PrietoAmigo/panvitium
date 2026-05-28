import { useEffect, type ReactElement } from 'react';
import { strings } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';
import { actionName } from '../game/labels.js';

/**
 * The Stellar / Apocalyptic pop-up (02 §2): a small black notice in the upper half of the screen
 * naming the action and its outcome. It does not pause game time; it auto-dismisses and can be
 * clicked away.
 */
export function SignaturePopup(): ReactElement | null {
  const signature = useGameStore((s) => s.signature);
  const dismiss = useGameStore((s) => s.dismissSignature);

  useEffect(() => {
    if (!signature) return;
    const id = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(id);
  }, [signature, dismiss]);

  if (!signature) return null;
  const name = actionName(signature.actionId);
  const variant = signature.tier === 'stellar' ? 'signature-stellar' : 'signature-apocalyptic';
  return (
    <div className={`signature-popup ${variant}`} role="status" onClick={dismiss}>
      <div className="signature-tier">{strings.tiers[signature.tier]}</div>
      <div className="signature-action">{name}</div>
      <div className="signature-effect">
        {signature.soulsDelta !== 0 && (
          <span>
            {signature.soulsDelta > 0 ? '+' : ''}
            {signature.soulsDelta} {strings.resources.souls}{' '}
          </span>
        )}
        {signature.reprobateDelta !== 0 && (
          <span>
            {signature.reprobateDelta > 0 ? '+' : ''}
            {signature.reprobateDelta} {strings.reprobates}
          </span>
        )}
      </div>
    </div>
  );
}
