import { type ReactElement } from 'react';
import { strings, type SaveBlob } from '@panvitium/shared';
import { useGameStore } from '../store/gameStore.js';

/**
 * ADR-010 conflict chooser. Shown when `pendingConflict` is non-null — i.e., the server's stored
 * save has a higher `saveVersion` than the one we tried to push. Two side-by-side cards summarise
 * the local and server blobs (souls + saveVersion + last play time) and the player picks one. The
 * other is overwritten.
 */
function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString();
}

function summary(blob: SaveBlob): { souls: string; version: number; when: string } {
  return {
    souls: blob.state.souls,
    version: blob.saveVersion,
    when: formatTime(blob.lastTickAt),
  };
}

export function ConflictModal(): ReactElement | null {
  const pending = useGameStore((s) => s.pendingConflict);
  const resolve = useGameStore((s) => s.resolveConflict);
  if (!pending) return null;

  const local = summary(pending.local);
  const server = summary(pending.server);

  return (
    <div className="conflict-modal" role="dialog" aria-label={strings.sync.conflict.title}>
      <div className="conflict-inner">
        <h2 className="conflict-title">{strings.sync.conflict.title}</h2>
        <p className="conflict-intro">{strings.sync.conflict.intro}</p>
        <div className="conflict-grid">
          <ConflictCard
            title={strings.sync.conflict.thisDevice}
            data={local}
            onChoose={() => void resolve('local')}
            chooseLabel={strings.sync.conflict.keepLocal}
          />
          <ConflictCard
            title={strings.sync.conflict.cloud}
            data={server}
            onChoose={() => void resolve('server')}
            chooseLabel={strings.sync.conflict.keepServer}
          />
        </div>
      </div>
    </div>
  );
}

function ConflictCard({
  title,
  data,
  onChoose,
  chooseLabel,
}: {
  title: string;
  data: { souls: string; version: number; when: string };
  onChoose: () => void;
  chooseLabel: string;
}): ReactElement {
  return (
    <div className="conflict-card">
      <h3 className="conflict-card-title">{title}</h3>
      <dl className="conflict-stats">
        <dt>{strings.sync.conflict.souls}</dt>
        <dd>{data.souls}</dd>
        <dt>{strings.sync.conflict.saveVersion}</dt>
        <dd>{data.version}</dd>
        <dt>{strings.sync.conflict.lastTickAt}</dt>
        <dd>{data.when}</dd>
      </dl>
      <button type="button" className="opera-btn" onClick={onChoose}>
        {chooseLabel}
      </button>
    </div>
  );
}
