import { runnerCycleDuration } from '@panvitium/sim';

/**
 * Fraction complete (0–1) of an action timer, for a progress bar — the single rule every action bar
 * uses, whether the action belongs to the player, an acolyte, or an invocation runner.
 *
 * The denominator is the action's *actual* duration at the given efficiency (`runnerCycleDuration`,
 * the same formula the sim starts timers with): time-mode actions finish sooner at higher efficiency
 * (a smaller total), cost-outcome actions keep a fixed duration (efficiency scales their cost and
 * outcome, not their time). Because the timer is created with `remaining = total`, the bar always
 * fills from 0% to 100% — higher efficiency just makes a time-mode bar fill *faster*, never start
 * partway. `eff` is whatever efficiency that timer was started with (player category efficiency,
 * acolyte efficiency, or runner efficiency).
 */
export function actionProgress(actionId: string, remainingSeconds: number, eff: number): number {
  const total = runnerCycleDuration(actionId, eff);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - remainingSeconds / total));
}
