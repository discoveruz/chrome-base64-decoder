import { useMemo } from 'react';
import { CopyButton } from './CopyButton';
import './HexDump.css';

const BYTES_PER_ROW = 16;
/** Rendering every row of a multi-megabyte blob helps nobody. */
const MAX_ROWS = 2048;

/** Well-known magic bytes, so a binary payload is at least identifiable. */
const SIGNATURES: [number[], string][] = [
  [[0x89, 0x50, 0x4e, 0x47], 'PNG image'],
  [[0xff, 0xd8, 0xff], 'JPEG image'],
  [[0x47, 0x49, 0x46, 0x38], 'GIF image'],
  [[0x25, 0x50, 0x44, 0x46], 'PDF document'],
  [[0x50, 0x4b, 0x03, 0x04], 'ZIP archive (or .docx/.xlsx/.jar)'],
  [[0x1f, 0x8b], 'gzip stream'],
  [[0x52, 0x49, 0x46, 0x46], 'RIFF container (WAV/WebP/AVI)'],
  [[0x4f, 0x67, 0x67, 0x53], 'Ogg media'],
  [[0x00, 0x00, 0x01, 0x00], 'ICO icon'],
  [[0x7f, 0x45, 0x4c, 0x46], 'ELF binary'],
];

function identify(bytes: Uint8Array): string | null {
  for (const [magic, name] of SIGNATURES) {
    if (bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte)) {
      return name;
    }
  }
  return null;
}

function hex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

export function HexDump({ bytes }: { bytes: Uint8Array }) {
  const rows = useMemo(() => {
    const out: { offset: number; slice: Uint8Array }[] = [];
    const limit = Math.min(bytes.length, MAX_ROWS * BYTES_PER_ROW);
    for (let offset = 0; offset < limit; offset += BYTES_PER_ROW) {
      out.push({ offset, slice: bytes.subarray(offset, offset + BYTES_PER_ROW) });
    }
    return out;
  }, [bytes]);

  const hexText = useMemo(
    () => Array.from(bytes, hex).join(' '),
    [bytes],
  );

  const kind = identify(bytes);
  const truncated = rows.length * BYTES_PER_ROW < bytes.length;

  return (
    <div className="hex-panel">
      <div className="hex-header">
        <div>
          <strong>Binary data</strong>{' '}
          <span className="muted">
            {bytes.length.toLocaleString()} bytes
            {kind ? ` · looks like a ${kind}` : ''}
          </span>
          <div className="muted hex-note">
            The bytes decoded fine, but they are not valid UTF-8 text.
          </div>
        </div>
        <CopyButton value={hexText} label="Copy hex" className="btn" />
      </div>

      <div className="hex-body mono">
        {rows.map(({ offset, slice }) => (
          <div className="hex-row" key={offset}>
            <span className="hex-offset">{offset.toString(16).padStart(8, '0')}</span>
            <span className="hex-bytes">
              {Array.from({ length: BYTES_PER_ROW }, (_, i) => {
                const byte = slice[i];
                return byte === undefined ? '  ' : hex(byte);
              }).join(' ')}
            </span>
            <span className="hex-ascii">
              {Array.from(slice, (byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '·')).join('')}
            </span>
          </div>
        ))}
        {truncated && (
          <div className="hex-row muted">
            … {(bytes.length - rows.length * BYTES_PER_ROW).toLocaleString()} more bytes not shown
          </div>
        )}
      </div>
    </div>
  );
}
