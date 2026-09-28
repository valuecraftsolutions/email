'use client';

/**
 * Thin fetch wrapper for the Express API.
 * - Same-origin requests carry the HttpOnly session cookie automatically.
 * - Unsafe methods send the in-memory CSRF token.
 * - Responses are unwrapped from the { success, data | error } envelope.
 */

let csrfToken = null;
const unauthorizedListeners = new Set();

export const setCsrfToken = (token) => {
  csrfToken = token;
};

export const onUnauthorized = (listener) => {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
};

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
    this.requestId = requestId;
  }

  /** Maps validation details to { field: message } for forms. */
  fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

export async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  // FormData (file uploads) sets its own multipart boundary header.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm)
    headers['Content-Type'] = 'application/json';
  if (!SAFE_METHODS.has(method) && csrfToken)
    headers['X-CSRF-Token'] = csrfToken;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body:
        body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message:
        'Unable to reach the server. Check your connection and try again.',
    });
  }

  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.success) return payload.data;

  const error = new ApiError({
    status: response.status,
    code: payload?.error?.code ?? 'UNEXPECTED_RESPONSE',
    message:
      payload?.error?.message ?? 'Something went wrong. Please try again.',
    details: payload?.error?.details,
    requestId: payload?.error?.requestId,
  });
  if (response.status === 401 && error.code === 'UNAUTHENTICATED')
    unauthorizedListeners.forEach((listener) => listener(error));
  throw error;
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) =>
    apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options) =>
    apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) =>
    apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' }),
};
