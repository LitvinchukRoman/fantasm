ALTER TABLE ideas ADD COLUMN organization_id text;
ALTER TABLE ideas DROP CONSTRAINT ideas_visibility_check;
UPDATE ideas SET visibility = 'ORGANIZATION_ONLY', organization_id = 'naukma' WHERE visibility = 'MEMBERS_ONLY';
ALTER TABLE ideas ADD CONSTRAINT ideas_visibility_check CHECK (visibility IN ('PUBLIC', 'MEMBERS_ONLY', 'ORGANIZATION_ONLY'));
ALTER TABLE ideas ADD CONSTRAINT ideas_organization_visibility_check CHECK (
    (visibility = 'ORGANIZATION_ONLY' AND organization_id IS NOT NULL AND organization_id <> '')
    OR (visibility <> 'ORGANIZATION_ONLY' AND organization_id IS NULL)
);
