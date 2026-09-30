# Organization rules

Authentication is open to users of any configured login provider. Organization rules add memberships and benefits after authentication; they never restrict general login or grant staff roles. Google/Microsoft account linking remains separate work.

`ORGANIZATION_RULES_FILE` selects a versioned JSON file. The default is `config/organizations.json`, containing no organizations. Compose mounts `backend/config` at `/app/config` read-only. Set `ORGANIZATION_RULES_FILE=/app/config/organizations.json` in Docker; use `config/organizations.json` when running Go directly.

To enable the NaUKMA policy, copy `config/organizations.example.json` to `config/organizations.json` and replace the all-zero tenant UUID with the actual Microsoft Entra tenant ID. The example requires both that tenant and a verified `ukma.edu.ua` email from the same Microsoft identity. A Google identity with that domain does not qualify. The example's name, badge, domain, tenant, capabilities, and numeric benefits are configuration data; runtime Go code contains no university identifiers.

Add another entry to `organizations` to support another university, company, or community. IDs must be unique lowercase identifiers. Names and badges are display text. Changing a rule requires an API restart (`docker compose restart api`); changing the environment requires `docker compose up -d`. Invalid rules stop startup before database migrations run. Files must contain one JSON document, have version 1, and be at most 1 MiB. Unknown fields, invalid operators, duplicate organization IDs/capabilities, and invalid benefit ranges are rejected.

## Conditions

Each condition contains exactly one operator. `all` and `any` hold nonempty arrays of conditions, nested up to eight levels. Leaf operators are:

| Operator | Meaning |
| --- | --- |
| `provider` | Exact `google` or `entra` |
| `issuer` | Exact validated HTTPS issuer |
| `tenantId` | Lowercase UUID; requires Microsoft and its matching validated tenant issuer |
| `verifiedEmailDomain` | Exact domain of a verified email; case-insensitive, with no wildcard or implicit subdomain matching |

All conditions for one organization must match one identity. Evidence is never assembled across different identities. Matching organizations each produce one membership, even if several identities match. The evaluator consumes provider-validated identities, never client-supplied claims or an editable profile email.

## Memberships and benefits

`GET /api/me` includes `memberships`, an array (empty for unaffiliated users). Each membership contains `organizationId`, `name`, `badge`, `capabilities`, and `benefits`. No tenant IDs, subjects, or provider tokens are exposed. Existing profile fields and staff roles are preserved.

Capabilities belong to their organization. `user.Can(organizationID, capability)` checks that scope. `ideas.read_internal` and `ideas.create_internal` are the read/create gates for `ORGANIZATION_ONLY` visibility. Having access in one organization grants no access in another. `MEMBERS_ONLY` separately means any authenticated user.

Benefits contain `voteWeight` (integer), `rankingMultiplier`, `karmaMultiplier`, and `skipPremoderation`. Weight/multiplier fields default to 1 when omitted or zero; accepted nonzero values range from 1 through 100. Premoderation bypass defaults to false. Values are returned per organization; they are not summed across memberships. The example preserves the former NaUKMA values: 2, 1.5, 1.5, and true.

Ideas, engagement, and moderation services are still scaffolds. The generic visibility gates are implemented and tested, but no live idea endpoint, voting calculation, or moderation workflow consumes these benefits yet. Those services must enforce permissions server-side and select the relevant organization; frontend display is not authorization. Missing read access to an internal idea should produce 404 without revealing the idea. Vote weight should be stored when a vote is cast rather than recalculated for historical votes.

## Refresh and migration

Provider evidence is stored per external identity and refreshed on login. Memberships are evaluated from that evidence on every current-user lookup, rather than persisted as permanent grants. After a policy change and API restart, existing sessions immediately use the new rules. Provider-side changes become known at the next login; there is no background provider revalidation. Session lifetime remains 24 hours.

Migration `000009` adds the identity's email separately from editable profile data. Historical identities start with empty evidence email and must log in again to qualify for email-based rules. This deliberately avoids treating old profile email as verified evidence.

Migration `000010` adds `ideas.organization_id` and organization-specific visibility. It maps historical `MEMBERS_ONLY` rows produced from `UKMA_ONLY` by migration `000008` to organization `naukma`, preserving their original scope. This is a legacy data mapping, not a runtime default. Keep that ID for the corresponding configuration entry. The down migration refuses to discard other organizations' restricted rows; rolling back to version 8/9 restores the older, broader `MEMBERS_ONLY` representation.
