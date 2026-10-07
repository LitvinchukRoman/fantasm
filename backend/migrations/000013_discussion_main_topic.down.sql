DROP INDEX posts_author_idx;
DROP INDEX posts_thread_idx;

ALTER TABLE posts
    DROP CONSTRAINT posts_body_length,
    DROP CONSTRAINT posts_depth_range,
    DROP COLUMN updated_at,
    DROP COLUMN text,
    DROP COLUMN html,
    DROP COLUMN depth;

DROP TRIGGER ideas_main_topic ON ideas;
DROP FUNCTION ideas_create_main_topic();
DROP INDEX topics_main_per_idea_key;

ALTER TABLE topics DROP COLUMN kind;
