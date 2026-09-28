import { api } from '@/lib/api';

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      value !== false
    )
      search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const contactService = {
  list: ({ q, favorite, page, pageSize } = {}, options) =>
    api.get(`/contacts${query({ q, favorite, page, pageSize })}`, options),
  suggest: (q, options) => api.get(`/contacts/suggest${query({ q })}`, options),
  create: (contact) => api.post('/contacts', contact),
  update: (id, fields) =>
    api.patch(`/contacts/${encodeURIComponent(id)}`, fields),
  remove: (id) => api.delete(`/contacts/${encodeURIComponent(id)}`),
};

export const signatureService = {
  mine: () => api.get('/signatures/me'),
  updateMine: (fields) => api.put('/signatures/me', fields),
  company: () => api.get('/signatures/company'),
  updateCompany: (html) => api.put('/signatures/company', { html }),
  preview: (html) => api.post('/signatures/preview', { html }),
};

export const preferenceService = {
  get: () => api.get('/preferences'),
  update: (fields) => api.put('/preferences', fields),
  profile: () => api.get('/profile'),
  updateProfile: (fields) => api.patch('/profile', fields),
};
