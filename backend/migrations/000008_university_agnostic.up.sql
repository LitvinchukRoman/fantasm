ALTER TABLE users DROP COLUMN affiliation;
ALTER TABLE ideas DROP CONSTRAINT ideas_visibility_check;
UPDATE ideas SET visibility = 'MEMBERS_ONLY' WHERE visibility = 'UKMA_ONLY';
ALTER TABLE ideas ADD CONSTRAINT ideas_visibility_check CHECK (visibility IN ('PUBLIC', 'MEMBERS_ONLY'));
