-- A decision leaves a trail: who, when, why, and which route the case came in by.
ALTER TABLE moderation_cases
    ADD COLUMN note   text CHECK (note IS NULL OR char_length(note) <= 1000),
    ADD COLUMN source text NOT NULL DEFAULT 'PREMODERATION' CHECK (source IN ('PREMODERATION', 'REPORTS'));

-- A decided case must say who decided it.
ALTER TABLE moderation_cases
    ADD CONSTRAINT moderation_cases_decided CHECK (state = 'OPEN' OR (decision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL));

-- One open case per idea, so concurrent reports cannot queue the same idea twice.
CREATE UNIQUE INDEX moderation_cases_one_open_idx ON moderation_cases (idea_id) WHERE state = 'OPEN';

ALTER TABLE reports
    ADD COLUMN resolved_at timestamptz,
    ADD CONSTRAINT reports_reason_length CHECK (char_length(reason) BETWEEN 1 AND 500);

CREATE INDEX reports_open_idx ON reports (idea_id) WHERE status = 'OPEN';
