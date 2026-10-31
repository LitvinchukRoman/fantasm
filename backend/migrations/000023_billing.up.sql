-- Paid plans for authors and monthly sponsorships of ideas. Payments are mocked:
-- no card data is ever stored, every charge succeeds and is written to billing_payments.

-- One row per user who ever chose a paid plan. No row means the free plan.
-- CANCELED keeps the plan until current_period_end and then stops renewing.
CREATE TABLE plan_subscriptions (
    user_id              uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    plan                 text        NOT NULL CHECK (plan IN ('PLUS', 'PRO')),
    status               text        NOT NULL CHECK (status IN ('ACTIVE', 'CANCELED')),
    current_period_start timestamptz NOT NULL,
    current_period_end   timestamptz NOT NULL,
    canceled_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plan_subscriptions_period CHECK (current_period_end > current_period_start)
);

CREATE INDEX plan_subscriptions_renewal_idx ON plan_subscriptions (current_period_end) WHERE status = 'ACTIVE';

-- One row per sponsor and idea. Changing the tier or coming back after a cancel reuses the row.
CREATE TABLE idea_sponsorships (
    id                   uuid        PRIMARY KEY,
    idea_id              uuid        NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
    sponsor_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tier                 text        NOT NULL CHECK (tier IN ('SUPPORTER', 'BACKER', 'PATRON')),
    status               text        NOT NULL CHECK (status IN ('ACTIVE', 'CANCELED')),
    current_period_start timestamptz NOT NULL,
    current_period_end   timestamptz NOT NULL,
    canceled_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT idea_sponsorships_idea_sponsor_key UNIQUE (idea_id, sponsor_id),
    CONSTRAINT idea_sponsorships_period CHECK (current_period_end > current_period_start)
);

CREATE INDEX idea_sponsorships_sponsor_idx ON idea_sponsorships (sponsor_id, created_at DESC);
CREATE INDEX idea_sponsorships_renewal_idx ON idea_sponsorships (current_period_end) WHERE status = 'ACTIVE';

-- The ledger of mock charges. A refund flips the status; the row stays.
CREATE TABLE billing_payments (
    id             uuid        PRIMARY KEY,
    user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind           text        NOT NULL CHECK (kind IN ('PLAN', 'SPONSORSHIP')),
    plan           text        CHECK (plan IN ('PLUS', 'PRO')),
    sponsorship_id uuid        REFERENCES idea_sponsorships (id) ON DELETE SET NULL,
    amount_minor   integer     NOT NULL CHECK (amount_minor >= 0),
    currency       text        NOT NULL DEFAULT 'UAH' CHECK (currency = 'UAH'),
    provider       text        NOT NULL DEFAULT 'mock' CHECK (provider = 'mock'),
    status         text        NOT NULL DEFAULT 'SUCCEEDED' CHECK (status IN ('SUCCEEDED', 'REFUNDED')),
    description    text        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
    created_at     timestamptz NOT NULL DEFAULT now(),
    refunded_at    timestamptz,
    CONSTRAINT billing_payments_kind_subject CHECK ((kind = 'PLAN') = (plan IS NOT NULL))
);

CREATE INDEX billing_payments_user_idx ON billing_payments (user_id, created_at DESC);
CREATE INDEX billing_payments_sponsorship_idx ON billing_payments (sponsorship_id);

-- What the support bot did, keyed by the bot's own action id: a retried call is answered
-- without being applied twice, and staff can see every change the bot made.
CREATE TABLE billing_support_actions (
    id         text        PRIMARY KEY CHECK (char_length(id) BETWEEN 8 AND 100),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    action     text        NOT NULL CHECK (action IN ('CANCEL_PLAN', 'RESUME_PLAN', 'EXTEND_PLAN', 'CANCEL_SPONSORSHIP', 'REFUND_PAYMENT')),
    subject    text        NOT NULL DEFAULT '',
    params     jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_support_actions_user_idx ON billing_support_actions (user_id, created_at DESC);
