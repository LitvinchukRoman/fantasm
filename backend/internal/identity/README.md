# Identity

Identity owns external identities, login attempts, and browser sessions. Its public operations are `BeginLogin`, `CompleteLogin`, `CurrentUser`, and `Logout`.

## Boundaries

`domain` holds identity data and validation using only the standard library. `service.go` defines the interfaces it consumes and coordinates authentication and transactions. The Postgres adapter owns SQL; the OIDC adapter validates provider tokens; the HTTP adapter owns cookies and response DTOs. `cmd/api` assembles concrete dependencies.

Provider authentication finishes before the user/session transaction starts. Creating or updating a user, revoking the previous browser session, and creating the replacement session commit together. A transaction-scoped advisory lock serializes concurrent logins for the same issuer and subject. Database uniqueness remains the final constraint.

External identity is keyed by issuer and subject. Matching email addresses never link accounts; separate identities can have the same email. Account linking requires a future explicit workflow. New users receive a generated handle and the `USER` role. Subsequent logins refresh email while preserving profile edits and staff roles. Session resolution reads the current profile and role from the user row.

## Provider configuration

Set `PUBLIC_URL` to the browser-facing origin, such as `http://localhost:8080` or `https://fantasm.example`. HTTPS is required except on loopback. For a local frontend proxy, use its origin and forward `/api` to Go. This implementation uses one browser-facing origin and does not enable cross-origin credentialed requests.

Google requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `${PUBLIC_URL}/api/auth/google/callback` as its web callback URL.

Microsoft requires `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET`. Register the application for **accounts in any organizational directory and personal Microsoft accounts** and add `${PUBLIC_URL}/api/auth/entra/callback` as a **Web** redirect URI. Use the client secret value, not its ID. No university tenant or email domain is required. Login uses Microsoft's `common` endpoint. During callback processing, the adapter extracts a tenant UUID only to select Microsoft's tenant-specific discovery document, then validates the signed token against that exact issuer. The unverified tenant hint never authenticates a user.

Both client fields being empty disables that provider; incomplete configuration fails startup. Google discovery requires network access at startup. Microsoft discovery and both providers' token exchanges require network access during login.

The OIDC adapter checks signature, issuer, audience, expiry, nonce, authorized party, and the access-token hash when supplied. Authorization-code exchange uses PKCE S256. Microsoft `email` alone is not treated as verified; an optional `verified_primary_email` claim can supply verified email evidence. Email verification and tenant evidence do not grant staff roles. Optional [organization rules](../organizations/README.md) can grant scoped memberships and benefits. Users may sign in without an email claim.

References: [Microsoft multitenant authentication](https://learn.microsoft.com/en-us/entra/identity-platform/howto-convert-app-to-be-multi-tenant), [Microsoft optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## HTTP contract

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/auth/google/login` | Sets login cookie and redirects to Google |
| GET | `/api/auth/entra/login` | Sets login cookie and redirects to Entra |
| GET | `/api/auth/{provider}/callback` | Consumes login attempt, sets session cookie, redirects to `/` |
| GET | `/api/auth/providers` | Enabled provider IDs for the login UI |
| GET | `/api/me` | Current user JSON, or 401 |
| POST | `/api/auth/logout` | Revokes session, clears cookies, returns 204 |

`POST /api/auth/logout` requires an `Origin` header equal to `PUBLIC_URL`. Logout is idempotent. Disabled or unknown providers return 404. Invalid, expired, or replayed authentication returns 401 for API clients. Browser login/callback requests accepting HTML redirect to `/login?error=authentication_failed` (or `provider_unavailable` for a disabled provider). Error details and provider claims are never placed in that URL. Internal errors return a generic 500 response and are logged server-side.

`/api/me` returns `id`, `handle`, `name`, `email`, `avatarUrl`, `bio`, `faculty`, `role`, `createdAt`, and `memberships`. It is private, not a public profile endpoint. Tokens are never included in JSON. Identity responses use `Cache-Control: no-store`.

## Sessions and login attempts

Session tokens contain 256 random bits, expire after 24 hours, and are stored as SHA-256 hashes. Cookies are HttpOnly, SameSite=Lax, and Secure over HTTPS; secure cookies use the `__Host-` prefix. Expiration is absolute, without silent renewal.

Login attempts expire after 10 minutes. State and the independent browser-binding secret are stored as hashes; nonce and PKCE verifier stay server-side. A matching attempt is deleted atomically before token exchange, preventing callback replay even if exchange fails. A new login attempt replaces the browser's previous login cookie.

Expired rows cannot authenticate. Until a scheduled maintenance mechanism exists, expired rows can be removed with:

```sql
DELETE FROM login_attempts WHERE expires_at <= now();
DELETE FROM sessions WHERE expires_at <= now();
```

## Migration

Migration `000007` removes email uniqueness, adds issuer-based identity keys, hashes existing session identifiers, and creates login attempts. Its down migration revokes sessions because hashes cannot be reversed. Restoring the previous email uniqueness constraint requires resolving any duplicate emails first; restoring the previous identity key also requires no duplicate provider/subject pairs across issuers.

## Tests

Unit tests cover provider identity validation, replay and browser binding, session rotation and expiry, transaction rollback, account separation, cookies, and request origins. OIDC tests use signed tokens and local token/JWKS endpoints to exercise real validation, including invalid signatures, issuers, audiences, and nonces.

Postgres tests require `IDENTITY_TEST_DATABASE_URL`. They create isolated schemas, apply all migrations, and verify concurrent identity creation, atomic callback consumption, transaction rollback, session privileges and expiry, and the HTTP login/logout lifecycle. They use a fake external provider; live provider registration and real account claims still need verification with deployment credentials.

Migrations `000009` and `000010` add per-identity email evidence and organization-specific idea visibility; see [organization rules](../organizations/README.md#refresh-and-migration).

Migration `000008` removes the obsolete affiliation column and converts idea visibility `UKMA_ONLY` to `MEMBERS_ONLY`. Users, external identities, and sessions are preserved. Rolling back restores the affiliation column as `EXTERNAL`; previous campus badges are not recoverable from this migration.

## Local startup and curl checks

From `backend`, copy `.env.example` to `.env` and fill in the credentials for each provider you want to enable. For direct API testing, set `PUBLIC_URL=http://localhost:8080` (the example defaults to the frontend origin, `http://localhost:5173`) and register these exact Web callback URLs:

- Google: `http://localhost:8080/api/auth/google/callback`
- Microsoft: `http://localhost:8080/api/auth/entra/callback`

Then run:

```bash
docker compose up -d --build
docker compose ps
curl -i http://localhost:8080/healthz
curl -i http://localhost:8080/api/me
curl -i http://localhost:8080/api/auth/google/login
curl -i http://localhost:8080/api/auth/entra/login
```

Expect 200 for health, 401 for `/api/me` without a session, and 302 to a configured provider (404 if disabled). Compose starts PostgreSQL and the API and applies migrations automatically. After changing `.env`, run the startup command again to recreate the API with the new environment.

Complete a real login by opening `http://localhost:8080/api/auth/google/login` or `/api/auth/entra/login` in your browser. Start and finish in the same browser so the login-binding cookie is retained. After success, the browser redirects to `/`; the API has no homepage, so a 404 there is expected. Visit `/api/me` to confirm login, then copy the `fantasm_session` cookie value from the browser's developer tools for curl:

```bash
read -r -s SESSION
curl -i --cookie "fantasm_session=$SESSION" http://localhost:8080/api/me
curl -i -X POST --cookie "fantasm_session=$SESSION" \
  -H 'Origin: http://localhost:8080' http://localhost:8080/api/auth/logout
curl -i --cookie "fantasm_session=$SESSION" http://localhost:8080/api/me
unset SESSION
```

Expect 200, 204, then 401. Treat the session cookie as a credential. Curl can check redirects and authenticated API calls, but does not replace interactive Google/Microsoft login. Do not start in curl and continue in a browser without transferring the login-binding cookie.

For the frontend development proxy, set `PUBLIC_URL` to its actual origin (typically `http://localhost:5173`), register callback URLs using that origin, and run `npm run dev` in `frontend`. Initiate login through the frontend origin's `/api/auth/{provider}/login`. The frontend login/register pages are not yet wired to these routes: start login by opening the URL directly. Password-based login is not implemented.

Google and Microsoft identities remain separate even when their email addresses match. Account linking is deferred.
