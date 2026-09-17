/**
 * JWT parsing and claim humanization.
 *
 * This module never verifies signatures — doing so would require the issuer's
 * key, which the extension does not have. Every surface that renders a JWT must
 * say so, otherwise a "valid" badge implies a trust check we never performed.
 */

import { base64ToBytes } from './base64';
import { tryParseJson, type Json } from './json-utils';

export const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export function looksLikeJwt(input: string): boolean {
  return JWT_SHAPE.test(input.trim());
}

export type JwtValidity = 'valid' | 'expired' | 'not-yet-valid' | 'unknown';

export interface TimeClaim {
  name: string;
  label: string;
  seconds: number;
  iso: string;
  local: string;
  relative: string;
}

export interface ClaimInfo {
  /** Registered claims worth surfacing above the raw payload tree. */
  alg?: string;
  typ?: string;
  kid?: string;
  issuer?: string;
  subject?: string;
  audience?: string;
  jwtId?: string;
  times: TimeClaim[];
  validity: JwtValidity;
  /** Human sentence explaining the validity badge. */
  validityDetail: string;
}

export interface ParsedJwt {
  header: Json;
  payload: Json;
  signature: string;
  claims: ClaimInfo;
}

const TIME_CLAIM_LABELS: Record<string, string> = {
  exp: 'Expires',
  iat: 'Issued at',
  nbf: 'Not before',
  auth_time: 'Authenticated at',
  updated_at: 'Updated at',
};

/** "in 42 min" / "3 h ago" — the form people actually read off a token. */
export function relativeTime(targetMs: number, nowMs: number): string {
  const deltaMs = targetMs - nowMs;
  const past = deltaMs < 0;
  const abs = Math.abs(deltaMs);

  const units = [
    { ms: 1000, name: 'second' },
    { ms: 60 * 1000, name: 'minute' },
    { ms: 60 * 60 * 1000, name: 'hour' },
    { ms: 24 * 60 * 60 * 1000, name: 'day' },
    { ms: 30 * 24 * 60 * 60 * 1000, name: 'month' },
    { ms: 365 * 24 * 60 * 60 * 1000, name: 'year' },
  ] as const;

  if (abs < 1000) return 'just now';

  let chosen: { ms: number; name: string } = units[0];
  for (const unit of units) {
    if (abs >= unit.ms) chosen = unit;
  }
  const value = Math.floor(abs / chosen.ms);
  const plural = value === 1 ? '' : 's';
  return past ? `${value} ${chosen.name}${plural} ago` : `in ${value} ${chosen.name}${plural}`;
}

function decodeSegment(segment: string, which: string): Json {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(segment);
  } catch (error) {
    throw new Error(`JWT ${which} is not valid base64url: ${(error as Error).message}`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`JWT ${which} is not valid UTF-8.`);
  }
  const parsed = tryParseJson(text);
  if (!parsed.ok) throw new Error(`JWT ${which} is not valid JSON.`);
  return parsed.value;
}

function readString(obj: Json, key: string): string | undefined {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const value = (obj as Record<string, Json>)[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === 'string');
    return parts.length ? parts.join(', ') : undefined;
  }
  return undefined;
}

function readNumber(obj: Json, key: string): number | undefined {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const value = (obj as Record<string, Json>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function buildClaimInfo(header: Json, payload: Json, nowMs = Date.now()): ClaimInfo {
  const times: TimeClaim[] = [];

  for (const [name, label] of Object.entries(TIME_CLAIM_LABELS)) {
    const seconds = readNumber(payload, name);
    if (seconds === undefined) continue;
    const ms = seconds * 1000;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) continue;
    times.push({
      name,
      label,
      seconds,
      iso: date.toISOString(),
      local: date.toLocaleString(),
      relative: relativeTime(ms, nowMs),
    });
  }

  const exp = readNumber(payload, 'exp');
  const nbf = readNumber(payload, 'nbf');

  let validity: JwtValidity = 'unknown';
  let validityDetail = 'No exp or nbf claim — this token carries no validity window.';

  if (exp !== undefined && exp * 1000 <= nowMs) {
    validity = 'expired';
    validityDetail = `Expired ${relativeTime(exp * 1000, nowMs)}.`;
  } else if (nbf !== undefined && nbf * 1000 > nowMs) {
    validity = 'not-yet-valid';
    validityDetail = `Not valid until ${new Date(nbf * 1000).toLocaleString()}.`;
  } else if (exp !== undefined) {
    validity = 'valid';
    validityDetail = `Expires ${relativeTime(exp * 1000, nowMs)}.`;
  } else if (nbf !== undefined) {
    validity = 'valid';
    validityDetail = 'Past its nbf, and no exp claim is present.';
  }

  return {
    alg: readString(header, 'alg'),
    typ: readString(header, 'typ'),
    kid: readString(header, 'kid'),
    issuer: readString(payload, 'iss'),
    subject: readString(payload, 'sub'),
    audience: readString(payload, 'aud'),
    jwtId: readString(payload, 'jti'),
    times,
    validity,
    validityDetail,
  };
}

export function parseJwt(input: string, nowMs = Date.now()): ParsedJwt {
  const token = input.trim();
  const segments = token.split('.');
  const [headerSegment, payloadSegment, signature] = segments;
  if (segments.length !== 3 || headerSegment === undefined || payloadSegment === undefined) {
    throw new Error(`A JWT has 3 dot-separated segments; this has ${segments.length}.`);
  }

  const header = decodeSegment(headerSegment, 'header');
  const payload = decodeSegment(payloadSegment, 'payload');

  return {
    header,
    payload,
    signature: signature ?? '',
    claims: buildClaimInfo(header, payload, nowMs),
  };
}
