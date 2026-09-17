import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  value: string | (() => string);
  label?: string;
  title?: string;
  className?: string;
}

/** Copy-to-clipboard with inline confirmation; no toast infrastructure needed. */
export function CopyButton({ value, label, title, className = 'btn btn-icon' }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      const text = typeof value === 'function' ? value() : value;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard can be blocked (no gesture, or a restricted context).
        // Fall back to the legacy path so the button still does its job.
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        try {
          document.execCommand('copy');
        } finally {
          area.remove();
        }
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    },
    [value],
  );

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      title={title ?? (label ? `Copy ${label.toLowerCase()}` : 'Copy')}
    >
      {copied ? '✓' : '⧉'}
      {label ? <span>{copied ? 'Copied' : label}</span> : null}
    </button>
  );
}
