'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import { rbacService } from '@/services/rbacService';

const MODULE_LABELS = {
  mail: 'Mail',
  contacts: 'Contacts',
  signatures: 'Signatures',
  users: 'Users',
  roles: 'Roles',
  mailboxes: 'Mailboxes',
  audit: 'Audit',
  settings: 'Settings',
};

export default function PermissionMatrix() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ roles }, { permissions }] = await Promise.all([
        rbacService.listRoles(),
        rbacService.listPermissions(),
      ]);
      setData({ roles, permissions });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modules = useMemo(() => {
    if (!data) return [];
    const grouped = new Map();
    for (const permission of data.permissions) {
      if (!grouped.has(permission.module)) grouped.set(permission.module, []);
      grouped.get(permission.module).push(permission);
    }
    return [...grouped.entries()];
  }, [data]);

  const grants = useMemo(
    () =>
      new Map(
        (data?.roles ?? []).map((role) => [
          role.code,
          new Set(role.permissions),
        ]),
      ),
    [data],
  );

  if (error)
    return (
      <Alert
        tone="error"
        title="Could not load roles"
        action={
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );

  if (!data)
    return (
      <div className="panel stack-sm" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} height={18} />
        ))}
      </div>
    );

  return (
    <div className="panel panel--flush">
      <div className="table-scroll">
        <table className="matrix">
          <caption className="sr-only">Permission matrix by role</caption>
          <thead>
            <tr>
              <th scope="col" className="matrix__permission">
                Permission
              </th>
              {data.roles.map((role) => (
                <th scope="col" key={role.id} className="matrix__role">
                  <span>{role.name}</span>
                  <span className="matrix__role-meta">
                    {role.userCount} user{role.userCount === 1 ? '' : 's'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map(([module, permissions]) => (
              <Fragment key={module}>
                <tr className="matrix__group">
                  <th scope="rowgroup" colSpan={data.roles.length + 1}>
                    {MODULE_LABELS[module] ?? module}
                  </th>
                </tr>
                {permissions.map((permission) => (
                  <tr key={permission.id}>
                    <th scope="row" className="matrix__permission">
                      <span className="matrix__name">{permission.name}</span>
                      <code className="matrix__code">{permission.code}</code>
                    </th>
                    {data.roles.map((role) => {
                      const granted = grants
                        .get(role.code)
                        ?.has(permission.code);
                      return (
                        <td
                          key={role.id}
                          className={
                            granted
                              ? 'matrix__cell matrix__cell--yes'
                              : 'matrix__cell'
                          }
                        >
                          {granted ? (
                            <Check size={16} aria-hidden="true" />
                          ) : (
                            <Minus size={14} aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {granted ? 'Granted' : 'Not granted'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
