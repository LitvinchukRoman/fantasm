-- Profile links store the account name on the network, never a URL: the frontend
-- builds the address itself, so a profile cannot carry javascript: or a lookalike host.
ALTER TABLE users
    ADD COLUMN github    text NOT NULL DEFAULT '' CHECK (length(github) <= 39),
    ADD COLUMN linkedin  text NOT NULL DEFAULT '' CHECK (length(linkedin) <= 100),
    ADD COLUMN instagram text NOT NULL DEFAULT '' CHECK (length(instagram) <= 30);

-- GitHub is linked through GitHub itself, never typed in: github_id is the
-- account GitHub vouched for (stable across renames), github its login at the time.
-- One GitHub account backs at most one profile.
ALTER TABLE users
    ADD COLUMN github_id bigint UNIQUE CHECK (github_id > 0),
    ADD CONSTRAINT users_github_linked CHECK ((github_id IS NULL) = (github = ''));

-- An attempt belongs to the signed-in user and the browser that started it, so a
-- callback replayed into someone else's browser or session links nothing.
CREATE TABLE github_link_attempts (
    state_hash   text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
    browser_hash text NOT NULL CHECK (browser_hash ~ '^[0-9a-f]{64}$'),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    verifier     text NOT NULL,
    expires_at   timestamptz NOT NULL
);

CREATE INDEX github_link_attempts_expires_at_idx ON github_link_attempts (expires_at);
CREATE INDEX github_link_attempts_user_id_idx ON github_link_attempts (user_id);
