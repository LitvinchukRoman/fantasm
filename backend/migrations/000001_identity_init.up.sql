CREATE TABLE users (
    id             uuid PRIMARY KEY,
    handle         text        NOT NULL UNIQUE,
    name           text        NOT NULL,
    email          text        NOT NULL UNIQUE,
    avatar_url     text        NOT NULL DEFAULT '',
    bio            text        NOT NULL DEFAULT '',
    faculty        text        NOT NULL DEFAULT '',
    affiliation    text        NOT NULL DEFAULT 'EXTERNAL' CHECK (affiliation IN ('UKMA_VERIFIED', 'EXTERNAL')),
    role           text        NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'MODERATOR', 'ADMIN')),
    karma          integer     NOT NULL DEFAULT 0,
    approved_ideas integer     NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_identities (
    provider       text    NOT NULL,
    subject        text    NOT NULL,
    user_id        uuid    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id      text    NOT NULL DEFAULT '',
    email_verified boolean NOT NULL DEFAULT false,
    PRIMARY KEY (provider, subject)
);

CREATE INDEX external_identities_user_id_idx ON external_identities (user_id);

CREATE TABLE sessions (
    id         text        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
