-- Migration 049: MFA trusted devices (device trust per skip OTP)

CREATE TABLE IF NOT EXISTS agents.mfa_trusted_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  device_id        TEXT NOT NULL,
  trust_token_hash TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_mfa_trusted_devices_lookup
  ON agents.mfa_trusted_devices (user_id, device_id, expires_at);
