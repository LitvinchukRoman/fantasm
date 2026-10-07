-- Publishing, soft delete, frozen ranking benefits and pre-rendered Markdown.

ALTER TABLE ideas
    ADD COLUMN published_at          timestamptz,
    ADD COLUMN deleted_at            timestamptz,
    ADD COLUMN ranking_multiplier    double precision NOT NULL DEFAULT 1,
    ADD COLUMN karma_multiplier      double precision NOT NULL DEFAULT 1,
    ADD COLUMN badge_organization_id text,
    -- Rendered once on write, from the sanitizing pipeline in Go. Reads never re-render.
    ADD COLUMN body_html             text             NOT NULL DEFAULT '',
    ADD COLUMN body_text             text             NOT NULL DEFAULT '',
    ADD COLUMN story                 text             NOT NULL DEFAULT '',
    ADD COLUMN toc                   jsonb            NOT NULL DEFAULT '[]',
    ADD COLUMN reading_minutes       integer          NOT NULL DEFAULT 1;

UPDATE ideas SET badge_organization_id = 'naukma' WHERE campus;
UPDATE ideas SET published_at = created_at WHERE moderation_state = 'APPROVED' AND status <> 'DRAFT';
ALTER TABLE ideas DROP COLUMN campus;

ALTER TABLE ideas
    ADD CONSTRAINT ideas_slug_format        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 90),
    ADD CONSTRAINT ideas_title_length       CHECK (char_length(title) BETWEEN 3 AND 120),
    ADD CONSTRAINT ideas_summary_length     CHECK (char_length(summary) <= 280),
    ADD CONSTRAINT ideas_body_length        CHECK (char_length(body) <= 20000),
    ADD CONSTRAINT ideas_cover_length       CHECK (char_length(cover_url) <= 500),
    ADD CONSTRAINT ideas_event_place_length CHECK (char_length(event_place) <= 200),
    ADD CONSTRAINT ideas_capacity_positive  CHECK (event_capacity IS NULL OR event_capacity BETWEEN 1 AND 100000),
    ADD CONSTRAINT ideas_roles_count        CHECK (cardinality(event_roles) <= 10),
    ADD CONSTRAINT ideas_multipliers_range  CHECK (ranking_multiplier BETWEEN 1 AND 100 AND karma_multiplier BETWEEN 1 AND 100),
    ADD CONSTRAINT ideas_counters_nonneg    CHECK (votes_weighted >= 0 AND comments_count >= 0 AND joins_count >= 0);

ALTER TABLE idea_tags
    ADD COLUMN label text NOT NULL DEFAULT '';
UPDATE idea_tags SET label = tag;
ALTER TABLE idea_tags
    ADD CONSTRAINT idea_tags_format CHECK (tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(tag) <= 40),
    ADD CONSTRAINT idea_tags_label_length CHECK (char_length(label) BETWEEN 1 AND 40);

-- hot = (weightedVotes + 0.5 * comments + 1.5 * joins) * multiplier / (ageHours + 2) ^ 1.5
-- Age counts from publication, so time spent in premoderation does not age an idea.
-- The Go twin is domain.HotScore; a test keeps the two equal.
CREATE FUNCTION idea_hot_score(votes integer, comments integer, joins integer, since timestamptz, multiplier double precision, at timestamptz)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN since IS NULL THEN 0::double precision ELSE
        (votes + 0.5 * comments + 1.5 * joins) * multiplier
        / power(greatest(extract(epoch FROM (at - since)) / 3600.0, 0) + 2, 1.5)
    END
$$;

CREATE FUNCTION ideas_set_published_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.published_at IS NULL AND NEW.moderation_state = 'APPROVED' AND NEW.status <> 'DRAFT' THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER ideas_published_at BEFORE INSERT OR UPDATE ON ideas
    FOR EACH ROW EXECUTE FUNCTION ideas_set_published_at();

DROP INDEX ideas_feed_hot_idx;
DROP INDEX ideas_feed_new_idx;
DROP INDEX ideas_feed_top_idx;

-- One predicate for "listed in the public feed"; every feed index carries it.
CREATE INDEX ideas_feed_hot_idx ON ideas (hot_score DESC, id DESC)
    WHERE moderation_state = 'APPROVED' AND deleted_at IS NULL AND status <> 'DRAFT';
CREATE INDEX ideas_feed_new_idx ON ideas (published_at DESC, id DESC)
    WHERE moderation_state = 'APPROVED' AND deleted_at IS NULL AND status <> 'DRAFT';
CREATE INDEX ideas_feed_top_idx ON ideas (votes_weighted DESC, id DESC)
    WHERE moderation_state = 'APPROVED' AND deleted_at IS NULL AND status <> 'DRAFT';
CREATE INDEX ideas_events_idx ON ideas (event_date, id) WHERE category = 'EVENT';
CREATE INDEX ideas_author_created_idx ON ideas (author_id, created_at DESC);
