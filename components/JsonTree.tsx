import { useCallback, useMemo, useState } from 'react';
import {
  appendPath,
  childCount,
  formatScalar,
  isContainer,
  kindOf,
  looksDecodable,
  minifiedJson,
  prettyJson,
  truncate,
  type Json,
} from '@/lib/json-utils';
import { decode, type DecodeResult } from '@/lib/decode';
import { CopyButton } from './CopyButton';
import './JsonTree.css';

interface Props {
  value: Json;
  /** Raw text form, used by the copy buttons. */
  rawText?: string;
  /** Root label shown in the toolbar, e.g. "payload". */
  title?: string;
  /** Depth auto-expanded on first render. */
  defaultDepth?: number;
  /** Hide the toolbar when the tree is embedded in a panel that has its own. */
  compact?: boolean;
}

/** Above this, rendering a tree is slower than it is useful. */
const TREE_SIZE_LIMIT = 2_000_000;

export function JsonTree({ value, rawText, title, defaultDepth = 2, compact = false }: Props) {
  const [query, setQuery] = useState('');
  // Overrides layered on top of the depth default, so "expand all" and manual
  // toggles can coexist without pre-walking the whole tree.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<'default' | 'all' | 'none'>('default');

  const text = useMemo(() => rawText ?? prettyJson(value), [rawText, value]);
  const tooLarge = text.length > TREE_SIZE_LIMIT;

  const toggle = useCallback((path: string, next: boolean) => {
    setOverrides((prev) => ({ ...prev, [path]: next }));
  }, []);

  const setAll = useCallback((mode: 'all' | 'none') => {
    setOverrides({});
    setBulk(mode);
  }, []);

  const matcher = query.trim().toLowerCase();

  if (tooLarge) {
    return (
      <div className="json-too-large">
        <p className="muted">
          This payload is {(text.length / 1_000_000).toFixed(1)} MB — too large to render as an
          interactive tree.
        </p>
        <div className="json-toolbar-actions">
          <CopyButton value={text} label="Copy raw" className="btn" />
        </div>
        <pre className="json-raw mono">{truncate(text, 50_000)}</pre>
      </div>
    );
  }

  return (
    <div className="json-tree-wrap">
      {!compact && (
        <div className="json-toolbar">
          <input
            className="json-search"
            type="search"
            placeholder="Filter keys and values…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="json-toolbar-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAll('all')}>
              Expand all
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAll('none')}>
              Collapse all
            </button>
            <CopyButton value={() => prettyJson(value)} label="Pretty" className="btn" />
            <CopyButton value={() => minifiedJson(value)} label="Min" className="btn" />
          </div>
        </div>
      )}
      <div className="json-tree mono" role="tree" aria-label={title ?? 'Decoded JSON'}>
        <Node
          value={value}
          label={title ?? null}
          path="$"
          depth={0}
          defaultDepth={defaultDepth}
          overrides={overrides}
          bulk={bulk}
          onToggle={toggle}
          matcher={matcher}
          isLast
        />
      </div>
    </div>
  );
}

interface NodeProps {
  value: Json;
  label: string | number | null;
  path: string;
  depth: number;
  defaultDepth: number;
  overrides: Record<string, boolean>;
  bulk: 'default' | 'all' | 'none';
  onToggle: (path: string, next: boolean) => void;
  matcher: string;
  isLast: boolean;
}

function resolveOpen(props: NodeProps): boolean {
  const { path, overrides, bulk, depth, defaultDepth } = props;
  const override = overrides[path];
  if (override !== undefined) return override;
  if (bulk === 'all') return true;
  if (bulk === 'none') return false;
  return depth < defaultDepth;
}

/** Does this subtree contain the filter text anywhere? Drives filtering. */
function subtreeMatches(value: Json, label: string | number | null, matcher: string): boolean {
  if (!matcher) return true;
  if (label !== null && String(label).toLowerCase().includes(matcher)) return true;
  if (!isContainer(value)) {
    return formatScalar(value).toLowerCase().includes(matcher);
  }
  const entries: [string | number, Json][] = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  return entries.some(([key, child]) => subtreeMatches(child, key, matcher));
}

function Node(props: NodeProps) {
  const { value, label, path, depth, matcher, onToggle } = props;

  if (!subtreeMatches(value, label, matcher)) return null;

  const container = isContainer(value);
  const open = container ? resolveOpen(props) : false;
  // A filter is in play, so force open along matching branches — otherwise the
  // matches stay hidden inside collapsed parents.
  const forcedOpen = container && matcher.length > 0;
  const expanded = open || forcedOpen;

  const keyNode =
    label === null ? null : typeof label === 'number' ? (
      <span className="tok-index">{label}</span>
    ) : (
      <span className="tok-key" title={`Copy path ${path}`}>
        {JSON.stringify(label)}
      </span>
    );

  if (!container) {
    return (
      <div className="json-row" style={{ paddingLeft: depth * 14 }} role="treeitem">
        <span className="json-twisty-spacer" />
        {keyNode}
        {keyNode ? <span className="tok-punct">: </span> : null}
        <Scalar value={value} path={path} trailingComma={!props.isLast} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const count = childCount(value);
  const entries: [string | number, Json][] = isArray
    ? (value as Json[]).map((item, index) => [index, item])
    : Object.entries(value as Record<string, Json>);

  const openBrace = isArray ? '[' : '{';
  const closeBrace = isArray ? ']' : '}';

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div className="json-row json-row-container" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          className="json-twisty"
          onClick={() => onToggle(path, !expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        {keyNode}
        {keyNode ? <span className="tok-punct">: </span> : null}
        <span className="tok-punct">{openBrace}</span>
        {!expanded && (
          <>
            <span className="json-summary">
              {count === 0 ? '' : ` ${count} ${isArray ? (count === 1 ? 'item' : 'items') : count === 1 ? 'key' : 'keys'} `}
            </span>
            <span className="tok-punct">{closeBrace}</span>
            {!props.isLast ? <span className="tok-punct">,</span> : null}
          </>
        )}
        <span className="json-row-actions">
          <CopyButton
            value={() => prettyJson(value)}
            className="btn btn-icon json-row-copy"
            title={`Copy this ${isArray ? 'array' : 'object'}`}
          />
          <CopyButton
            value={path}
            className="btn btn-icon json-row-copy json-row-path"
            title={`Copy path ${path}`}
          />
        </span>
      </div>

      {expanded && (
        <>
          {entries.map(([key, child], index) => (
            <Node
              key={String(key)}
              {...props}
              value={child}
              label={key}
              path={appendPath(path, key)}
              depth={depth + 1}
              isLast={index === entries.length - 1}
            />
          ))}
          <div className="json-row" style={{ paddingLeft: depth * 14 }}>
            <span className="json-twisty-spacer" />
            <span className="tok-punct">{closeBrace}</span>
            {!props.isLast ? <span className="tok-punct">,</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

/** A leaf value, with an inline nested-decode affordance on base64-looking strings. */
function Scalar({
  value,
  path,
  trailingComma,
}: {
  value: Json;
  path: string;
  trailingComma: boolean;
}) {
  const kind = kindOf(value);
  const [nested, setNested] = useState<DecodeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const decodable = kind === 'string' && looksDecodable(value as string);

  const runNested = async () => {
    if (nested) {
      setNested(null);
      return;
    }
    setBusy(true);
    try {
      setNested(await decode(value as string));
    } finally {
      setBusy(false);
    }
  };

  const display = formatScalar(value);

  return (
    <>
      <span className={`tok-${kind}`} title={kind === 'string' ? (value as string) : undefined}>
        {truncate(display, 400)}
      </span>
      {trailingComma ? <span className="tok-punct">,</span> : null}
      <span className="json-row-actions">
        {decodable && (
          <button
            type="button"
            className="btn btn-icon json-nested-btn"
            onClick={runNested}
            disabled={busy}
            title={nested ? 'Hide nested decode' : 'Decode this value'}
          >
            ⤷
          </button>
        )}
        <CopyButton
          value={kind === 'string' ? (value as string) : display}
          className="btn btn-icon json-row-copy"
          title="Copy value"
        />
        <CopyButton value={path} className="btn btn-icon json-row-copy json-row-path" title={`Copy path ${path}`} />
      </span>
      {nested && <NestedResult result={nested} />}
    </>
  );
}

function NestedResult({ result }: { result: DecodeResult }) {
  if (result.kind === 'error') {
    return <div className="json-nested json-nested-error">Could not decode: {result.message}</div>;
  }
  if (result.kind === 'json') {
    return (
      <div className="json-nested">
        <JsonTree value={result.value} rawText={result.text} compact defaultDepth={1} />
      </div>
    );
  }
  if (result.kind === 'jwt') {
    return (
      <div className="json-nested">
        <div className="json-nested-label">JWT payload</div>
        <JsonTree value={result.payload} compact defaultDepth={1} />
      </div>
    );
  }
  if (result.kind === 'text') {
    return <div className="json-nested mono">{truncate(result.text, 2000)}</div>;
  }
  return <div className="json-nested muted">{result.bytes.length} binary bytes</div>;
}
