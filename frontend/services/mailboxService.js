import { api } from '@/lib/api';

export const mailboxService = {
  listMine: () => api.get('/mailboxes/me'),
  connect: (password) => api.post('/mailboxes/me/connect', { password }),
  test: () => api.post('/mailboxes/me/test'),
  disconnect: () => api.delete('/mailboxes/me'),
};
