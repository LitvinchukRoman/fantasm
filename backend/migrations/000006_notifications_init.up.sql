CREATE TABLE notifications (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       text        NOT NULL CHECK (type IN ('COMMENT', 'VOTE', 'JOIN', 'ACCEPTED', 'APPROVED', 'HIDDEN', 'EVENT_REMINDER', 'SYSTEM')),
    payload    jsonb       NOT NULL DEFAULT '{}',
    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC, id DESC);
