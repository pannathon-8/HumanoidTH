# Admin security fix evidence

## Changes

- Admin login now fails closed unless `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASSWORD`, and `ADMIN_SESSION_SECRET` are configured. No fallback credentials remain in application code.
- Successful configured login issues an eight-hour, HMAC-signed, HttpOnly admin session cookie. Middleware rejects unsigned or invalid cookies for admin pages, data-pull pages, ingest APIs, and exports.
- Every privileged Server Action checks the signed session and confirms that its database user still has the `ADMIN` role before writing or starting ingestion.
- Public profile registration accepts only `USER` or `RESEARCHER`, never updates an existing user's role, and no longer presents an Administrator option or simulator.
- Ordinary queued submissions remain available to signed-in profile sessions; they cannot approve submissions or edit CMS records.
- Gemini map analysis now requires the same signed admin session and a current database `ADMIN` role. Anonymous map reads return only the versioned public-safe cache (or an empty result) and do not trigger Gemini. Provider input omits contributor names, inventory custodians and notes; the prior cache key is not served.

## Regression evidence

- `test/admin-auth.test.ts`: 4 tests pass. Covers public `ADMIN` role input, missing admin configuration, forged session values, non-admin or wrong-account rejection, and successful configured login/session authorization.
- `test/contribution-map.test.ts`: 6 tests pass. Covers cache-miss behavior without analysis and provider metadata projection alongside the existing cache/failure behavior tests.
- TypeScript check: `tsc --noEmit` passes.

## Remaining limits

- Ordinary profile identity still relies on the existing unsigned `user_email` cookie. This cannot authorize admin actions, but it can impersonate a non-admin profile and affect submission attribution; fixing that fully requires an ordinary-user authentication flow.
- Other added API write surfaces should be reviewed before exposing backend endpoints publicly.
- The deployment must set all three admin environment variables; otherwise administrator login and protected paths stay unavailable by design.
