/**
 * The decode pipeline.
 *
 * Pure TypeScript apart from web-platform globals (atob, TextDecoder,
 * DecompressionStream) that exist in every extension context. No browser.*
 * APIs, so this is directly unit-testable and shared by the popup, the
 * content-script bubble and the viewer tab.
 */

import { base64ToBytes, detectFlavor, stripWhitespace, unquote } from './base64';
import { tryParseJson, type Json } from './json-utils';
import { looksLikeJwt, parseJwt, type ClaimInfo } from './jwt';

export interface DecodeMeta {
  /** Human-readable trail of what the pipeline did, rendered as chips. */
  steps: string[];
  /** The normalized input that was actually decoded. */
  normalized: string;
}

export type DecodeResult =
  | ({ kind: 'jwt'; header: Json; payload: Json; signature: string; claims: ClaimInfo } & DecodeMeta)
  | ({ kind: 'json'; value: Json; text: string } & DecodeMeta)
  | ({ kind: 'text'; text: string } & DecodeMeta)
  | ({ kind: 'binary'; bytes: Uint8Array } & DecodeMeta)
  | { kind: 'error'; message: string; hint?: string; steps: string[]; normalized: string };

const DATA_URI = /^data:[^;,]*;base64,/i;
const BEARER = /^bearer\s+/i;
const PERCENT_ENCODED = /%[0-9A-Fa-f]{2}/;

/** Max input we will attempt, to keep a pathological paste from locking the UI. */
export const MAX_INPUT_LENGTH = 5_000_000;

interface Normalized {
  value: string;
  steps: string[];
}

function normalize(raw: string): Normalized {
  const steps: string[] = [];
  let value = raw.trim();

  const unquoted = unquote(value);
  if (unquoted !== value) {
    steps.push('removed quotes');
    value = unquoted;
  }

  if (BEARER.test(value)) {
    value = value.replace(BEARER, '').trim();
    steps.push('stripped “Bearer”');
  }

  if (DATA_URI.test(value)) {
    value = value.replace(DATA_URI, '').trim();
    steps.push('stripped data: URI prefix');
  }

  const compact = stripWhitespace(value);
  if (compact !== value) {
    steps.push('removed whitespace');
    value = compact;
  }

  return { value, steps };
}

async function decompress(bytes: Uint8Array, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** gzip and zlib both have recognisable magic bytes; check before decoding text. */
async function maybeDecompress(
  bytes: Uint8Array,
  steps: string[],
): Promise<Uint8Array> {
  if (bytes.length < 2) return bytes;

  const [first, second] = bytes;
  const isGzip = first === 0x1f && second === 0x8b;
  const isZlib = first === 0x78 && second !== undefined && [0x01, 0x5e, 0x9c, 0xda].includes(second);
  if (!isGzip && !isZlib) return bytes;

  const format = isGzip ? 'gzip' : 'deflate';
  try {
    const out = await decompress(bytes, format);
    steps.push(isGzip ? 'gunzipped' : 'inflated');
    return out;
  } catch {
    // Magic bytes matched but the stream is not actually valid — fall through
    // and let the caller treat the original bytes as text or binary.
    return bytes;
  }
}

function bytesToText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function fromText(text: string, meta: DecodeMeta): DecodeResult {
  const parsed = tryParseJson(text);
  if (parsed.ok) {
    return { kind: 'json', value: parsed.value, text, ...meta };
  }
  return { kind: 'text', text, ...meta };
}

/**
 * Runs of base64-ish characters long enough to be a real payload. The dot is
 * included so a JWT survives as one run rather than three.
 */
const BASE64_RUN = /[A-Za-z0-9+/_-][A-Za-z0-9+/_.-]{14,}={0,2}/g;

/**
 * Plausible payloads hiding inside surrounding text, longest first — a label is
 * essentially always shorter than the value it labels.
 */
function candidateRuns(input: string): string[] {
  const found = input.match(BASE64_RUN) ?? [];
  const cleaned = found
    .map((run) => run.replace(/^\.+|\.+$/g, ''))
    .filter((run) => run.length >= 16);
  return [...new Set(cleaned)].sort((a, b) => b.length - a.length).slice(0, 4);
}

/** Name the label we dropped, so the step chip explains itself. */
function describeExtraction(input: string, candidate: string): string {
  const before = input.slice(0, input.indexOf(candidate));
  const label = /([A-Za-z][A-Za-z0-9_.\-]{0,40})\s*[=:]\s*$/.exec(before);
  return label ? `dropped “${label[1]}=”` : 'extracted from text';
}

/**
 * Decode `input` as far as it will go.
 *
 * Real-world base64 rarely arrives bare: it comes as `payload_b64=…`, `v1:…`,
 * a log line, or a JSON field. So if a straight decode fails, fall back to
 * pulling the most plausible base64 run out of whatever surrounds it. This runs
 * only after failure, so it can never change the result of input that already
 * decoded cleanly.
 */
export async function decode(input: string, depth = 0): Promise<DecodeResult> {
  const direct = await decodeDirect(input);
  if (direct.kind !== 'error' || depth > 2) return direct;

  for (const candidate of candidateRuns(input)) {
    if (candidate === input.trim()) continue;
    const result = await decode(candidate, depth + 1);
    if (result.kind !== 'error') {
      return { ...result, steps: [describeExtraction(input, candidate), ...result.steps] };
    }
  }
  return direct;
}

async function decodeDirect(input: string): Promise<DecodeResult> {
  if (input.length > MAX_INPUT_LENGTH) {
    return {
      kind: 'error',
      message: 'Input too large.',
      hint: `This tool caps input at ${(MAX_INPUT_LENGTH / 1_000_000).toFixed(0)} MB.`,
      steps: [],
      normalized: '',
    };
  }

  const { value: normalized, steps } = normalize(input);

  if (normalized.length === 0) {
    return {
      kind: 'error',
      message: 'Nothing to decode.',
      hint: 'Select some text on the page or paste a value above.',
      steps,
      normalized,
    };
  }

  const meta = (): DecodeMeta => ({ steps: [...steps], normalized });

  // 1. Already JSON? Then this is a formatting job, not a decoding one.
  const asJson = tryParseJson(normalized);
  if (asJson.ok) {
    steps.push('already JSON');
    return { kind: 'json', value: asJson.value, text: normalized, ...meta() };
  }

  // 2. JWT — checked before generic base64, since a JWT is base64url with dots.
  if (looksLikeJwt(normalized)) {
    try {
      const jwt = parseJwt(normalized);
      steps.push('JWT');
      return {
        kind: 'jwt',
        header: jwt.header,
        payload: jwt.payload,
        signature: jwt.signature,
        claims: jwt.claims,
        ...meta(),
      };
    } catch (error) {
      // Shaped like a JWT but not decodable as one. Report that specifically
      // rather than falling through to a confusing "not base64".
      return {
        kind: 'error',
        message: (error as Error).message,
        hint: 'The value has a JWT shape but its segments did not decode.',
        steps,
        normalized,
      };
    }
  }

  // 3. Percent-encoding — unwrap and re-run the whole pipeline.
  if (PERCENT_ENCODED.test(normalized)) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded !== normalized) {
        const result = await decode(decoded);
        if (result.kind !== 'error') {
          return { ...result, steps: ['percent-decoded', ...result.steps] } as DecodeResult;
        }
      }
    } catch {
      // Malformed percent-encoding; fall through to the base64 attempt.
    }
  }

  // 4. Base64 -> bytes.
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(normalized);
  } catch (error) {
    return {
      kind: 'error',
      message: (error as Error).message,
      hint:
        detectFlavor(normalized) === null
          ? 'Check for stray characters — this does not look like base64.'
          : 'The value is base64-shaped but has an invalid length.',
      steps,
      normalized,
    };
  }

  steps.push(detectFlavor(normalized) === 'url' ? 'base64url' : 'base64');

  if (bytes.length === 0) {
    return { kind: 'text', text: '', ...meta() };
  }

  // 5. Transparent decompression.
  bytes = await maybeDecompress(bytes, steps);

  // 6. Bytes -> text, or a hex dump when the payload is genuinely binary.
  const text = bytesToText(bytes);
  if (text === null) {
    steps.push('binary');
    return { kind: 'binary', bytes, ...meta() };
  }

  steps.push('UTF-8');
  return fromText(text, meta());
}

/** One-line summary used by the history list and the bubble preview. */
export function describeResult(result: DecodeResult): string {
  switch (result.kind) {
    case 'jwt':
      return `JWT · ${result.claims.validity}`;
    case 'json': {
      if (Array.isArray(result.value)) return `JSON array · ${result.value.length} items`;
      const keys = result.value && typeof result.value === 'object' ? Object.keys(result.value) : [];
      return `JSON · ${keys.length} keys`;
    }
    case 'text':
      return `Text · ${result.text.length} chars`;
    case 'binary':
      return `Binary · ${result.bytes.length} bytes`;
    case 'error':
      return result.message;
  }
}
