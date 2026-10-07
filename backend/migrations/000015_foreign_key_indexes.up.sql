-- Foreign keys that had no index of their own. Deleting or updating a referenced row
-- (a user, a post) scans the whole referencing table without one. TestSchemaConventions keeps this list at zero.

CREATE INDEX topics_author_id_idx ON topics (author_id);
CREATE INDEX posts_parent_id_idx ON posts (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX reports_user_id_idx ON reports (user_id);
CREATE INDEX moderation_cases_decided_by_idx ON moderation_cases (decided_by) WHERE decided_by IS NOT NULL;
