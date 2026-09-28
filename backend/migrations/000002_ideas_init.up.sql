CREATE TABLE ideas (
    id               uuid PRIMARY KEY,
    author_id        uuid             NOT NULL REFERENCES users (id),
    slug             text             NOT NULL UNIQUE,
    title            text             NOT NULL,
    summary          text             NOT NULL DEFAULT '',
    body             text             NOT NULL DEFAULT '',
    cover_url        text             NOT NULL DEFAULT '',
    category         text             NOT NULL CHECK (category IN ('STARTUP', 'PROJECT', 'EVENT', 'COMMUNITY', 'VOLUNTEERING', 'OTHER')),
    status           text             NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'OPEN', 'TEAM_FORMING', 'IN_PROGRESS', 'DONE', 'ARCHIVED')),
    visibility       text             NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'UKMA_ONLY')),
    moderation_state text             NOT NULL DEFAULT 'PENDING' CHECK (moderation_state IN ('PENDING', 'APPROVED', 'HIDDEN', 'REJECTED')),
    campus           boolean          NOT NULL DEFAULT false,
    event_date       timestamptz,
    event_place      text             NOT NULL DEFAULT '',
    event_capacity   integer,
    event_roles      text[]           NOT NULL DEFAULT '{}',
    votes_weighted   integer          NOT NULL DEFAULT 0,
    comments_count   integer          NOT NULL DEFAULT 0,
    joins_count      integer          NOT NULL DEFAULT 0,
    hot_score        double precision NOT NULL DEFAULT 0,
    created_at       timestamptz      NOT NULL DEFAULT now(),
    updated_at       timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT ideas_event_requires_date CHECK (category <> 'EVENT' OR event_date IS NOT NULL)
);

CREATE INDEX ideas_author_id_idx ON ideas (author_id);
CREATE INDEX ideas_feed_hot_idx ON ideas (hot_score DESC, id) WHERE moderation_state = 'APPROVED';
CREATE INDEX ideas_feed_new_idx ON ideas (created_at DESC, id) WHERE moderation_state = 'APPROVED';
CREATE INDEX ideas_feed_top_idx ON ideas (votes_weighted DESC, id) WHERE moderation_state = 'APPROVED';

CREATE TABLE idea_tags (
    idea_id uuid NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    tag     text NOT NULL,
    PRIMARY KEY (idea_id, tag)
);

CREATE INDEX idea_tags_tag_idx ON idea_tags (tag);
