import type { DecodeResult } from '@/lib/decode';
import { JsonTree } from './JsonTree';
import { JwtPanel } from './JwtPanel';
import { HexDump } from './HexDump';
import { CopyButton } from './CopyButton';
import './DecodeView.css';

interface Props {
  result: DecodeResult | null;
  /** Rendered above the result — used for the "open in tab" action. */
  actions?: React.ReactNode;
}

export function DecodeView({ result, actions }: Props) {
  if (!result) {
    return (
      <div className="decode-empty">
        <div className="decode-empty-icon" aria-hidden="true">
          🔓
        </div>
        <p>Select base64 on a page, or paste a value above.</p>
        <p className="muted decode-empty-hint">
          Handles base64url, missing padding, JWTs, gzip, percent-encoding and nested payloads.
        </p>
      </div>
    );
  }

  if (result.kind === 'error') {
    return (
      <div className="decode-error">
        <strong>{result.message}</strong>
        {result.hint ? <p className="muted">{result.hint}</p> : null}
      </div>
    );
  }

  return (
    <div className="decode-result">
      <div className="decode-meta">
        <StepChips steps={result.steps} />
        <div className="decode-meta-actions">{actions}</div>
      </div>
      <div className="decode-body">
        <Body result={result} />
      </div>
    </div>
  );
}

function Body({ result }: { result: Exclude<DecodeResult, { kind: 'error' }> }) {
  switch (result.kind) {
    case 'jwt':
      return (
        <JwtPanel
          header={result.header}
          payload={result.payload}
          signature={result.signature}
          claims={result.claims}
        />
      );
    case 'json':
      return <JsonTree value={result.value} rawText={result.text} />;
    case 'binary':
      return <HexDump bytes={result.bytes} />;
    case 'text':
      return (
        <div className="decode-text">
          <div className="decode-text-header">
            <span className="muted">Plain text · {result.text.length.toLocaleString()} characters</span>
            <CopyButton value={result.text} label="Copy" className="btn" />
          </div>
          <pre className="decode-text-body mono">{result.text}</pre>
        </div>
      );
  }
}

/** The trail of what the pipeline actually did, so the output is explainable. */
export function StepChips({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="step-chips" title="What the decoder did, in order">
      {steps.map((step, index) => (
        <span className="chip" key={`${step}-${index}`}>
          {step}
        </span>
      ))}
    </div>
  );
}
