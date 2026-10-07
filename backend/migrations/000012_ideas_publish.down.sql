DROP INDEX ideas_author_created_idx;
DROP INDEX ideas_events_idx;
DROP INDEX ideas_feed_top_idx;
DROP INDEX ideas_feed_new_idx;
DROP INDEX ideas_feed_hot_idx;

DROP TRIGGER ideas_published_at ON ideas;
DROP FUNCTION ideas_set_published_at();
DROP FUNCTION idea_hot_score(integer, integer, integer, timestamptz, double precision, timestamptz);

ALTER TABLE idea_tags
    DROP CONSTRAINT idea_tags_label_length,
    DROP CONSTRAINT idea_tags_format,
    DROP COLUMN label;

ALTER TABLE ideas ADD COLUMN campus boolean NOT NULL DEFAULT false;
UPDATE ideas SET campus = true WHERE badge_organization_id IS NOT NULL;

ALTER TABLE ideas
    DROP CONSTRAINT ideas_counters_nonneg,
    DROP CONSTRAINT ideas_multipliers_range,
    DROP CONSTRAINT ideas_roles_count,
    DROP CONSTRAINT ideas_capacity_positive,
    DROP CONSTRAINT ideas_event_place_length,
    DROP CONSTRAINT ideas_cover_length,
    DROP CONSTRAINT ideas_body_length,
    DROP CONSTRAINT ideas_summary_length,
    DROP CONSTRAINT ideas_title_length,
    DROP CONSTRAINT ideas_slug_format;

ALTER TABLE ideas
    DROP COLUMN reading_minutes,
    DROP COLUMN toc,
    DROP COLUMN story,
    DROP COLUMN body_text,
    DROP COLUMN body_html,
    DROP COLUMN badge_organization_id,
    DROP COLUMN karma_multiplier,
    DROP COLUMN ranking_multiplier,
    DROP COLUMN deleted_at,
    DROP COLUMN published_at;

CREATE INDEX ideas_feed_hot_idx ON ideas (hot_score DESC, id) WHERE moderation_state = 'APPROVED';
CREATE INDEX ideas_feed_new_idx ON ideas (created_at DESC, id) WHERE moderation_state = 'APPROVED';
CREATE INDEX ideas_feed_top_idx ON ideas (votes_weighted DESC, id) WHERE moderation_state = 'APPROVED';
