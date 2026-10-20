DROP TABLE github_link_attempts;

ALTER TABLE users
    DROP CONSTRAINT users_github_linked,
    DROP COLUMN github_id,
    DROP COLUMN github,
    DROP COLUMN linkedin,
    DROP COLUMN instagram;
