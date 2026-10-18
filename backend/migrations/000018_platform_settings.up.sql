-- Runtime switches an admin can flip without a deploy. value is a JSON scalar or object.
CREATE TABLE platform_settings (
    key        text        PRIMARY KEY,
    value      jsonb       NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid        REFERENCES users (id)
);

CREATE INDEX platform_settings_updated_by_idx ON platform_settings (updated_by);

-- EXTERNAL_ONLY keeps the historical rule: verified members publish immediately.
INSERT INTO platform_settings (key, value) VALUES ('premoderation', '"EXTERNAL_ONLY"');
