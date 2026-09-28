'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  addressList,
  escapeHtml,
  formatAddress,
  formatLongDate,
} from '@/utils/mail';

const BASE_STYLES = `
  html,body{margin:0;background:#fff;color:#1f2933}
  body{padding:4px 2px 16px;font:14px/1.55 'Segoe UI',system-ui,-apple-system,Arial,sans-serif;overflow-wrap:anywhere}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  pre{white-space:pre-wrap}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #cbd2d9;padding-left:1ex;color:#52606d}
  a{color:#0b7a6c}
  .print-header{display:none;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #ccc;font-size:12px}
  .print-header h1{font-size:18px;margin:0 0 8px}
  @media print{.print-header{display:block}}
`;

function buildDocument(message, allowRemoteImages) {
  // Defence in depth: the HTML is already sanitized server-side, and this CSP
  // blocks scripts, forms, frames and (unless allowed) remote images.
  const imgSrc = allowRemoteImages
    ? "'self' data: https: http:"
    : "'self' data:";
  const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'`;
  const printHeader =
    `<div class="print-header"><h1>${escapeHtml(message.subject || '(no subject)')}</h1>` +
    `<div><b>From:</b> ${escapeHtml(formatAddress(message.from))}</div>` +
    `<div><b>To:</b> ${escapeHtml(addressList(message.to))}</div>` +
    (message.cc?.length
      ? `<div><b>Cc:</b> ${escapeHtml(addressList(message.cc))}</div>`
      : '') +
    `<div><b>Date:</b> ${escapeHtml(formatLongDate(message.date))}</div></div>`;
  const body = message.html ?? `<pre>${escapeHtml(message.text || '')}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${BASE_STYLES}</style></head><body>${printHeader}${body}</body></html>`;
}

/**
 * Renders message content in a sandboxed iframe. No allow-scripts: even if
 * sanitization missed something, nothing can execute. allow-same-origin is
 * required so inline (cid) images can use the session cookie and so the
 * parent can size the frame; it is safe without script execution.
 */
const MessageBody = forwardRef(function MessageBody(
  { message, allowRemoteImages },
  ref,
) {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(200);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement)
      setHeight(Math.max(120, doc.documentElement.scrollHeight));
  }, []);

  useImperativeHandle(ref, () => ({
    print: () => frameRef.current?.contentWindow?.print(),
  }));

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer;
    const onLoad = () => {
      measure();
      const doc = frame.contentDocument;
      if (doc?.body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(doc.body);
      }
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [measure, message, allowRemoteImages]);

  return (
    <iframe
      ref={frameRef}
      className="message-frame"
      title="Message content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
      srcDoc={buildDocument(message, allowRemoteImages)}
      style={{ height }}
    />
  );
});

export default MessageBody;
