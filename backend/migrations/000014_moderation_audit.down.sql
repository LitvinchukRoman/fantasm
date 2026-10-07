DROP INDEX IF EXISTS reports_open_idx;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_reason_length, DROP COLUMN IF EXISTS resolved_at;
DROP INDEX IF EXISTS moderation_cases_one_open_idx;
ALTER TABLE moderation_cases DROP CONSTRAINT IF EXISTS moderation_cases_decided, DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS note;
