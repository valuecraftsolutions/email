import libqp from 'libqp';
import charset from 'libmime/lib/charset.js';

export const PREVIEW_LENGTH = 180;

const ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Decodes a possibly truncated body fragment (the first bytes of a part)
 * according to its transfer encoding and charset. Incomplete trailing
 * sequences are dropped rather than producing garbage.
 */
export function decodeFragment(
  buffer,
  { encoding, charset: cs, alreadyDecoded = false },
) {
  let bytes = buffer;
  const enc = (encoding || '').toLowerCase();
  if (!alreadyDecoded && enc === 'base64') {
    const clean = buffer.toString('ascii').replace(/[^A-Za-z0-9+/]/g, '');
    bytes = Buffer.from(
      clean.slice(0, clean.length - (clean.length % 4)),
      'base64',
    );
  } else if (!alreadyDecoded && enc === 'quoted-printable') {
    bytes = libqp.decode(
      buffer.toString('binary').replace(/=[0-9A-Fa-f]?$/, ''),
    );
  }
  let text;
  try {
    text = charset.decode(bytes, cs || 'utf-8');
  } catch {
    text = bytes.toString('utf8');
  }
  return text.replace(/�+$/, '');
}

/** Turns decoded text or HTML into a short single-line preview. */
export function toPreview(text, { html = false } = {}) {
  if (!text) return '';
  let value = text;
  if (html)
    value = value
      .replace(/<(style|script|head|title)\b[\s\S]*?(<\/\1\s*>|$)/gi, ' ')
      .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
      .replace(/<[^>]*>?/g, ' ')
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, name) => {
        if (name[0] === '#') {
          const code =
            name[1].toLowerCase() === 'x'
              ? parseInt(name.slice(2), 16)
              : parseInt(name.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code < 0x110000
            ? String.fromCodePoint(code)
            : ' ';
        }
        return ENTITIES[name.toLowerCase()] ?? match;
      });
  value = value
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line)) // drop quoted reply lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length > PREVIEW_LENGTH
    ? `${value.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…`
    : value;
}
