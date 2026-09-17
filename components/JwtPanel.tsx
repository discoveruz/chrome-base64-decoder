import type { ClaimInfo, JwtValidity } from '@/lib/jwt';
import { prettyJson, type Json } from '@/lib/json-utils';
import { JsonTree } from './JsonTree';
import { CopyButton } from './CopyButton';
import './JwtPanel.css';

interface Props {
  header: Json;
  payload: Json;
  signature: string;
  claims: ClaimInfo;
}

const VALIDITY_BADGE: Record<JwtValidity, { className: string; text: string }> = {
  valid: { className: 'badge badge-ok', text: 'Unexpired' },
  expired: { className: 'badge badge-danger', text: 'Expired' },
  'not-yet-valid': { className: 'badge badge-warn', text: 'Not yet valid' },
  unknown: { className: 'badge badge-neutral', text: 'No validity window' },
};

export function JwtPanel({ header, payload, signature, claims }: Props) {
  const badge = VALIDITY_BADGE[claims.validity];

  const identity: [string, string | undefined][] = [
    ['Algorithm', claims.alg],
    ['Type', claims.typ],
    ['Key ID', claims.kid],
    ['Issuer', claims.issuer],
    ['Subject', claims.subject],
    ['Audience', claims.audience],
    ['JWT ID', claims.jwtId],
  ];
  const presentIdentity = identity.filter(([, value]) => value !== undefined);

  return (
    <div className="jwt-panel">
      <div className="jwt-status">
        <span className={badge.className}>{badge.text}</span>
        <span className="jwt-status-detail muted">{claims.validityDetail}</span>
      </div>

      {/* Non-negotiable: we decode, we do not verify. Saying "valid" without
          this line would imply a trust check that never happened. */}
      <p className="jwt-warning">
        <strong>Signature not verified.</strong> This tool only decodes the token — it cannot check
        the signature without the issuer's key. Never trust these claims for authorization.
      </p>

      {presentIdentity.length > 0 && (
        <dl className="jwt-facts">
          {presentIdentity.map(([label, value]) => (
            <div className="jwt-fact" key={label}>
              <dt>{label}</dt>
              <dd className="mono">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {claims.times.length > 0 && (
        <table className="jwt-times">
          <thead>
            <tr>
              <th>Claim</th>
              <th>When</th>
              <th>Relative</th>
            </tr>
          </thead>
          <tbody>
            {claims.times.map((time) => (
              <tr key={time.name}>
                <td>
                  <span className="mono jwt-claim-name">{time.name}</span>
                  <span className="muted jwt-claim-label">{time.label}</span>
                </td>
                <td title={time.iso}>{time.local}</td>
                <td className={time.name === 'exp' && claims.validity === 'expired' ? 'jwt-overdue' : ''}>
                  {time.relative}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Section title="Header" copy={() => prettyJson(header)}>
        <JsonTree value={header} defaultDepth={3} compact />
      </Section>

      <Section title="Payload" copy={() => prettyJson(payload)}>
        <JsonTree value={payload} defaultDepth={3} compact />
      </Section>

      <Section title="Signature">
        <div className="jwt-signature">
          <code className="mono jwt-signature-value">{signature || <em className="muted">empty</em>}</code>
          {signature ? <CopyButton value={signature} title="Copy signature" /> : null}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  copy,
}: {
  title: string;
  children: React.ReactNode;
  copy?: () => string;
}) {
  return (
    <section className="jwt-section">
      <h3 className="jwt-section-title">
        <span>{title}</span>
        {copy ? <CopyButton value={copy} title={`Copy ${title.toLowerCase()} JSON`} /> : null}
      </h3>
      <div className="jwt-section-body">{children}</div>
    </section>
  );
}
