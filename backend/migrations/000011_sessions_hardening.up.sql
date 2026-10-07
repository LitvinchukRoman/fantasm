-- Sessions gain a public id (the token hash is never shown), an idle clock and
-- coarse client metadata for the "your sessions" list.
ALTER TABLE sessions
    ADD COLUMN id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN ip_hash      text        NOT NULL DEFAULT '',
    ADD COLUMN user_agent   text        NOT NULL DEFAULT '';

CREATE UNIQUE INDEX sessions_id_key ON sessions (id);
CREATE INDEX sessions_last_seen_at_idx ON sessions (last_seen_at);

-- Profile limits live in the database too: the service validates first, these are the last line.
ALTER TABLE users
    ADD CONSTRAINT users_handle_format CHECK (handle ~ '^[a-z0-9_][a-z0-9_-]{2,39}$'),
    ADD CONSTRAINT users_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
    ADD CONSTRAINT users_bio_length CHECK (char_length(bio) <= 500),
    ADD CONSTRAINT users_faculty_length CHECK (char_length(faculty) <= 100),
    ADD CONSTRAINT users_karma_nonnegative CHECK (karma >= 0 AND approved_ideas >= 0);
