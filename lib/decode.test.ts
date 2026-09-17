import { describe, expect, it } from 'vitest';
import { decode } from './decode';
import { bytesToBase64, repad, textToBytes } from './base64';
import { relativeTime } from './jwt';

/** Encode a string as standard base64 the way a browser/server would. */
function b64(text: string): string {
  return bytesToBase64(textToBytes(text));
}

function b64url(text: string): string {
  return bytesToBase64(textToBytes(text), 'url');
}

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([textToBytes(text) as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

/** Build an unsigned-but-well-formed JWT for tests. */
function makeJwt(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) {
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.c2ln`;
}

describe('base64 -> JSON', () => {
  it('decodes plain base64 into a JSON object', async () => {
    const result = await decode('eyJuYW1lIjoiSm9obiIsImFnZSI6MzB9');
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.value).toEqual({ name: 'John', age: 30 });
  });

  it('decodes base64url with - and _', async () => {
    const source = JSON.stringify({ data: '??>>??', ok: true });
    const result = await decode(b64url(source));
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.value).toEqual({ data: '??>>??', ok: true });
    expect(result.steps).toContain('base64url');
  });

  it('tolerates missing padding', async () => {
    const padded = b64('{"a":1}');
    const unpadded = padded.replace(/=+$/, '');
    expect(unpadded).not.toBe(padded);
    const result = await decode(unpadded);
    expect(result.kind).toBe('json');
  });

  it('round-trips multi-byte UTF-8 without mangling it', async () => {
    // The classic atob() bug: decoding to a string instead of to bytes.
    const source = JSON.stringify({ greeting: 'héllo 😀 мир 日本語' });
    const result = await decode(b64(source));
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.value).toEqual({ greeting: 'héllo 😀 мир 日本語' });
  });

  it('strips whitespace and newlines from wrapped input', async () => {
    const wrapped = b64('{"wrapped":true}').replace(/(.{4})/g, '$1\n  ');
    const result = await decode(wrapped);
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.steps).toContain('removed whitespace');
  });

  it('strips wrapping quotes', async () => {
    const result = await decode(`"${b64('{"quoted":1}')}"`);
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.steps).toContain('removed quotes');
  });

  it('strips a Bearer prefix', async () => {
    const result = await decode(`Bearer ${b64('{"bearer":1}')}`);
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.steps).toContain('stripped “Bearer”');
  });

  it('strips a data: URI prefix', async () => {
    const result = await decode(`data:application/json;base64,${b64('{"uri":1}')}`);
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.steps).toContain('stripped data: URI prefix');
  });

  it('percent-decodes before decoding base64', async () => {
    const encoded = encodeURIComponent(b64('{"pct":1}'));
    const result = await decode(encoded.includes('%') ? encoded : `%20${b64('{"pct":1}')}`);
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.steps).toContain('percent-decoded');
  });
});

describe('plain text and JSON passthrough', () => {
  it('pretty-prints input that is already JSON', async () => {
    const result = await decode('{"already":  "json"}');
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.value).toEqual({ already: 'json' });
    expect(result.steps).toContain('already JSON');
  });

  it('returns text when the payload is not JSON', async () => {
    const result = await decode(b64('hello world, not json'));
    expect(result.kind).toBe('text');
    if (result.kind !== 'text') throw new Error('expected text');
    expect(result.text).toBe('hello world, not json');
  });
});

describe('JWT', () => {
  const hour = 3600;

  it('splits header, payload and signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeJwt({ sub: '1234567890', name: 'John Doe', iat: now, exp: now + hour });
    const result = await decode(token);
    expect(result.kind).toBe('jwt');
    if (result.kind !== 'jwt') throw new Error('expected jwt');
    expect(result.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect((result.payload as Record<string, unknown>).name).toBe('John Doe');
    expect(result.claims.subject).toBe('1234567890');
    expect(result.claims.alg).toBe('HS256');
  });

  it('marks an expired token expired', async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await decode(makeJwt({ exp: now - 3 * hour, iat: now - 4 * hour }));
    if (result.kind !== 'jwt') throw new Error('expected jwt');
    expect(result.claims.validity).toBe('expired');
    expect(result.claims.validityDetail).toMatch(/Expired .* ago/);
  });

  it('marks a not-yet-valid token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await decode(makeJwt({ nbf: now + hour, exp: now + 2 * hour }));
    if (result.kind !== 'jwt') throw new Error('expected jwt');
    expect(result.claims.validity).toBe('not-yet-valid');
  });

  it('reports unknown validity when there is no exp or nbf', async () => {
    const result = await decode(makeJwt({ sub: 'no-times' }));
    if (result.kind !== 'jwt') throw new Error('expected jwt');
    expect(result.claims.validity).toBe('unknown');
  });

  it('handles an alg:none token with an empty signature', async () => {
    const token = `${b64url('{"alg":"none"}')}.${b64url('{"sub":"x"}')}.`;
    const result = await decode(token);
    expect(result.kind).toBe('jwt');
    if (result.kind !== 'jwt') throw new Error('expected jwt');
    expect(result.signature).toBe('');
    expect(result.claims.alg).toBe('none');
  });

  it('humanizes time claims', async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await decode(makeJwt({ iat: now - 60, exp: now + hour }));
    if (result.kind !== 'jwt') throw new Error('expected jwt');
    const exp = result.claims.times.find((t) => t.name === 'exp');
    expect(exp?.label).toBe('Expires');
    expect(exp?.relative).toMatch(/^in /);
  });

  it('errors specifically when a JWT-shaped value does not decode', async () => {
    const result = await decode('aaaa.bbbb.cccc');
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('expected error');
    expect(result.hint).toMatch(/JWT shape/);
  });
});

describe('compression and binary', () => {
  it('transparently gunzips a gzipped payload', async () => {
    const result = await decode(await gzipBase64('{"compressed":true}'));
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.value).toEqual({ compressed: true });
    expect(result.steps).toContain('gunzipped');
  });

  it('falls back to binary for non-UTF-8 bytes', async () => {
    // PNG magic bytes — valid base64, invalid UTF-8.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await decode(bytesToBase64(png));
    expect(result.kind).toBe('binary');
    if (result.kind !== 'binary') throw new Error('expected binary');
    expect(Array.from(result.bytes)).toEqual(Array.from(png));
  });
});

describe('errors', () => {
  it('reports empty input', async () => {
    const result = await decode('   ');
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('expected error');
    expect(result.message).toMatch(/Nothing to decode/);
  });

  it('names the offending characters', async () => {
    const result = await decode('not base64 at all!!! ###');
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('expected error');
    expect(result.message).toMatch(/unexpected character/i);
  });
});

describe('helpers', () => {
  it('does not fabricate padding for an impossible length', () => {
    expect(repad('abcde')).toBe('abcde');
    expect(repad('abc')).toBe('abc=');
    expect(repad('ab')).toBe('ab==');
    expect(repad('abcd')).toBe('abcd');
  });

  it('formats relative times in both directions', () => {
    const now = Date.UTC(2024, 0, 1, 12, 0, 0);
    expect(relativeTime(now + 42 * 60_000, now)).toBe('in 42 minutes');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(relativeTime(now - 60_000, now)).toBe('1 minute ago');
  });
});
