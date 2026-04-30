CREATE TABLE IF NOT EXISTS app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  connection_key text NOT NULL,
  label text NOT NULL,
  config jsonb NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_connections_connection_key_length CHECK (char_length(connection_key) > 0),
  CONSTRAINT app_user_connections_label_length CHECK (char_length(label) > 0),
  CONSTRAINT app_user_connections_config_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS app_user_connections_user_connection_key
  ON app_user_connections (user_id, connection_key);

CREATE INDEX IF NOT EXISTS app_user_connections_user_last_used_idx
  ON app_user_connections (user_id, last_used_at DESC);
