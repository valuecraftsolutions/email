const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatDateTime = (value) =>
  value ? dateTime.format(new Date(value)) : '—';

export function formatRelative(value) {
  if (!value) return '—';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDateTime(value);
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (
    parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')
  ).toUpperCase();
}

/** Lightweight, display-only user agent summary, e.g. "Chrome on Windows". */
export function describeUserAgent(ua) {
  if (!ua) return 'Unknown device';
  const browser =
    (/Edg\//.test(ua) && 'Edge') ||
    (/OPR\//.test(ua) && 'Opera') ||
    (/Firefox\//.test(ua) && 'Firefox') ||
    (/Chrome\//.test(ua) && 'Chrome') ||
    (/Safari\//.test(ua) && 'Safari') ||
    'Browser';
  const os =
    (/Windows/.test(ua) && 'Windows') ||
    (/iPhone|iPad/.test(ua) && 'iOS') ||
    (/Mac OS X/.test(ua) && 'macOS') ||
    (/Android/.test(ua) && 'Android') ||
    (/Linux/.test(ua) && 'Linux') ||
    'Unknown OS';
  return `${browser} on ${os}`;
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export const safeNextPath = (value) =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.startsWith('/\\')
    ? value
    : '/';
