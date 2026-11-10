# How the code is built

## Layout

```text
apps/api/src/
  config/           environment check at boot
  lib/              small helpers: crypto, signed state, audit log, errors
  plugins/          request pipeline: security, access rules, errors, health
  jobs/runner.ts    background job runner
  modules/
    auth/           signup, login, sessions, Google sign-in       (foundation)
    workspaces/     workspaces, team, invitations, location access (foundation)
    google/         Google connections, locations, sync            (product)
    reviews/        inbox, replies, drafts, voice, stats, purge    (product)
  providers/
    email/          mock and Resend                                (foundation)
    google-identity/ mock and live sign-in                         (foundation)
    gbp/            mock and live Business Profile                 (product)
  server.ts         starts the app and jobs, stops them cleanly
apps/web/src/       React, MUI and TanStack Query
packages/shared/    Zod schemas used by both sides, so they can't disagree
deploy/             server setup, deploy script, Nginx and PM2 config
```

Foundation code can't import product code. An ESLint rule enforces this. To start a new POC, copy the repo, delete `modules/google`, `modules/reviews` and `providers/gbp`, and the login, team and workspace parts keep working.

## What happens on a request

```text
security headers > CORS > access rule > rate limit > input validation > handler > service > database > output validation > error handler
```

- **Every route must declare who can reach it**, with `config: { access: 'public' | 'authenticated' | 'member' | 'admin' | 'owner' }`. The app won't start if one is missing, so a forgotten rule can't become a public route.
- **The session and membership are read on every request**, so logout, suspension, removal and role changes apply straight away.
- **Someone outside a workspace gets 404**, not 403, so they can't learn that it exists.
- **Output goes through a schema too**, so a field that isn't declared can't reach the browser.
- **Only `HttpError` messages reach users.** Anything else becomes a generic message and a request ID, with the detail in the logs.

## Rules with one owner

Each of these lives in one place, so it can't drift between features:

| Rule                                   | Where                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| Which locations a person can reach     | `accessibleLocationIds` in `modules/workspaces/access.ts` |
| Role order                             | `hasAtLeast` in `packages/shared/src/permissions.ts`      |
| Whether a connection uses fake data    | `usesFakeData` in `modules/google/connection.service.ts`  |
| Writing audit rows and masking secrets | `lib/audit.ts`                                            |
| Every Google call and token refresh    | `getContext` in `modules/google/connection.service.ts`    |

## Sessions

- A 15-minute access token, held only in memory in the browser.
- A refresh token in an `httpOnly` cookie, stored hashed in `sessions`. Each refresh swaps it. Seeing an old one later means it was copied, so the session ends. Fifteen seconds of grace stops two open tabs from logging someone out.
- Logout, password reset and suspension take effect on the next request.

## Google sign-in and connecting Google are separate

- **Sign-in** proves who someone is (`openid email profile`). People are matched on Google's stable ID, never on email. An existing account is only linked once its email is verified, or a stranger could sign up with someone's address first and keep access.
- **Connecting** gives access to a Business Profile (`business.manage`). A workspace can connect several accounts. Tokens are encrypted with AES-256-GCM. The OAuth callback needs a signed state and a matching cookie, so a link can't be sent to someone else to finish.

## Locations

`available` means seen on Google but not chosen, so it's never synced. `active` is managed. `access_lost` keeps its data, stops syncing, and emails the owner. A location records the one connection that serves it, plus every connection that could, so it moves instead of being deleted when one account is disconnected.

Reviews are unique per location, not globally. Two workspaces connected to the same business each keep their own copy.

## Background jobs

There's no queue, on purpose. `jobs/runner.ts` ticks every 5 seconds and each job works out what's due from Postgres, so a restart loses nothing. A job claims its row in `job_runs` with one atomic statement, so two processes can't run it together, and a crash frees it when its lease ends. `last_error` makes a stopped job visible.

This works while the API runs as one process. Rate limits and Google call limits are counted in memory, so a second process would double them. A second server, or heavy auto-replies, is the point to add Redis and a queue.

## Database rules

- Change `prisma/schema.prisma`, run `pnpm db:migrate` against your own dev database, read the SQL it wrote, and commit both.
- Production only ever runs `prisma migrate deploy`.
- Prisma can't express partial unique indexes, so those are written by hand in the migration. `voice_profiles` has two.
- The tests refuse any database whose name doesn't end in `_test`.

## Testing

Integration tests run the real app against a real Postgres database, because the bugs that matter here are about data and access. `test/integration/route-access.test.ts` walks every route and checks that anonymous visitors, outsiders, members and admins are each refused where they should be. It also pins the exact list of public routes, so adding one gets noticed in review.
