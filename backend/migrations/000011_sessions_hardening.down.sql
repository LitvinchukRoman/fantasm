ALTER TABLE users
    DROP CONSTRAINT users_karma_nonnegative,
    DROP CONSTRAINT users_faculty_length,
    DROP CONSTRAINT users_bio_length,
    DROP CONSTRAINT users_name_length,
    DROP CONSTRAINT users_handle_format;

DROP INDEX sessions_last_seen_at_idx;
DROP INDEX sessions_id_key;

ALTER TABLE sessions
    DROP COLUMN user_agent,
    DROP COLUMN ip_hash,
    DROP COLUMN last_seen_at,
    DROP COLUMN id;
