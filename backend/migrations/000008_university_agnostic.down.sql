ALTER TABLE users ADD COLUMN affiliation text NOT NULL DEFAULT 'EXTERNAL' CHECK (affiliation IN ('UKMA_VERIFIED', 'EXTERNAL'));
ALTER TABLE ideas DROP CONSTRAINT ideas_visibility_check;
UPDATE ideas SET visibility = 'UKMA_ONLY' WHERE visibility = 'MEMBERS_ONLY';
ALTER TABLE ideas ADD CONSTRAINT ideas_visibility_check CHECK (visibility IN ('PUBLIC', 'UKMA_ONLY'));
