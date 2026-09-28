import { api } from '@/lib/api';

export const authService = {
  me: () => api.get('/auth/me'),
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  listSessions: () => api.get('/auth/sessions'),
  revokeSession: (id) => api.delete(`/auth/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: () => api.post('/auth/sessions/revoke-others'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/password', { currentPassword, newPassword }),
};
