# Public hosting: decisions and plan

Status: **decided, not implemented** · Owner: jvanlier

This file records the decisions for hosting the app publicly (e.g. a post in the
Frosthaven subreddit), so that a future session can implement them without
re-discussing. When implemented, fold the result into [`spec.md`](spec.md) (see §5) and
mark this file as done.

Out of scope here: whether the card images may be hosted publicly (copyright,
Cephalofair fan-content policy). That's a separate investigation and doesn't block
the technical design.

## 1. Goals and constraints

- Strangers can use the app. Each user's builds are private to them.
- The same builds are available on multiple devices, without users handling JSON files.
- Login is **optional**. Without an account the app is fully functional; data persists
  in the same browser via a cookie.
- Operating cost close to €0; unknown number of users (5 to thousands).
- Minimal maintenance: a side project. No servers to patch, no backups to run by hand.

## 2. Decisions

| #   | Decision                                                                                                                                                                                                            | Rejected alternatives and why                                                                                                                                                                                      |
|-----|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| D1  | **Cloudflare Workers** hosts the Hono API and the static frontend (Workers static assets).                                                                                                                          | Pi at home (public exposure of home network, uptime). Fly.io/VPS (cost, patching). Supabase free tier (pauses after ~1 week of inactivity). Firebase-only (validation would move into security rules, losing zod). |
| D2  | **Cloudflare D1** stores the data.                                                                                                                                                                                  | Workers KV: eventually consistent, breaks the revision check.                                                                                                                                                      |
| D3  | **Drop the Pi/Docker deployment.** Workers is the only target. Remove the Node file store, Dockerfile, docker-compose and the container smoke test.                                                                 | Keeping both: doubles testing and maintenance.                                                                                                                                                                     |
| D4  | **Clerk** for login, with **Google and Discord** as the only sign-in methods. No passwords.                                                                                                                         | Cloudflare Access (free only up to 50 users, built for company logins). Firebase Auth (no built-in Discord). Building login ourselves.                                                                             |
| D5  | Login is **optional**. Anonymous users are stored **on the server**, via the same storage path as signed-in users.                                                                                                  | Anonymous data in localStorage/IndexedDB: two storage paths, upload step at sign-in, Safari may evict storage after ~7 days without a visit.                                                                       |
| D6  | **Own internal user ID**, plus an `identities` table `(provider, subject) → user_id`. Data is never keyed on the Clerk ID.                                                                                          | Keying on the Clerk ID: leaving Clerk would mean rewriting keys.                                                                                                                                                   |
| D7  | **One JSON document per user**: the existing `AppData` shape, zod schema, revision check and 1 MiB limit, unchanged.                                                                                                | One row per build: API and client changes for no user-visible gain.                                                                                                                                                |
| D8  | Anonymous record is created on **first save**, not first visit.                                                                                                                                                     | Creating on first visit: every Reddit drive-by creates a row.                                                                                                                                                      |
| D9  | **Anonymous data expires after 90 days without use** (sliding: every request renews it and the cookie).                                                                                                             | 30 days: too short for breaks between campaign sessions.                                                                                                                                                           |
| D10 | **Signed-in accounts expire after 2 years without use.**                                                                                                                                                            | Never deleting: conflicts with the GDPR principle of not keeping data longer than needed.                                                                                                                          |
| D11 | Expiry is communicated **in the app only**: the anonymous banner, the sign-in screen and a short privacy page. No email is stored or sent.                                                                          | Storing emails to send warnings: personal data, email service, extra job. Anyone who'd act on a warning would come back anyway, which resets the clock.                                                            |
| D12 | **Signing in with anonymous data merges automatically** into the account: union of builds by `id`; if the same `id` exists on both sides, the higher `updatedAt` wins. The anonymous record and cookie are removed. | Asking the user which set to keep. Discarding anonymous data.                                                                                                                                                      |
| D13 | **"Delete my account"** removes the D1 data, the identity rows and the Clerk user (via the Clerk Backend API), in one action. Available to anonymous users too (minus the Clerk part).                              | Deleting only D1 data: leftover Clerk users count toward quota and hold personal data.                                                                                                                             |
| D14 | **Signing out** leaves the account untouched on the server; the device continues as a new, empty anonymous user.                                                                                                    | —                                                                                                                                                                                                                  |
| D15 | **Custom domain**, bought by the owner and managed in Cloudflare. Clerk production instances need a domain you own.                                                                                                 | `*.workers.dev`: only usable with a Clerk development instance (banner, limits).                                                                                                                                   |
| D16 | **Abuse limits:** per-IP rate limiting on creating anonymous users and on writes (Workers Rate Limiting binding). The existing 1 MiB document cap and schema validation stay.                                       | —                                                                                                                                                                                                                  |
| D17 | **Recovery and cost guards:** D1 Time Travel (point-in-time restore) replaces the rotating file backups. Set a Cloudflare usage/billing alert.                                                                      | Scheduled exports to R2: extra job, not needed at this scale.                                                                                                                                                      |
| D18 | **Deployment:** GitHub Actions deploys to Workers on every push to `main`, after the existing checks pass. Development uses a Clerk development instance and a separate preview D1 database.                        | —                                                                                                                                                                                                                  |
| D19 | **Owner's current data** (on the Pi) is moved with the existing JSON export/import (F19): export on the Pi, sign in on the new site, import.                                                                        | A one-off migration script: unnecessary, import already exists.                                                                                                                                                    |

**Not doing:** sharing builds between users, emails of any kind, an admin dashboard,
offline editing (unchanged from spec), any self-hosted mode.

## 3. Design

### 3.1 Identity

Every request resolves to **at most one** internal `user_id`, in this order:

1. **Clerk login token** in `Authorization: Bearer <token>` (the client gets it with
   Clerk's `getToken()`). Verified with Hono's built-in `hono/jwk` middleware against
   Clerk's JWKS URL. Also check the `azp` claim against the site's own origin, as Clerk
   recommends. Lookup `identities(provider='clerk', subject=<Clerk user id>)`; on first
   sign-in, create the user and identity row.
2. **Anonymous cookie**, e.g. `fdb_anon`: a random 256-bit token,
   `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=90 days`. Store only its SHA-256:
   `identities(provider='anonymous', subject=sha256(token))`. A leaked database then
   can't be used to impersonate anonymous users.
3. **Neither:** no user yet. `GET /api/data` returns the empty document (revision 0)
   without creating anything. The first `PUT` creates the anonymous user and sets the
   cookie (D8).

If a valid token is present, any anonymous cookie is ignored for data access (it only
matters for the merge, §3.3).

**CSRF:** cookie-authenticated writes rely on: no CORS headers at all (so cross-site
`fetch` with JSON can't pass the preflight), `SameSite=Lax`, and requiring
`Content-Type: application/json` on writes.

### 3.2 D1 schema

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,               -- internal uuid
  kind          TEXT NOT NULL CHECK (kind IN ('anonymous', 'account')),
  document      TEXT NOT NULL,                  -- AppData JSON, without the revision
  revision      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);
CREATE INDEX users_expiry ON users (kind, last_seen_at);

CREATE TABLE identities (
  provider  TEXT NOT NULL,                      -- 'clerk' | 'anonymous' (later: another provider)
  subject   TEXT NOT NULL,                      -- Clerk user id, or sha256(anonymous token)
  user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);
```

- **Save with revision check** (replaces the file store's queue, temp file and rename):
  `UPDATE users SET document = ?, revision = revision + 1, last_seen_at = ? WHERE id = ? AND revision = ?`.
  Zero rows changed → read the current revision → `409 { revision }`. A single
  statement is atomic in D1, so the in-process serialization and the "uncertain
  acknowledgement" handling (`agent-contracts.md` §4) are no longer needed.
- **`last_seen_at`** is updated on writes, and on reads only if it's older than a day,
  to stay well inside D1's free write quota.
- **Schema upgrades** (`schemaVersion`) keep working as now: upgrade on read.

### 3.3 API

Existing contract stays as in `spec.md` §6, now per user:

| Route                     | Behavior                                                                                                                                                                                                                   |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET /api/data`           | `200 AppData` for the current user; empty document (revision 0) if there is none.                                                                                                                                          |
| `PUT /api/data`           | `{ baseRevision, data }` → `200 { revision }` or `409 { revision }`. Creates the anonymous user if there's no identity (rate limited).                                                                                     |
| `POST /api/account/claim` | Requires a login token. If an anonymous cookie is present: merge per D12 in one D1 batch, bump the account's revision, delete the anonymous user, clear the cookie. Idempotent; no cookie → no-op. Returns `{ revision }`. |
| `DELETE /api/account`     | Deletes the current user (D13). For accounts, also calls Clerk's Backend API to delete the Clerk user (needs `CLERK_SECRET_KEY`). Clears the anonymous cookie.                                                             |
| `GET /api/me`             | `{ kind: 'none' \| 'anonymous' \| 'account', expiresAt }` for the banner and privacy texts.                                                                                                                                |
| `GET /api/health`         | `200`.                                                                                                                                                                                                                     |

The client calls `claim` right after a successful sign-in, then reloads its data. Other
devices of that account still holding an old revision get the normal 409 flow.

### 3.4 Expiry job

A Workers Cron Trigger (`scheduled()` handler), daily:

```sql
DELETE FROM users WHERE kind = 'anonymous' AND last_seen_at < datetime('now', '-90 days');
DELETE FROM users WHERE kind = 'account'   AND last_seen_at < datetime('now', '-2 years');
```

Identity rows go with `ON DELETE CASCADE` (D1 enforces foreign keys). Expired accounts
also need their Clerk user deleted: do it in the same job via the Clerk Backend API
before deleting the row, or accept leftover Clerk users and clean up with a Clerk
dashboard export. Prefer the former; decide when implementing.

### 3.5 Client

- **Clerk React SDK** for the sign-in button/modal and `getToken()`. Every API call
  adds the token when signed in; otherwise it relies on the cookie.
- **Anonymous banner** (persistent while anonymous with saved data, not dismissible
  forever): "Your builds are saved in this browser only. If you clear cookies or switch
  devices they're gone, with no way to recover them. Builds unused for 90 days are
  deleted. Sign in to keep them and use them on other devices."
- **Sign-in screen / account menu:** states the 2-year inactivity deletion, links to the
  privacy page, has "Delete my account".
- **Privacy page** (e.g. under `/about`): what is stored (builds, an internal ID, the
  Clerk user ID; for anonymous users a hashed cookie token), the 90-day and 2-year
  rules, the strictly necessary cookie, that Clerk handles login, how to delete.
  No consent banner: the cookie is strictly necessary for the requested function.
- Last-position memory in `localStorage` (F18) stays as is; it's per device anyway.
- The UUID fallback for plain HTTP can go (always HTTPS now), but it's harmless to keep.

### 3.6 Configuration and secrets

- `wrangler.toml` (or `wrangler.jsonc`): D1 binding, static assets directory
  (`dist/client`, SPA fallback), rate-limit bindings, cron schedule, custom domain route.
- Worker vars/secrets: `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` (client),
  `CLERK_SECRET_KEY` (secret), `CLERK_JWKS_URL`, allowed origin for `azp`.
- GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- New dependencies (justified, not a few lines): `wrangler` (dev), `@clerk/clerk-react`
  (client). Server-side token check uses Hono's built-in `hono/jwk` and `fetch` to
  the Clerk Backend API, so no `@clerk/backend` needed. `@hono/node-server` goes away.

## 4. Implementation order

Each step leaves the app working. Test-first, as in [`spec.md`](spec.md) §7.

1. **Run on Workers, single document.** Wrangler config, Worker entry exporting the
   Hono app, static assets, D1 store behind the existing `DataStore` interface (still
   one global document). Local dev with `wrangler dev` and local D1. Tests: keep the
   Hono API tests against an in-memory `DataStore`; test the D1 store with Miniflare
   (e.g. `@cloudflare/vitest-pool-workers`), decide when implementing.
2. **Per-user storage and anonymous identity.** D1 schema (§3.2), identity middleware
   (cookie path only), `DataStore` methods take a `userId`, first `PUT` creates the
   anonymous user. `GET /api/me`.
3. **Clerk login.** Clerk instance (dev first), client SDK, token verification
   middleware, first-sign-in user creation, `POST /api/account/claim` with merge.
4. **Deletion and expiry.** `DELETE /api/account`, cron job, Clerk user deletion.
5. **Banner, privacy page, account menu texts** (§3.5).
6. **Abuse and cost guards.** Rate-limit bindings, Cloudflare usage alert, enable/verify
   D1 Time Travel.
7. **Remove the Pi path.** Delete Node server entry, file store and its tests,
   Dockerfile, docker-compose, `.dockerignore`, `test:container` and
   `scripts/container-smoke.sh`, related CI steps.
8. **Deploy pipeline and domain.** GitHub Actions deploy on `main`, custom domain,
   Clerk production instance, Google and Discord OAuth apps in their consoles.
9. **Move own data** (D19) and update docs (§5).

## 5. Docs to update when implementing

- `spec.md` §1 Purpose: public, multi-user, optional login.
- `spec.md` §4.11 Backup: export/import stays; mention D1 Time Travel for operator restores.
- `spec.md` §6: per-user documents, identity, new routes, D1 instead of files; remove the
  disk persistence and backup rotation bullets.
- `spec.md` §7: Workers instead of Node/Docker, repo layout, deployment.
- `spec.md` §8: drop scenario 11 (backup rotation); add scenarios for anonymous use,
  sign-in merge, deletion and expiry.
- `spec.md` §9: remove "Authentication / multi-user / TLS" from out of scope.
- `agent-contracts.md` §4 (storage transactions) and §5 (arm64 container verification):
  replace or remove.
- `README.md`: new deployment and local dev instructions.

## 6. Verify at implementation time

Facts from the planning session that may have changed:

- Cloudflare free tier limits for Workers requests, D1 storage/reads/writes, Cron
  Triggers and the Rate Limiting binding.
- Clerk free plan (at planning time: 50,000 monthly retained users), whether production
  needs a custom domain, the `azp` recommendation, the user export (dashboard
  **Settings → User exports**, or the `GetUserList` Backend API) and that it includes
  linked Google/Discord account IDs (needed for §7).
- D1 Time Travel retention on the free plan.
- Safari's cookie lifetime limits for server-set first-party `HttpOnly` cookies: test on
  an iPhone early.

## 7. Moving away from Clerk later

Because of D6 and D4 (social login only, no passwords), switching providers is a data
migration, not a rewrite:

1. Export users from Clerk (CSV or `GetUserList`), including each user's linked Google
   and Discord account IDs (the Backend API exposes these as external accounts; check
   the CSV has them too).
2. Configure the new provider with the same Google/Discord apps.
3. For each user, add `identities(provider='<new>', subject=<new id>)` rows, matched on
   the Google or Discord account ID. Alternatively, match lazily on first sign-in with
   the new provider.
4. Remove the `clerk` identity rows once everyone has moved.
