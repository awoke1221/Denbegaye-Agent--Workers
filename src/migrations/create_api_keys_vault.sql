-- Migration: create_api_keys_vault.sql
-- Stores encrypted API keys for providers. Keys are stored encrypted using the application's ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS api_keys_vault (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  last_used timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_vault_user_provider ON api_keys_vault(user_id, provider);

-- RLS policies to ensure users can only access their own keys
ALTER TABLE api_keys_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own api keys" ON api_keys_vault;
CREATE POLICY "Users can manage own api keys" ON api_keys_vault
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
