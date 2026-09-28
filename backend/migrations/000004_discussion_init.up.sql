CREATE TABLE topics (
    id         uuid        PRIMARY KEY,
    idea_id    uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    author_id  uuid        NOT NULL REFERENCES users (id),
    title      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX topics_idea_id_idx ON topics (idea_id, created_at);

CREATE TABLE posts (
    id         uuid        PRIMARY KEY,
    topic_id   uuid        NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    author_id  uuid        NOT NULL REFERENCES users (id),
    parent_id  uuid        REFERENCES posts (id),
    body       text        NOT NULL,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_topic_id_idx ON posts (topic_id, created_at, id);
