import { truncate } from '@/lib/json-utils';
import type { HistoryEntry } from '@/lib/storage';
import './HistoryList.css';

interface Props {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  saveHistory: boolean;
  onToggleSave: (next: boolean) => void;
}

const KIND_ICON: Record<HistoryEntry['kind'], string> = {
  jwt: '🔑',
  json: '{ }',
  text: '¶',
  binary: '0x',
  error: '!',
};

function timeAgo(at: number): string {
  const delta = Date.now() - at;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(at).toLocaleDateString();
}

export function HistoryList({
  entries,
  onRestore,
  onRemove,
  onClear,
  saveHistory,
  onToggleSave,
}: Props) {
  return (
    <div className="history">
      <div className="history-header">
        <span className="history-title">Recent</span>
        <label className="history-toggle" title="Decoded values are stored locally only">
          <input
            type="checkbox"
            checked={saveHistory}
            onChange={(event) => onToggleSave(event.target.checked)}
          />
          Save
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClear}
          disabled={entries.length === 0}
        >
          Clear
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="history-empty muted">
          {saveHistory
            ? 'Nothing decoded yet.'
            : 'History is off — decoded values are not being stored.'}
        </p>
      ) : (
        <ul className="history-list">
          {entries.map((entry) => (
            <li className="history-item" key={entry.id}>
              <button type="button" className="history-restore" onClick={() => onRestore(entry)}>
                <span className="history-kind" aria-hidden="true">
                  {KIND_ICON[entry.kind]}
                </span>
                <span className="history-text">
                  <span className="history-preview">{entry.preview}</span>
                  <span className="history-input mono">{truncate(entry.input, 60)}</span>
                </span>
                <span className="history-time muted">{timeAgo(entry.at)}</span>
              </button>
              <button
                type="button"
                className="btn btn-icon history-remove"
                onClick={() => onRemove(entry.id)}
                title="Remove from history"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
