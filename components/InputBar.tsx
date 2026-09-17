import { useEffect, useRef } from 'react';
import './InputBar.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onReadSelection?: () => void;
  autoFocus?: boolean;
  busy?: boolean;
}

export function InputBar({ value, onChange, onReadSelection, autoFocus, busy }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className="input-bar">
      <textarea
        ref={ref}
        className="input-area mono"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="Paste base64, a JWT, or JSON…"
        onChange={(event) => onChange(event.target.value)}
        rows={3}
      />
      <div className="input-actions">
        {onReadSelection && (
          <button type="button" className="btn btn-ghost" onClick={onReadSelection} disabled={busy}>
            ⤓ Read selection
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange('')}
          disabled={value.length === 0}
        >
          Clear
        </button>
        <span className="input-count muted">{value.length ? `${value.length.toLocaleString()} chars` : ''}</span>
      </div>
    </div>
  );
}
