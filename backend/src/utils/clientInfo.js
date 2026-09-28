import { isIP } from 'node:net';

const MAX_USER_AGENT = 512;

export const normalizeIp = (ip) => (ip && isIP(ip) ? ip : null);

export const normalizeUserAgent = (value) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, MAX_USER_AGENT)
    : null;
