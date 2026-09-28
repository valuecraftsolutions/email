import { api } from '@/lib/api';

export const rbacService = {
  listRoles: () => api.get('/roles'),
  listPermissions: () => api.get('/permissions'),
};
