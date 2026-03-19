CREATE TABLE policy_assignments (
  id BIGSERIAL PRIMARY KEY,
  subject_pubkey TEXT NOT NULL,
  policy_type TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'relay',
  granted_by_pubkey TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_assignments_subject_pubkey
  ON policy_assignments (subject_pubkey);

CREATE TABLE standing_records (
  id BIGSERIAL PRIMARY KEY,
  subject_pubkey TEXT NOT NULL,
  standing TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'relay',
  granted_by_pubkey TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_standing_records_pubkey_scope
  ON standing_records (subject_pubkey, scope);

CREATE TABLE room_permissions (
  id BIGSERIAL PRIMARY KEY,
  subject_pubkey TEXT NOT NULL,
  room_id TEXT NOT NULL,
  can_join BOOLEAN NOT NULL DEFAULT TRUE,
  can_publish BOOLEAN NOT NULL DEFAULT FALSE,
  can_subscribe BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by_pubkey TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  subject_pubkey TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_pubkey TEXT NOT NULL,
  action TEXT NOT NULL,
  target_pubkey TEXT,
  scope TEXT NOT NULL DEFAULT 'relay',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_created_at
  ON audit_log (created_at);
