-- 003_productivity.sql
-- Phase 4: signature selection per user, contact search indexes and a default company signature.

ALTER TABLE user_preferences
  ADD COLUMN signature_mode text NOT NULL DEFAULT 'company',
  ADD CONSTRAINT user_preferences_signature_mode_check
    CHECK (signature_mode IN ('company', 'own', 'none'));

CREATE INDEX contacts_owner_display_name_idx ON contacts (owner_user_id, lower(display_name));
CREATE INDEX contacts_owner_last_name_idx ON contacts (owner_user_id, lower(last_name), lower(first_name));
CREATE INDEX users_full_name_idx ON users (lower(full_name));

-- Starting company template (editable in Admin → Email Signatures).
INSERT INTO email_signatures (scope, name, body_html, is_default)
SELECT 'COMPANY', 'Company signature',
  '<p style="margin:0"><strong>{{full_name}}</strong><br>{{job_title}}</p>'
  || '<p style="margin:8px 0 0"><strong>{{company_name}}</strong><br>'
  || '<a href="https://valuecraftminds.com">valuecraftminds.com</a></p>',
  true
WHERE NOT EXISTS (SELECT 1 FROM email_signatures WHERE scope = 'COMPANY' AND is_default);
