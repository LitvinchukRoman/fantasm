CREATE TABLE votes (
    idea_id    uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    weight     smallint    NOT NULL CHECK (weight > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (idea_id, user_id)
);

CREATE INDEX votes_user_id_idx ON votes (user_id);

CREATE TABLE participations (
    idea_id    uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state      text        NOT NULL CHECK (state IN ('INTERESTED', 'JOINED', 'ACCEPTED', 'DECLINED')),
    role       text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (idea_id, user_id)
);

CREATE INDEX participations_user_id_idx ON participations (user_id);
