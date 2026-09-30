DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM ideas WHERE organization_id IS NOT NULL AND organization_id <> 'naukma') THEN
        RAISE EXCEPTION 'Cannot roll back organization visibility while other organizations have restricted ideas';
    END IF;
END $$;
ALTER TABLE ideas DROP CONSTRAINT ideas_organization_visibility_check;
ALTER TABLE ideas DROP CONSTRAINT ideas_visibility_check;
UPDATE ideas SET visibility = 'MEMBERS_ONLY' WHERE visibility = 'ORGANIZATION_ONLY';
ALTER TABLE ideas ADD CONSTRAINT ideas_visibility_check CHECK (visibility IN ('PUBLIC', 'MEMBERS_ONLY'));
ALTER TABLE ideas DROP COLUMN organization_id;
