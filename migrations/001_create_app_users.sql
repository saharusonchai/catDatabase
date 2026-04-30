CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT app_users_username_length CHECK (char_length(username) >= 3),
  CONSTRAINT app_users_email_format CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT app_users_password_hash_length CHECK (char_length(password_hash) > 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_key
  ON app_users (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_key
  ON app_users (lower(email));
