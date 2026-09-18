import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { decode, describeResult, type DecodeResult } from '@/lib/decode';
import { addHistory } from '@/lib/storage';
import { prettyJson, truncate, type Json } from '@/lib/json-utils';
import { JsonTree } from '@/components/JsonTree';
import { CopyButton } from '@/components/CopyButton';

interface Props {
  text: string;
  rect: DOMRect;
  /** Skip the button and decode as soon as the selection appears. */
  instant: boolean;
  onDismiss: () => void;
  onOpenInTab: (input: string) => void;
}

const CARD_WIDTH = 440;
const CARD_MAX_HEIGHT = 380;
const GAP = 8;

export function Bubble({ text, rect, instant, onDismiss, onOpenInTab }: Props) {
  const [open, setOpen] = useState(instant);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Escape always closes — the bubble sits on someone else's page, so it must
  // be trivially dismissable.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  useLayoutEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onDismiss();
    };
    // Defer so the click that opened the card does not immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', onClickAway, true), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onClickAway, true);
    };
  }, [open, onDismiss]);

  const run = useCallback(async () => {
    // The component is keyed by the selected text, so a remount means a genuinely
    // new selection; this guard only stops a double-run within one mount.
    if (started.current) return;
    started.current = true;
    setOpen(true);
    setBusy(true);
    try {
      const next = await decode(text);
      setResult(next);
      void addHistory(text, describeResult(next), next.kind);
    } finally {
      setBusy(false);
    }
  }, [text]);

  useEffect(() => {
    if (instant) void run();
  }, [instant, run]);

  const bubbleStyle: React.CSSProperties = {
    top: Math.max(GAP, rect.top - 30),
    left: Math.min(Math.max(GAP, rect.left), window.innerWidth - 44),
  };

  if (!open) {
    return (
      <button
        type="button"
        className="b64-bubble"
        style={bubbleStyle}
        onMouseDown={(event) => event.preventDefault()}
        onClick={run}
        title="Decode this selection"
      >
        🔓
      </button>
    );
  }

  // Flip above the selection when there is not enough room below.
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < CARD_MAX_HEIGHT && rect.top > spaceBelow;
  const cardStyle: React.CSSProperties = {
    left: Math.min(Math.max(GAP, rect.left), Math.max(GAP, window.innerWidth - CARD_WIDTH - GAP)),
    width: Math.min(CARD_WIDTH, window.innerWidth - GAP * 2),
    maxHeight: Math.min(CARD_MAX_HEIGHT, placeAbove ? rect.top - GAP * 2 : spaceBelow - GAP * 2),
    ...(placeAbove
      ? { bottom: Math.max(GAP, window.innerHeight - rect.top + GAP) }
      : { top: rect.bottom + GAP }),
  };

  return (
    <div className="b64-card" style={cardStyle} ref={cardRef} role="dialog" aria-label="Decoded value">
      <div className="b64-card-head">
        <span className="b64-card-title">
          {busy ? 'Decoding…' : result ? describeResult(result) : ''}
        </span>
        {result && result.kind !== 'error' ? (
          <CopyButton value={() => copyableText(result)} className="b64-card-btn" title="Copy result" />
        ) : null}
        <button
          type="button"
          className="b64-card-btn"
          onClick={() => onOpenInTab(text)}
          title="Open in a full tab"
        >
          ⧉ Tab
        </button>
        <button type="button" className="b64-card-btn" onClick={onDismiss} title="Close (Esc)">
          ✕
        </button>
      </div>
      <div className="b64-card-body">
        {busy && <div className="b64-muted">Working…</div>}
        {!busy && result && <Preview result={result} />}
      </div>
    </div>
  );
}

/** What the header's copy button hands over for each result kind. */
function copyableText(result: DecodeResult): string {
  switch (result.kind) {
    case 'json':
      return prettyJson(result.value);
    case 'jwt':
      return prettyJson(result.payload as Json);
    case 'text':
      return result.text;
    case 'binary':
      return Array.from(result.bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
    default:
      return '';
  }
}

/**
 * The card renders the same collapsible, syntax-coloured tree as the popup —
 * the shared palette is imported into the shadow root so the colours match.
 * `compact` drops the tree's own toolbar, which will not fit at card width;
 * the header's copy button and per-row actions cover it instead.
 */
function Preview({ result }: { result: DecodeResult }) {
  if (result.kind === 'error') {
    return (
      <div className="b64-error">
        <strong>{result.message}</strong>
        {result.hint ? <div className="b64-muted">{result.hint}</div> : null}
      </div>
    );
  }

  if (result.kind === 'jwt') {
    const badge =
      result.claims.validity === 'expired'
        ? 'b64-badge b64-badge-danger'
        : result.claims.validity === 'valid'
          ? 'b64-badge b64-badge-ok'
          : 'b64-badge';
    return (
      <>
        <div className="b64-row">
          <span className={badge}>{result.claims.validity}</span>
          <span className="b64-muted">{result.claims.validityDetail}</span>
        </div>
        <div className="b64-muted b64-note">Signature not verified.</div>
        <JsonTree value={result.payload as Json} compact defaultDepth={3} />
      </>
    );
  }

  if (result.kind === 'json') {
    return <JsonTree value={result.value} rawText={result.text} compact defaultDepth={3} />;
  }

  if (result.kind === 'text') {
    return <pre className="b64-pre">{truncate(result.text, 6000)}</pre>;
  }

  return <div className="b64-muted">{result.bytes.length} bytes of binary data — open in a tab to inspect.</div>;
}
