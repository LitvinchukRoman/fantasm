DROP TABLE login_attempts;
DROP INDEX sessions_expires_at_idx;
ALTER TABLE sessions DROP CONSTRAINT sessions_token_hash;
DELETE FROM sessions;
ALTER TABLE sessions RENAME COLUMN token_hash TO id;
ALTER TABLE external_identities DROP CONSTRAINT external_identities_pkey;
ALTER TABLE external_identities ADD PRIMARY KEY (provider, subject);
ALTER TABLE external_identities DROP COLUMN issuer;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
