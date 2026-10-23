DROP INDEX notifications_unpushed_idx;
ALTER TABLE notifications DROP COLUMN push_sent_at;
DROP TABLE push_keys;
DROP TABLE push_subscriptions;
