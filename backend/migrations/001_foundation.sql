-- 001_foundation.sql
-- Core application schema for ValueCraft Mail.
-- Mailbox message content is NOT stored here: Hostinger remains the source of truth.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE SEQUENCE user_code_seq START 1;

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code             text NOT NULL DEFAULT ('USR' || lpad(nextval('user_code_seq')::text, 4, '0')),
  email                 text NOT NULL,
  full_name             text NOT NULL,
  display_name          text,
  department            text,
  job_title             text,
  phone                 text,
  status                text NOT NULL DEFAULT 'PENDING',
  password_hash         text,
  password_changed_at   timestamptz,
  failed_login_count    integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  mfa_enabled           boolean NOT NULL DEFAULT false,
  mfa_secret_encrypted  text,
  created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_user_code_key UNIQUE (user_code),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_user_code_format CHECK (user_code ~ '^USR[0-9]{4,}$'),
  CONSTRAINT users_email_format CHECK (
    email = lower(btrim(email)) AND length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING')),
  CONSTRAINT users_full_name_check CHECK (length(btrim(full_name)) BETWEEN 1 AND 150),
  CONSTRAINT users_display_name_check CHECK (display_name IS NULL OR length(display_name) <= 150),
  CONSTRAINT users_department_check CHECK (department IS NULL OR length(department) <= 100),
  CONSTRAINT users_job_title_check CHECK (job_title IS NULL OR length(job_title) <= 100),
  CONSTRAINT users_phone_check CHECK (phone IS NULL OR length(phone) <= 40),
  CONSTRAINT users_failed_login_count_check CHECK (failed_login_count >= 0),
  CONSTRAINT users_mfa_secret_check CHECK (NOT mfa_enabled OR mfa_secret_encrypted IS NOT NULL)
);
ALTER SEQUENCE user_code_seq OWNED BY users.user_code;
CREATE INDEX users_status_idx ON users (status);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  name         text NOT NULL,
  description  text,
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_code_key UNIQUE (code),
  CONSTRAINT roles_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  CONSTRAINT roles_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 100)
);
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  module       text NOT NULL,
  name         text NOT NULL,
  description  text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_code_key UNIQUE (code),
  CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  CONSTRAINT permissions_module_matches_code CHECK (split_part(code, '.', 1) = module)
);

CREATE TABLE role_permissions (
  role_id        uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id  uuid NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  granted_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);

CREATE TABLE user_roles (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  assigned_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles (role_id);

-- ---------------------------------------------------------------------------
-- Mailboxes (mapping to provider mailboxes; no message content)
-- ---------------------------------------------------------------------------
CREATE TABLE mailboxes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address           text NOT NULL,
  display_name            text,
  provider                text NOT NULL DEFAULT 'hostinger',
  status                  text NOT NULL DEFAULT 'ACTIVE',
  connection_status       text NOT NULL DEFAULT 'UNKNOWN',
  -- AES-256-GCM ciphertext produced by the application; the key lives outside the database.
  credentials_encrypted   text,
  credentials_updated_at  timestamptz,
  last_connected_at       timestamptz,
  last_error_code         text,
  last_error_at           timestamptz,
  created_by              uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailboxes_email_address_key UNIQUE (email_address),
  CONSTRAINT mailboxes_email_format CHECK (
    email_address = lower(btrim(email_address)) AND length(email_address) <= 254
    AND email_address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT mailboxes_provider_format CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT mailboxes_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT mailboxes_connection_status_check CHECK (connection_status IN ('UNKNOWN', 'CONNECTED', 'FAILED')),
  CONSTRAINT mailboxes_last_error_code_check CHECK (last_error_code IS NULL OR length(last_error_code) <= 64)
);
CREATE INDEX mailboxes_status_idx ON mailboxes (status);
CREATE TRIGGER mailboxes_set_updated_at BEFORE UPDATE ON mailboxes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_mailboxes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mailbox_id    uuid NOT NULL REFERENCES mailboxes (id) ON DELETE CASCADE,
  access_level  text NOT NULL DEFAULT 'OWNER',
  is_primary    boolean NOT NULL DEFAULT false,
  assigned_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_mailboxes_user_mailbox_key UNIQUE (user_id, mailbox_id),
  CONSTRAINT user_mailboxes_access_level_check CHECK (access_level IN ('OWNER', 'DELEGATE'))
);
CREATE INDEX user_mailboxes_mailbox_idx ON user_mailboxes (mailbox_id);
-- At most one primary mailbox per user and one owner per mailbox.
CREATE UNIQUE INDEX user_mailboxes_one_primary_idx ON user_mailboxes (user_id) WHERE is_primary;
CREATE UNIQUE INDEX user_mailboxes_one_owner_idx ON user_mailboxes (mailbox_id) WHERE access_level = 'OWNER';

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
CREATE TABLE contacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  first_name     text,
  last_name      text,
  display_name   text,
  email          text,
  phone          text,
  company        text,
  job_title      text,
  notes          text,
  is_favorite    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Composite key lets group membership enforce same-owner references.
  CONSTRAINT contacts_id_owner_key UNIQUE (id, owner_user_id),
  CONSTRAINT contacts_email_format CHECK (
    email IS NULL OR (email = lower(btrim(email)) AND length(email) <= 254
      AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  CONSTRAINT contacts_has_identity CHECK (
    coalesce(nullif(btrim(display_name), ''), nullif(btrim(first_name), ''),
             nullif(btrim(last_name), ''), email) IS NOT NULL
  ),
  CONSTRAINT contacts_field_lengths CHECK (
    coalesce(length(first_name), 0) <= 100 AND coalesce(length(last_name), 0) <= 100
    AND coalesce(length(display_name), 0) <= 200 AND coalesce(length(phone), 0) <= 40
    AND coalesce(length(company), 0) <= 150 AND coalesce(length(job_title), 0) <= 100
    AND coalesce(length(notes), 0) <= 5000
  )
);
CREATE UNIQUE INDEX contacts_owner_email_key ON contacts (owner_user_id, email) WHERE email IS NOT NULL;
CREATE INDEX contacts_owner_favorite_idx ON contacts (owner_user_id, is_favorite);
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contact_groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_groups_id_owner_key UNIQUE (id, owner_user_id),
  CONSTRAINT contact_groups_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX contact_groups_owner_name_key ON contact_groups (owner_user_id, lower(name));
CREATE TRIGGER contact_groups_set_updated_at BEFORE UPDATE ON contact_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contact_group_members (
  group_id       uuid NOT NULL,
  contact_id     uuid NOT NULL,
  owner_user_id  uuid NOT NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, contact_id),
  FOREIGN KEY (group_id, owner_user_id) REFERENCES contact_groups (id, owner_user_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id, owner_user_id) REFERENCES contacts (id, owner_user_id) ON DELETE CASCADE
);
CREATE INDEX contact_group_members_contact_idx ON contact_group_members (contact_id);

-- ---------------------------------------------------------------------------
-- Email signatures (company templates and per-user signatures)
-- ---------------------------------------------------------------------------
CREATE TABLE email_signatures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL,
  user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
  name        text NOT NULL,
  body_html   text NOT NULL DEFAULT '',
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_signatures_scope_check CHECK (scope IN ('COMPANY', 'USER')),
  CONSTRAINT email_signatures_scope_owner_check CHECK (
    (scope = 'COMPANY' AND user_id IS NULL) OR (scope = 'USER' AND user_id IS NOT NULL)
  ),
  CONSTRAINT email_signatures_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT email_signatures_body_length CHECK (length(body_html) <= 100000)
);
CREATE INDEX email_signatures_user_idx ON email_signatures (user_id);
CREATE UNIQUE INDEX email_signatures_company_default_idx ON email_signatures (scope)
  WHERE scope = 'COMPANY' AND is_default;
CREATE UNIQUE INDEX email_signatures_user_default_idx ON email_signatures (user_id)
  WHERE scope = 'USER' AND is_default;
CREATE TRIGGER email_signatures_set_updated_at BEFORE UPDATE ON email_signatures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- User preferences
-- ---------------------------------------------------------------------------
CREATE TABLE user_preferences (
  user_id                uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  theme                  text NOT NULL DEFAULT 'system',
  messages_per_page      integer NOT NULL DEFAULT 50,
  reading_pane           text NOT NULL DEFAULT 'right',
  density                text NOT NULL DEFAULT 'comfortable',
  timezone               text,
  locale                 text,
  default_signature_id   uuid REFERENCES email_signatures (id) ON DELETE SET NULL,
  notification_settings  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_theme_check CHECK (theme IN ('light', 'dark', 'system')),
  CONSTRAINT user_preferences_page_size_check CHECK (messages_per_page BETWEEN 10 AND 200),
  CONSTRAINT user_preferences_reading_pane_check CHECK (reading_pane IN ('right', 'bottom', 'off')),
  CONSTRAINT user_preferences_density_check CHECK (density IN ('comfortable', 'compact')),
  CONSTRAINT user_preferences_notifications_object CHECK (jsonb_typeof(notification_settings) = 'object')
);
CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions (only a SHA-256 hash of the opaque token is stored)
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash       text NOT NULL,
  ip_address       inet,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  mfa_verified_at  timestamptz,
  revoked_at       timestamptz,
  revoke_reason    text,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sessions_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_user_agent_length CHECK (user_agent IS NULL OR length(user_agent) <= 512),
  CONSTRAINT sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT sessions_revoke_consistency CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT sessions_revoke_reason_check CHECK (revoke_reason IS NULL OR revoke_reason IN (
    'LOGOUT', 'REVOKED_BY_USER', 'REVOKED_OTHERS', 'PASSWORD_CHANGED', 'ADMIN_REVOKED', 'ACCOUNT_DISABLED'
  ))
);
CREATE INDEX sessions_user_last_seen_idx ON sessions (user_id, last_seen_at DESC);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Audit logs (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- No ON DELETE action: users with audit history are disabled, never hard-deleted.
  actor_user_id  uuid REFERENCES users (id),
  action         text NOT NULL,
  resource_type  text,
  resource_id    text,
  outcome        text NOT NULL DEFAULT 'SUCCESS',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address     inet,
  user_agent     text,
  request_id     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_format CHECK (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  CONSTRAINT audit_logs_outcome_check CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  CONSTRAINT audit_logs_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT audit_logs_user_agent_length CHECK (user_agent IS NULL OR length(user_agent) <= 512)
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% not permitted)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- System settings (non-secret values; secrets are stored encrypted by the app)
-- ---------------------------------------------------------------------------
CREATE TABLE system_settings (
  key          text PRIMARY KEY,
  value        jsonb NOT NULL,
  is_secret    boolean NOT NULL DEFAULT false,
  description  text,
  updated_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_key_format CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
CREATE TRIGGER system_settings_set_updated_at BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
