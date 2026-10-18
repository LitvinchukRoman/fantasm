-- Product analytics. Raw events are the source of truth for a retention window;
-- analytics_daily is the permanent, cheap rollup the admin dashboard reads.
CREATE TABLE analytics_events (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  timestamptz NOT NULL,
    name         text        NOT NULL,
    actor_id     uuid        REFERENCES users (id) ON DELETE SET NULL,
    visitor      text,
    subject_type text        NOT NULL DEFAULT '',
    subject_id   text        NOT NULL DEFAULT '',
    path         text        NOT NULL DEFAULT '',
    props        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT analytics_events_name_len     CHECK (char_length(name) BETWEEN 1 AND 64),
    CONSTRAINT analytics_events_visitor_len  CHECK (visitor IS NULL OR char_length(visitor) = 64),
    CONSTRAINT analytics_events_subject_len  CHECK (char_length(subject_type) <= 32 AND char_length(subject_id) <= 80),
    CONSTRAINT analytics_events_path_len     CHECK (char_length(path) <= 200)
);

CREATE INDEX analytics_events_occurred_idx ON analytics_events (occurred_at);
CREATE INDEX analytics_events_name_occurred_idx ON analytics_events (name, occurred_at);
CREATE INDEX analytics_events_actor_idx ON analytics_events (actor_id, occurred_at) WHERE actor_id IS NOT NULL;

CREATE TABLE analytics_daily (
    day    date   NOT NULL,
    metric text   NOT NULL,
    dim    text   NOT NULL DEFAULT '',
    value  bigint NOT NULL,
    PRIMARY KEY (day, metric, dim),
    CONSTRAINT analytics_daily_metric_len CHECK (char_length(metric) BETWEEN 1 AND 64),
    CONSTRAINT analytics_daily_dim_len    CHECK (char_length(dim) <= 160),
    CONSTRAINT analytics_daily_value_nonneg CHECK (value >= 0)
);

CREATE INDEX analytics_daily_metric_day_idx ON analytics_daily (metric, day);
