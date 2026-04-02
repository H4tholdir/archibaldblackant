-- Migration 046: Expanded roles, per-user modules, MFA support

-- Expand role constraint to support new roles
ALTER TABLE agents.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE agents.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('agent', 'admin', 'ufficio', 'concessionario'));

-- Per-user module permissions (array of module names as JSONB)
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  modules JSONB NOT NULL DEFAULT '[]'::jsonb;

-- MFA columns
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_secret_encrypted TEXT;
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_secret_iv TEXT;
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_secret_auth_tag TEXT;

-- MFA recovery codes (one-time use)
CREATE TABLE IF NOT EXISTS agents.mfa_recovery_codes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id
  ON agents.mfa_recovery_codes (user_id);
