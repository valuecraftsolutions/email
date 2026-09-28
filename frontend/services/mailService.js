import { api } from '@/lib/api';

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== null && value !== '')
      search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Sends JSON, or multipart when new files are attached. */
function composeBody(message, files) {
  if (!files?.length) return message;
  const form = new FormData();
  form.append('message', JSON.stringify(message));
  for (const file of files) form.append('attachments', file, file.name);
  return form;
}

export const mailService = {
  listFolders: () => api.get('/mail/folders'),

  listMessages: ({ folder, page, pageSize }, options) =>
    api.get(`/mail/messages${query({ folder, page, pageSize })}`, options),

  /** criteria: q, from, to, subject, since, before, unread, hasAttachment */
  search: (criteria, options) =>
    api.get(`/mail/search${query(criteria)}`, options),

  getMessage: ({ folder, uid, markRead, images }, options) =>
    api.get(
      `/mail/messages/${uid}${query({ folder, markRead, images })}`,
      options,
    ),

  setFlags: (folder, uids, flags) =>
    api.post('/mail/messages/flags', { folder, uids, ...flags }),

  move: (folder, uids, destination) =>
    api.post('/mail/messages/move', { folder, uids, destination }),

  remove: (folder, uids, permanent = false) =>
    api.post('/mail/messages/delete', { folder, uids, permanent }),

  send: (message, files) => api.post('/mail/send', composeBody(message, files)),

  saveDraft: (message, files) =>
    api.post('/mail/drafts', composeBody(message, files)),

  attachmentUrl: (folder, uid, partId) =>
    `/api/mail/messages/${uid}/attachments/${encodeURIComponent(partId)}${query({ folder })}`,
};
