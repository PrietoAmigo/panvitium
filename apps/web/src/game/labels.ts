import { strings } from '@panvitium/shared';

/**
 * Display name for an action id — used by the HUD's active-action strip, the outcome log, and the
 * Stellar/Apocalyptic signature popup. Centralised so a new action shows its real name everywhere
 * (the old per-site maps fell back to "Suggestion", mislabelling Indagatio/Emptio). Unknown ids
 * fall back to the raw id rather than a wrong name.
 */
const ACTION_NAMES: Record<string, string> = {
  suggestion: strings.opera.suggestion,
  logismoi: strings.opera.logismoi,
  imperium: strings.opera.imperium,
  caedes: strings.opera.caedes,
  pogrom: strings.opera.pogrom,
  purgatio: strings.opera.purgatio,
  indagatio: strings.opera.indagatio,
  emptio: strings.opera.emptio,
};

export function actionName(actionId: string): string {
  return ACTION_NAMES[actionId] ?? actionId;
}
