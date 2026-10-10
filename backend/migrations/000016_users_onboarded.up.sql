-- A user is onboarded once they have confirmed their own name and handle after the first login.
-- Accounts that already carry a readable handle count as onboarded; the generated u_<uuid>
-- placeholder does not, so its owner is asked to pick a handle on the next visit.

ALTER TABLE users ADD COLUMN onboarded_at timestamptz;
UPDATE users SET onboarded_at = updated_at WHERE handle !~ '^u_[0-9a-f]{32}$';
