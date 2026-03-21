CREATE TABLE proof_verifications (
  id BIGSERIAL PRIMARY KEY,
  subject_pubkey TEXT NOT NULL,
  proof_type TEXT NOT NULL,
  proof_value TEXT NOT NULL,
  granted_by_pubkey TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proof_verifications_subject_type
  ON proof_verifications (subject_pubkey, proof_type, created_at DESC);

CREATE TABLE gate_policies (
  id BIGSERIAL PRIMARY KEY,
  capability TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'relay',
  require_guest BOOLEAN NOT NULL DEFAULT FALSE,
  proof_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  granted_by_pubkey TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gate_policies_capability_scope
  ON gate_policies (capability, scope, created_at DESC);

CREATE TABLE editorial_pins (
  id BIGSERIAL PRIMARY KEY,
  geohash TEXT NOT NULL,
  note_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'featured',
  granted_by_pubkey TEXT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_editorial_pins_geohash
  ON editorial_pins (geohash, created_at DESC);
