/**
 * Base64 / base64url primitives.
 *
 * Everything here works on bytes, never on strings. Decoding straight from
 * `atob()` into a JS string silently corrupts any multi-byte UTF-8, so the
 * decoder always goes base64 -> Uint8Array -> TextDecoder.
 */

const STANDARD_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;
const URLSAFE_ALPHABET = /^[A-Za-z0-9_-]*={0,2}$/;

export type Base64Flavor = 'standard' | 'url';

/** Characters that are never part of a base64 payload but often surround one. */
const WRAPPING_QUOTES = ['"', "'", '`'];

/** Strip whitespace/newlines that wrapped tokens pick up from logs and terminals. */
export function stripWhitespace(input: string): string {
  return input.replace(/\s+/g, '');
}

export function unquote(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0] ?? '';
  const last = trimmed[trimmed.length - 1] ?? '';
  if (first === last && WRAPPING_QUOTES.includes(first)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Re-add the `=` padding that URL-safe and hand-trimmed tokens usually drop. */
export function repad(input: string): string {
  const remainder = input.length % 4;
  if (remainder === 0) return input;
  // A remainder of 1 is not a valid base64 length; leave it alone so the
  // caller reports a real error instead of us fabricating padding.
  if (remainder === 1) return input;
  return input + '='.repeat(4 - remainder);
}

export function detectFlavor(input: string): Base64Flavor | null {
  if (input.includes('-') || input.includes('_')) {
    return URLSAFE_ALPHABET.test(input) ? 'url' : null;
  }
  if (STANDARD_ALPHABET.test(input)) return 'standard';
  return null;
}

export function toStandardAlphabet(input: string): string {
  return input.replace(/-/g, '+').replace(/_/g, '/');
}

/**
 * Decode base64 (either flavor, padded or not) into raw bytes.
 * Throws with a human-readable message when the input is not decodable.
 */
export function base64ToBytes(input: string): Uint8Array {
  const compact = stripWhitespace(input);
  if (compact.length === 0) throw new Error('Nothing to decode.');

  const flavor = detectFlavor(compact);
  if (flavor === null) {
    const bad = [...new Set(compact.split('').filter((c) => !/[A-Za-z0-9+/=_-]/.test(c)))];
    throw new Error(
      bad.length
        ? `Not base64 — unexpected character${bad.length > 1 ? 's' : ''}: ${bad
            .slice(0, 5)
            .map((c) => JSON.stringify(c))
            .join(', ')}`
        : 'Not base64 — mixes URL-safe and standard alphabets.',
    );
  }

  const padded = repad(toStandardAlphabet(compact));
  if (padded.length % 4 !== 0) {
    throw new Error(`Not base64 — length ${compact.length} is not a valid base64 length.`);
  }

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('Not base64 — the input could not be decoded.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode bytes back to base64. Kept here so an encode mode is a small addition later. */
export function bytesToBase64(bytes: Uint8Array, flavor: Base64Flavor = 'standard'): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  const encoded = btoa(binary);
  if (flavor === 'standard') return encoded;
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
