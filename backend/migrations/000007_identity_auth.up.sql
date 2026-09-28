ALTER TABLE users DROP CONSTRAINT users_email_key;

ALTER TABLE external_identities ADD COLUMN issuer text;

UPDATE external_identities
SET issuer = CASE
    WHEN lower(provider) = 'google' THEN 'https://accounts.google.com'
    WHEN lower(provider) = 'entra' THEN 'https://login.microsoftonline.com/' || lower(tenant_id) || '/v2.0'
    ELSE provider
END;

ALTER TABLE external_identities ALTER COLUMN issuer SET NOT NULL;
ALTER TABLE external_identities DROP CONSTRAINT external_identities_pkey;
ALTER TABLE external_identities ADD PRIMARY KEY (issuer, subject);

UPDATE sessions SET id = encode(sha256(convert_to(id, 'UTF8')), 'hex');
ALTER TABLE sessions RENAME COLUMN id TO token_hash;
ALTER TABLE sessions ADD CONSTRAINT sessions_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$');
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE login_attempts (
    state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
    browser_hash text NOT NULL CHECK (browser_hash ~ '^[0-9a-f]{64}$'),
    provider text NOT NULL CHECK (provider IN ('google', 'entra')),
    nonce text NOT NULL,
    verifier text NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX login_attempts_expires_at_idx ON login_attempts (expires_at);
