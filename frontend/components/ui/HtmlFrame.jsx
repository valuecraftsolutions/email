'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STYLES =
  "html,body{margin:0;background:#fff;color:#1f2933}body{padding:12px;font:14px/1.5 'Segoe UI',system-ui,Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#0b7a6c}";

/**
 * Displays server-sanitized HTML (signatures, previews) in a sandboxed,
 * script-less iframe with a restrictive CSP.
 */
export default function HtmlFrame({ html, title = 'Preview', minHeight = 60 }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(minHeight);

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (doc?.documentElement)
      setHeight(Math.max(minHeight, doc.documentElement.scrollHeight));
  }, [minHeight]);

  useEffect(() => {
    const frame = ref.current;
    frame?.addEventListener('load', measure);
    return () => frame?.removeEventListener('load', measure);
  }, [measure]);

  const csp =
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
  return (
    <iframe
      ref={ref}
      className="html-frame"
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ height }}
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${STYLES}</style></head><body>${html || ''}</body></html>`}
    />
  );
}
