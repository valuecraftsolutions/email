# ValueCraft Mail

Company webmail and email administration for **ValueCraft Minds**, served at
`https://mail.valuecraftminds.com`. Hostinger Email remains the mail provider and
the source of truth for messages; this application adds a custom webmail UI,
application accounts, role-based access control, auditing and administration.

```text
Browser ──> Next.js (frontend/, :4601) ──/api──> Express API (backend/, :4600)
                                                   ├── PostgreSQL (application data only)
                                                   └── Mail provider layer ──> Hostinger (IMAP 993 / SMTP 465, TLS)
```

PostgreSQL stores users, roles, permissions, mailbox mappings, contacts,
signatures, preferences, sessions, audit logs and settings. Mailbox contents are
**not** copied into the database.

## Status

| Phase | Scope                                                                         | State               |
| ----- | ----------------------------------------------------------------------------- | ------------------- |
| 1     | Foundation: schema, config, API base, auth, sessions, RBAC, shell             | Done                |
| 2     | Hostinger provider layer (IMAP/SMTP), mailbox connection, mail API            | Done, verified live |
| 3     | Webmail: list + previews, reader, compose, reply/forward, drafts, attachments | Done                |
| 4     | Contacts, signatures, advanced search, preferences, profile                   | Done                |
| 5–7   | Administration, QA, deployment                                                | Not started         |

## Requirements

- Node.js 22+
- PostgreSQL 15+ (uses `gen_random_uuid()`, `inet`, `jsonb`)

## Getting started

```bash
npm install

# 1. Configure the API (never commit backend/.env)
cp backend/.env.example backend/.env
npm run secrets:generate          # paste SESSION_SECRET and MAILBOX_ENCRYPTION_KEY into backend/.env
# set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD

# 2. Optional: frontend proxy target (defaults to http://127.0.0.1:4600)
cp frontend/.env.example frontend/.env.local

# 3. Create the schema and the first super admin (password is prompted, hidden)
npm run db:migrate
npm run admin:create -- --email you@valuecraftminds.com --name "Your Name" --role SUPER_ADMIN

# 4. Run API + web app
npm run dev                       # open http://localhost:4601
```

Open the app on exactly the origin configured in `APP_ORIGIN`
(`http://localhost:4601` by default). Requests from any other origin, including
`127.0.0.1`, are rejected by design.

## Scripts

| Command                                                      | Purpose                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `npm run dev`                                                | API (watch mode) and Next.js dev server                 |
| `npm test`                                                   | Backend tests (in-process PostgreSQL via PGlite)        |
| `npm run build`                                              | Production build of the frontend                        |
| `npm run db:migrate`                                         | Apply pending SQL migrations                            |
| `npm run admin:create -- --email … --name "…" [--role ROLE]` | Create an application user with a role                  |
| `npm run secrets:generate`                                   | Print fresh random values for secrets                   |
| `npm run mail:check -- --email … [--send-to …]`              | Verify a connected mailbox against the live mail server |

## Environment variables (backend/.env)

| Variable                                                                    | Default                               | Notes                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                  | `development`                         | `production` enforces HTTPS origin, secure cookies and an encryption key         |
| `HOST` / `PORT`                                                             | `127.0.0.1` / `4600`                  | Keep the API bound to localhost behind Nginx                                     |
| `APP_ORIGIN`                                                                | `http://localhost:4601`               | Public web origin; used for CORS and the origin check on writes                  |
| `CORS_ORIGINS`                                                              | –                                     | Extra allowed origins, comma separated                                           |
| `TRUST_PROXY`                                                               | `0`                                   | Number of proxy hops (Nginx or the Next.js dev proxy = `1`)                      |
| `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | –                                     | PostgreSQL connection; `DB_SSL`, `DB_SSL_CA_PATH`, `DB_POOL_MAX` optional        |
| `SESSION_SECRET`                                                            | required                              | ≥ 32 random chars; derives CSRF tokens                                           |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_MINUTES`                                | `12` / `60`                           | Absolute and idle session lifetime                                               |
| `COOKIE_SECURE` / `COOKIE_SAME_SITE`                                        | prod: `true` / `lax`                  | Production cookie is named `__Host-vcm_session`                                  |
| `ARGON2_MEMORY_KIB` / `ARGON2_TIME_COST`                                    | `65536` / `3`                         | Argon2id cost                                                                    |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MINUTES`                  | `10` / `15`                           | Failed sign-ins per IP per window                                                |
| `ACCOUNT_LOCKOUT_THRESHOLD` / `ACCOUNT_LOCKOUT_MINUTES`                     | `5` / `15`                            | Temporary account lock after repeated failures                                   |
| `API_RATE_LIMIT_PER_MINUTE`                                                 | `600`                                 | Per-IP ceiling for the whole API                                                 |
| `MAILBOX_ENCRYPTION_KEY` / `MAILBOX_ENCRYPTION_KEY_ID`                      | – / `k1`                              | 32-byte base64 AES-256-GCM key for stored mailbox credentials (required in prod) |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_SECURE`                                   | `imap.hostinger.com` / `993` / `true` | Hostinger IMAP (TLS)                                                             |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE`                                   | `smtp.hostinger.com` / `465` / `true` | Hostinger SMTP (TLS); 587 + `SMTP_SECURE=false` uses STARTTLS                    |
| `MAIL_ALLOWED_DOMAINS`                                                      | `valuecraftminds.com`                 | Domains whose mailboxes users may connect                                        |
| `MAIL_SAVE_SENT_COPY`                                                       | `true`                                | Append sent mail to the Sent folder (SMTP does not do this itself)               |
| `MAIL_MAX_RECIPIENTS` / `MAIL_SEND_RATE_PER_MINUTE`                         | `100` / `20`                          | Per-message and per-user sending limits                                          |
| `MAIL_MAX_ATTACHMENT_MB` / `MAIL_MAX_ATTACHMENTS`                           | `25` / `20`                           | Per-message attachment limits (keep within the Hostinger plan)                   |
| `MAIL_BLOCKED_EXTENSIONS`                                                   | executables and scripts               | Extensions that can never be attached                                            |
| `MAIL_CONNECTION_TIMEOUT_MS`                                                | `15000`                               | IMAP/SMTP connect timeout                                                        |
| `HOSTINGER_MAIL_API_*`                                                      | –                                     | Reserved; the Hostinger Mail API is not used (see below)                         |

Secrets live only in `backend/.env` (git-ignored). Never paste real mailbox
passwords or API tokens into issues, prompts or commits.

## Security model (Phase 1)

- **Passwords**: Argon2id; transparent rehash when parameters change; timing
  equalised for unknown accounts; generic error messages.
- **Sessions**: 256-bit random token in an HttpOnly, SameSite=Lax cookie
  (`Secure` + `__Host-` prefix in production). Only its SHA-256 hash is stored.
  Idle and absolute expiry, per-device listing and revocation, revocation on
  password change and when an account stops being `ACTIVE`.
- **CSRF**: per-session HMAC token returned by `/api/auth/me` and sent as
  `X-CSRF-Token` on writes; plus an Origin / `Sec-Fetch-Site` check and a
  JSON/multipart-only body rule on every unsafe request.
- **RBAC**: permissions are loaded from the database on every request and
  enforced by `requirePermission()` on the API. Frontend checks only shape
  navigation.
- **Abuse protection**: per-IP login throttling, account lockout, API rate limit,
  100 KB JSON body limit.
- **Audit log**: append-only `audit_logs` table (UPDATE/DELETE/TRUNCATE blocked by
  triggers); metadata is scrubbed of credential-like keys.
- **Headers**: Helmet with `default-src 'none'` on the API, strict CORS,
  `Cache-Control: no-store` on API responses; the Next.js app sends
  `X-Frame-Options: DENY`, `nosniff` and a strict referrer policy.
- **Logging**: structured JSON (pino) with redaction of passwords, tokens, cookies
  and authorization headers; query strings are not logged.

## API

All responses use `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message", "details?", "requestId" } }`.

| Method & path                                                                             | Auth                                                   | Purpose                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                                         | –                                                      | Liveness                                                                                                                                              |
| `GET /api/health/ready`                                                                   | –                                                      | Readiness (database)                                                                                                                                  |
| `POST /api/auth/login`                                                                    | –                                                      | Sign in                                                                                                                                               |
| `GET /api/auth/me`                                                                        | session                                                | Current user, roles, permissions, CSRF                                                                                                                |
| `POST /api/auth/logout`                                                                   | session + CSRF                                         | Sign out this session                                                                                                                                 |
| `GET /api/auth/sessions`                                                                  | session                                                | Recent sessions (no token data)                                                                                                                       |
| `DELETE /api/auth/sessions/:id`                                                           | session + CSRF                                         | Revoke one of your sessions                                                                                                                           |
| `POST /api/auth/sessions/revoke-others`                                                   | session + CSRF                                         | Sign out all other sessions                                                                                                                           |
| `POST /api/auth/password`                                                                 | session + CSRF                                         | Change password                                                                                                                                       |
| `GET /api/roles`                                                                          | `roles.read`                                           | Roles with granted permission codes                                                                                                                   |
| `GET /api/permissions`                                                                    | `roles.read`                                           | Permission catalogue                                                                                                                                  |
| `GET /api/mailboxes/me`                                                                   | `mail.read_own`                                        | Your mailbox and connection status (never credentials)                                                                                                |
| `POST /api/mailboxes/me/connect`                                                          | `mail.read_own` + CSRF                                 | Verify and save your mailbox password (encrypted)                                                                                                     |
| `POST /api/mailboxes/me/test`                                                             | `mail.read_own` + CSRF                                 | Test IMAP and SMTP                                                                                                                                    |
| `DELETE /api/mailboxes/me`                                                                | `mail.read_own` + CSRF                                 | Delete the saved mailbox password                                                                                                                     |
| `GET /api/mail/capabilities`                                                              | `mail.read_own`                                        | What the provider supports                                                                                                                            |
| `GET /api/mail/folders`                                                                   | `mail.read_own`                                        | Folders with roles and unread counts                                                                                                                  |
| `GET /api/mail/messages?folder&page&pageSize`                                             | `mail.read_own`                                        | Message list, newest first (`folder` = path or role, e.g. `sent`)                                                                                     |
| `GET /api/mail/messages/:uid?folder&markRead&images`                                      | `mail.read_own`                                        | Message with sanitized HTML                                                                                                                           |
| `GET /api/mail/messages/:uid/attachments/:partId?folder`                                  | `mail.read_own`                                        | Attachment download (always `Content-Disposition: attachment`)                                                                                        |
| `GET /api/mail/search?folder&q&from&to&subject&since&before&unread&starred&hasAttachment` | `mail.read_own`                                        | IMAP search                                                                                                                                           |
| `POST /api/mail/messages/flags`                                                           | `mail.read_own` + CSRF                                 | Read / unread / star / unstar                                                                                                                         |
| `POST /api/mail/messages/move`                                                            | `mail.read_own` + CSRF                                 | Move messages                                                                                                                                         |
| `POST /api/mail/messages/delete`                                                          | `mail.delete_own` + CSRF                               | Move to Trash, or delete permanently from Trash                                                                                                       |
| `POST /api/mail/send`                                                                     | `mail.send` + CSRF                                     | Send (threading headers, duplicate guard via `clientRequestId`)                                                                                       |
| `GET` / `POST /api/mail/drafts`                                                           | `mail.read_own` / `mail.send` + CSRF                   | List / save drafts                                                                                                                                    |
| `GET /api/contacts?q&favorite&page&pageSize`                                              | `contacts.read`                                        | Own contacts (search, favorites first)                                                                                                                |
| `GET /api/contacts/suggest?q`                                                             | `contacts.read`                                        | Compose suggestions: own contacts, then active colleagues                                                                                             |
| `POST` / `PATCH` / `DELETE /api/contacts/:id`                                             | `contacts.create` / `update` / `delete` + CSRF         | Manage own contacts (owner-scoped)                                                                                                                    |
| `GET /api/signatures/me`                                                                  | `signatures.read`                                      | Company + own signature, selected mode, rendered HTML                                                                                                 |
| `PUT /api/signatures/me`                                                                  | `signatures.manage_own` + CSRF                         | Save own signature and/or mode (`company`, `own`, `none`)                                                                                             |
| `POST /api/signatures/preview`                                                            | `signatures.read` + CSRF                               | Render a template with your details                                                                                                                   |
| `GET` / `PUT /api/signatures/company`                                                     | `signatures.read` / `signatures.manage_company` + CSRF | Company template (placeholders `{{full_name}}`, `{{job_title}}`, `{{department}}`, `{{email}}`, `{{phone}}`, `{{company_name}}`); changes are audited |
| `GET` / `PUT /api/preferences`                                                            | session (+ CSRF)                                       | Theme, messages per page, density                                                                                                                     |
| `GET` / `PATCH /api/profile`                                                              | session (+ CSRF)                                       | Own profile; only display name and phone are editable                                                                                                 |

## Mail provider (Phase 2)

`backend/src/services/mail/` holds the provider abstraction:

- `MailProvider.js`: provider-neutral contract; unimplemented operations throw `NOT_SUPPORTED`.
- `HostingerMailProvider.js`: Hostinger Email over IMAP (`imapflow`) and SMTP (`nodemailer`), with a short-lived
  per-mailbox IMAP connection pool (`imapPool.js`).
- `mailProviderRegistry.js`: maps `mailboxes.provider` to an implementation; add new providers here.
- `mailService.js` / `mailboxService.js`: resolve the signed-in user's own mailbox, decrypt its credentials
  server-side, map provider errors to API errors and track connection status.

**Mailbox credentials.** Each employee connects the mailbox matching their sign-in address in _Settings → Mailbox_.
The password is verified against Hostinger (IMAP login + SMTP auth) before it is saved, then stored AES-256-GCM
encrypted with `MAILBOX_ENCRYPTION_KEY` and bound to the mailbox id. It is never returned, logged or audited.

**Why not the Hostinger Mail API.** Hostinger's Mail API (`api.mail.hostinger.com`) uses order-scoped bearer tokens
that can reach every mailbox in the order, it is sold as a separate product, and it has no endpoint for saving
drafts. IMAP/SMTP works with every Hostinger mailbox and supports all required operations. The provider layer
allows adding a Mail API transport later (for example, for new-mail webhooks).

**Security.** Message HTML is sanitized on the server (`htmlSanitizer.js`): scripts, event handlers, forms,
iframes, `<style>` and CSS `url()` are removed and remote images are blocked by default (`images=true` to load).
Attachments are always downloaded, never rendered inline.

## Project layout

```text
backend/
  migrations/            numbered SQL migrations (never edit an applied one)
  scripts/               migrate, create-admin, generate-secrets
  src/
    config/              env validation, logger, .env loading
    controllers/         HTTP adapters (no business logic)
    db/                  pg pool + transaction helper, migration runner
    jobs/                background jobs (session cleanup)
    middleware/          auth, CSRF, permissions, guards, validation, errors
    models/              row → API shape mappers
    repositories/        parameterised SQL only
    routes/              route wiring
    services/auth/       passwords, sessions, auth flows, RBAC
    services/security/   audit log, encryption
    validators/          zod schemas
  tests/                 node:test + supertest against PGlite
frontend/
  app/                   Next.js App Router pages (JSX)
  components/            layout, ui, providers, admin, mail, settings, auth
  lib/ services/ utils/  API client, permission metadata, formatting
```
