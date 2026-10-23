-- One browser (or installed site) per row. The endpoint is the push service address
-- and is unique: a device that signs in as someone else moves with the session.
CREATE TABLE push_subscriptions (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint   text        NOT NULL,
    p256dh     text        NOT NULL,
    auth       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint),
    CONSTRAINT push_subscriptions_endpoint_len CHECK (char_length(endpoint) BETWEEN 8 AND 2000),
    CONSTRAINT push_subscriptions_p256dh_len CHECK (char_length(p256dh) BETWEEN 1 AND 200),
    CONSTRAINT push_subscriptions_auth_len CHECK (char_length(auth) BETWEEN 1 AND 200)
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id, created_at DESC);

-- The VAPID key pair that signs push requests. Created once, on first start,
-- unless the process was given a pair in the environment.
CREATE TABLE push_keys (
    id          boolean PRIMARY KEY DEFAULT true CHECK (id),
    public_key  text    NOT NULL,
    private_key text    NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Rows that already exist were written before anyone could subscribe, so they
-- are not a backlog to deliver. New rows leave this null until the push job runs.
ALTER TABLE notifications ADD COLUMN push_sent_at timestamptz;
UPDATE notifications SET push_sent_at = now() WHERE push_sent_at IS NULL;
CREATE INDEX notifications_unpushed_idx ON notifications (created_at) WHERE push_sent_at IS NULL;
