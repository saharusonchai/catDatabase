CREATE TABLE IF NOT EXISTS app_user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT app_user_sessions_token_hash_length CHECK (char_length(token_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_user_sessions_token_hash_key
  ON app_user_sessions (token_hash);

CREATE INDEX IF NOT EXISTS app_user_sessions_user_idx
  ON app_user_sessions (user_id);

CREATE INDEX IF NOT EXISTS app_user_sessions_expires_at_idx
  ON app_user_sessions (expires_at);
