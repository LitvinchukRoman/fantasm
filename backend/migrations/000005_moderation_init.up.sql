CREATE TABLE reports (
    idea_id    uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason     text        NOT NULL,
    status     text        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (idea_id, user_id)
);

CREATE TABLE moderation_cases (
    id         uuid        PRIMARY KEY,
    idea_id    uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    state      text        NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'CLOSED')),
    decision   text        CHECK (decision IN ('APPROVED', 'HIDDEN', 'REJECTED')),
    decided_by uuid        REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz
);

CREATE INDEX moderation_cases_open_idx ON moderation_cases (created_at) WHERE state = 'OPEN';
