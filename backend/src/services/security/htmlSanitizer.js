import sanitizeHtml from 'sanitize-html';

// Values containing url(), expression() or javascript: are rejected so CSS
// cannot load remote resources or run script.
const SAFE_VALUE =
  /^(?!.*(url\s*\(|expression\s*\(|javascript:|@import))[^<>]*$/i;
const STYLE_PROPERTIES = [
  'color',
  'background-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-align',
  'text-decoration',
  'text-transform',
  'line-height',
  'letter-spacing',
  'white-space',
  'vertical-align',
  'width',
  'max-width',
  'min-width',
  'height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'list-style-type',
];
const DISPLAY = /^(block|inline|inline-block|table|table-row|table-cell|none)$/;

const BASE_OPTIONS = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'font',
    'center',
    'u',
    's',
    'small',
    'big',
    'span',
    'hr',
  ],
  allowedAttributes: {
    '*': [
      'style',
      'align',
      'valign',
      'width',
      'height',
      'dir',
      'title',
      'bgcolor',
      'border',
      'cellpadding',
      'cellspacing',
      'colspan',
      'rowspan',
    ],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'data-blocked-src'],
    font: ['face', 'size', 'color'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https', 'http', 'cid', 'data'] },
  allowProtocolRelative: false,
  allowedStyles: {
    '*': Object.fromEntries([
      ...STYLE_PROPERTIES.map((p) => [p, [SAFE_VALUE]]),
      ['display', [DISPLAY]],
    ]),
  },
  // <style>, <script>, <iframe>, <form>, <object>, event handlers and unknown
  // tags are dropped by omission from the allow-lists above.
};

const isRemote = (src) => /^https?:/i.test(src ?? '');

/**
 * Sanitizes untrusted email HTML for display. Remote images are blocked by
 * default (tracking pixels): their URL is moved to data-blocked-src so the UI
 * can offer "show images" without re-fetching the message.
 */
export function sanitizeEmailHtml(html, { allowRemoteImages = false } = {}) {
  if (!html) return { html: '', blockedImages: 0 };
  let blockedImages = 0;
  const clean = sanitizeHtml(html, {
    ...BASE_OPTIONS,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
      img: (tagName, attribs) => {
        const { 'data-blocked-src': _ignored, ...rest } = attribs;
        if (!allowRemoteImages && isRemote(rest.src)) {
          blockedImages += 1;
          const { src, ...others } = rest;
          return { tagName, attribs: { ...others, 'data-blocked-src': src } };
        }
        return { tagName, attribs: rest };
      },
    },
  });
  return { html: clean, blockedImages };
}

/** Sanitizes HTML the user composed before it is sent. */
export const sanitizeOutgoingHtml = (html) =>
  sanitizeEmailHtml(html, { allowRemoteImages: true }).html;
