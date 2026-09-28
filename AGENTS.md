# Contributor and coding-agent rules

ValueCraft Mail is built in phases (see README "Status"). Finish, test and
stabilise the current phase before starting the next.

- Stack is fixed: Next.js with **JSX/JavaScript only** (no TypeScript), Express 5
  (ESM), PostgreSQL. Match the existing layering: routes → controllers →
  services → repositories. No SQL outside `backend/src/repositories/`, no business
  logic in routes or controllers.
- Every schema change is a new numbered file in `backend/migrations/`. Never edit
  an applied migration (the runner rejects checksum changes).
- Every protected endpoint uses `authenticate`, `csrf` and `requirePermission(...)`
  with permission codes from the `permissions` table. Frontend permission checks
  are UX only.
- Use parameterised queries only. Use `db.transaction()` for multi-table writes and
  record audit entries inside the same transaction.
- Never log, audit, return or commit passwords, tokens, cookies, API keys or
  mailbox credentials. Secrets live only in the ignored `backend/.env`.
  Mailbox credentials are stored only as `encryptionService` ciphertext.
- Hostinger is the source of truth for mail. Do not copy mailbox contents into
  PostgreSQL. Do not invent Hostinger endpoints: verify against current official
  documentation, and return `NOT_SUPPORTED` for capabilities that are unavailable.
- Errors use the `{ success, error: { code, message } }` envelope via `AppError`;
  never expose stack traces or internal details.
- Run `npm test` and `npm run build` before declaring work complete.
