-- One MAIN discussion per idea, created together with the idea, and rendered
-- posts stored next to their Markdown source.

ALTER TABLE topics
    ADD COLUMN kind text NOT NULL DEFAULT 'MAIN' CHECK (kind IN ('MAIN', 'TOPIC'));

CREATE UNIQUE INDEX topics_main_per_idea_key ON topics (idea_id) WHERE kind = 'MAIN';

-- A trigger, not application code: the thread then exists for every idea however
-- it was inserted, and reading a thread never has to write.
CREATE FUNCTION ideas_create_main_topic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO topics (id, idea_id, author_id, title, kind, created_at)
    VALUES (gen_random_uuid(), NEW.id, NEW.author_id, left(NEW.title, 120), 'MAIN', NEW.created_at);
    RETURN NEW;
END
$$;

CREATE TRIGGER ideas_main_topic AFTER INSERT ON ideas
    FOR EACH ROW EXECUTE FUNCTION ideas_create_main_topic();

INSERT INTO topics (id, idea_id, author_id, title, kind, created_at)
SELECT gen_random_uuid(), i.id, i.author_id, left(i.title, 120), 'MAIN', i.created_at
FROM ideas i
WHERE NOT EXISTS (SELECT 1 FROM topics t WHERE t.idea_id = i.id AND t.kind = 'MAIN');

ALTER TABLE posts
    ADD COLUMN depth      smallint    NOT NULL DEFAULT 0,
    ADD COLUMN html       text        NOT NULL DEFAULT '',
    ADD COLUMN text       text        NOT NULL DEFAULT '',
    ADD COLUMN updated_at timestamptz;

ALTER TABLE posts
    ADD CONSTRAINT posts_depth_range  CHECK (depth BETWEEN 0 AND 8),
    ADD CONSTRAINT posts_body_length  CHECK (char_length(body) BETWEEN 1 AND 5000);

CREATE INDEX posts_thread_idx ON posts (topic_id, parent_id, created_at);
CREATE INDEX posts_author_idx ON posts (author_id);
