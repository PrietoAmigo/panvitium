import { type ReactElement } from 'react';
import { strings } from '@panvitium/shared';

/**
 * PRESERVED — not currently mounted. The PANVITIUM wordmark was removed from the UI, but the
 * component and its `.game-name` style (gold-leaf display caps with a soft glow) are kept here for
 * reuse: re-add `<Hud />` to `App` to show it again, or lift the `.game-name` rule in
 * `styles/index.css` (the colour `--gold-leaf` + display-caps treatment) onto any other element.
 */
export function Hud(): ReactElement {
  return <div className="game-name">{strings.appName}</div>;
}
