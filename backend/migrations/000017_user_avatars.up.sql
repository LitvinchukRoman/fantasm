-- An uploaded profile photo. The browser downscales it before upload, so a row stays small
-- enough to serve straight from Postgres; a separate table keeps the bytes out of every users read.

CREATE TABLE user_avatars (
	user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
	content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
	data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 262144),
	updated_at timestamptz NOT NULL
);
