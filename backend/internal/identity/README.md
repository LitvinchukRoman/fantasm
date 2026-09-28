# Identity

Identity owns external identities, user affiliation, login attempts, and browser sessions. Its public operations are `BeginLogin`, `CompleteLogin`, `CurrentUser`, and `Logout`.

## Boundaries

`domain` holds data and affiliation rules using only the standard library. `service.go` defines the interfaces it consumes and coordinates authentication and transactions. The Postgres adapter owns SQL; the OIDC adapter validates provider tokens; the HTTP adapter owns cookies and response DTOs. `cmd/api` assembles concrete dependencies.

Provider authentication finishes before the user/session transaction starts. Creating or updating a user, revoking the previous browser session, and creating the replacement session commit together. A transaction-scoped advisory lock serializes concurrent logins for the same issuer and subject. Database uniqueness remains the final constraint.

External identity is keyed by issuer and subject. Matching email addresses never link accounts; separate identities can have the same email. Account linking requires a future explicit workflow. New users receive a generated handle and the `USER` role. Subsequent logins refresh email and affiliation while preserving profile edits and staff roles. Session resolution reads current affiliation and role from the user row.

## Provider configuration

Set `PUBLIC_URL` to the browser-facing origin, such as `http://localhost:8080` or `https://fantasm.example`. HTTPS is required except on loopback. For a local frontend proxy, use its origin and forward `/api` to Go. This implementation uses one browser-facing origin and does not enable cross-origin credentialed requests.

Google requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `${PUBLIC_URL}/api/auth/google/callback` as its web callback URL.

Entra requires `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, and `UKMA_TENANT_ID`, the actual university tenant UUID. Register `${PUBLIC_URL}/api/auth/entra/callback` as a web callback URL. Discovery uses the tenant-specific v2 endpoint. Configure the `verified_primary_email` optional ID-token claim in the Entra app registration. The authorization request also asks for it.

Both client fields being empty disables that provider; incomplete configuration fails startup. Configured providers must be reachable for discovery at startup.

The OIDC adapter checks signature, issuer, audience, expiry, nonce, authorized party, and the access-token hash when supplied. Authorization-code exchange uses PKCE S256. Microsoft `email` alone is not evidence of ownership; `verified_primary_email` supplies the verified address. Missing verification evidence allows an external login but never grants the campus badge. Google email verification never grants UKMA affiliation. The domain additionally requires the configured university issuer, tenant, and exact `ukma.edu.ua` email domain.

References: [Microsoft optional claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## HTTP contract

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/auth/google/login` | Sets login cookie and redirects to Google |
| GET | `/api/auth/entra/login` | Sets login cookie and redirects to Entra |
| GET | `/api/auth/{provider}/callback` | Consumes login attempt, sets session cookie, redirects to `/` |
| GET | `/api/me` | Current user JSON, or 401 |
| POST | `/api/auth/logout` | Revokes session, clears cookies, returns 204 |

`POST /api/auth/logout` requires an `Origin` header equal to `PUBLIC_URL`. Logout is idempotent. Disabled or unknown providers return 404. Invalid, expired, or replayed authentication returns 401. Internal errors return a generic 500 response and are logged server-side.

`/api/me` returns `id`, `handle`, `name`, `email`, `avatarUrl`, `bio`, `faculty`, `affiliation`, `role`, and `createdAt`. It is private, not a public profile endpoint. Tokens are never included in JSON. Identity responses use `Cache-Control: no-store`.

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

Unit tests cover affiliation evidence, replay and browser binding, session rotation and expiry, transaction rollback, account separation, cookies, and request origins. OIDC tests use signed tokens and local token/JWKS endpoints to exercise real validation, including invalid signatures, issuers, audiences, and nonces.

Postgres tests require `IDENTITY_TEST_DATABASE_URL`. They create isolated schemas, apply all migrations, and verify concurrent identity creation, atomic callback consumption, transaction rollback, session privileges and expiry, and the HTTP login/logout lifecycle. They use a fake external provider; live provider registration and real university claims still need verification with deployment credentials.
