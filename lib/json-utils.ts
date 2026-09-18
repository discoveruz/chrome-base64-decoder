/**
 * JSON helpers shared by the decode pipeline and the tree view.
 * Pure — no browser APIs.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function tryParseJson(text: string): { ok: true; value: Json } | { ok: false } {
  const trimmed = text.trim();
  // Cheap gate first: JSON.parse accepts bare numbers and `true`, which would
  // make "12345" render as a JSON document rather than as text.
  if (!/^[[{]/.test(trimmed)) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) as Json };
  } catch {
    return { ok: false };
  }
}

export function prettyJson(value: Json): string {
  return JSON.stringify(value, null, 2);
}

export function minifiedJson(value: Json): string {
  return JSON.stringify(value);
}

export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export function kindOf(value: Json): JsonKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as JsonKind;
}

export function isContainer(value: Json): value is Json[] | { [key: string]: Json } {
  const k = kindOf(value);
  return k === 'object' || k === 'array';
}

/** Number of direct children, for the collapsed `{…} 5 keys` summary. */
export function childCount(value: Json): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

/** Build a JSON path segment, bracket-quoting keys that are not plain identifiers. */
export function appendPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${base}.${key}`;
  return `${base}[${JSON.stringify(key)}]`;
}

/** Format a scalar the way it should appear in the tree. */
export function formatScalar(value: Json): string {
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/**
 * Does this string look worth offering a nested decode on?
 * Deliberately conservative — a false positive puts a useless button on every
 * long string in the payload.
 */
export function looksDecodable(value: string): boolean {
  const s = value.trim();
  if (s.length < 16) return false;
  // JWT shape.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(s)) return true;
  // Base64 shape, long enough that it is unlikely to be an ordinary word.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return false;
  if (s.length % 4 === 1) return false;
  // Require some mixed case or digits; "aaaaaaaaaaaaaaaaaa" is not interesting.
  return /[A-Z]/.test(s) && /[a-z0-9]/.test(s);
}

/**
 * Does this selection contain something worth offering to decode?
 *
 * Looser than looksDecodable, because a selection is usually grabbed off a log
 * line or a query string and drags its label along: `payload_b64=…`, `v1:…`.
 * Each embedded run still has to pass the strict test, whose mixed-case
 * requirement is what keeps ordinary prose, URLs and domain names out.
 *
 * Kept separate from looksDecodable so the JSON tree's nested-decode button
 * stays conservative — there, a false positive puts a useless button on every
 * long string in the payload.
 */
export function containsDecodable(value: string): boolean {
  if (looksDecodable(value)) return true;
  const runs = value.match(/[A-Za-z0-9+/_-][A-Za-z0-9+/_.-]{18,}={0,2}/g) ?? [];
  return runs.some((run) => looksDecodable(run.replace(/^\.+|\.+$/g, '')));
}

/** Truncate for previews without splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = max;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return text.slice(0, cut) + '…';
}
