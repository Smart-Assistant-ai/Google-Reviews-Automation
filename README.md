# ReplyPilot: Google Reviews Automation

Connect a business's Google Business Profile, see every review in one inbox, let AI draft replies in your brand voice, then edit and post. It's built for small businesses of any kind.

> "ReplyPilot" is a placeholder name.

- [How the code is built](docs/architecture.md)
- [Deploying to production](docs/deploy.md)
- [Product design](docs/superpowers/specs/2026-10-30-google-reviews-automation-design.md)

## What it handles

- One Google account with many locations, several account groups, or 100+ locations
- Several Google accounts in one workspace
- Team members with roles, limited to chosen locations
- One person in several workspaces
- Email and password or Google sign-in, with verification, password reset, and sessions that can be ended

## Setup

You need Node 22+, pnpm 10, and a Postgres server you can connect to with a username and password. Docker isn't used.

Create two empty databases, one for development and one for tests. Their names must differ from anything real, and the test database's name must end in `_test`, because the tests wipe every table.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.test.example apps/api/.env.test
```

Fill in `apps/api/.env`, including `DATABASE_URL`. Generate `JWT_SECRET` and `ENCRYPTION_KEY` with `openssl rand -hex 32`. The app refuses to start if either is missing or still a placeholder. Then put the test database's address in `apps/api/.env.test`.

```bash
pnpm db:generate
pnpm db:deploy
pnpm seed
pnpm dev
```

Open http://localhost:5173. `pnpm seed` prints a demo login with a fake multi-location business. In development, emails print to the API logs instead of being sent, so that's where to find verification links.

If ports 4000 or 5173 are taken, set `PORT` and `APP_URL` in `apps/api/.env`, then start the web app with `WEB_PORT` and `API_TARGET`.

## Modes

| Setting                  | Values                  | Effect                                                                                                                                                                              |
| ------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GBP_PROVIDER`           | `mock` / `live`         | `mock` is a fake Google Business Profile, shaped like the real API, so everything works before Google approves access. Its sign-in screen lets you choose what the account manages. |
| `GOOGLE_SIGNIN_PROVIDER` | `off` / `mock` / `live` | Whether "Continue with Google" is offered, and with which Google.                                                                                                                   |
| `GOOGLE_POSTING_ENABLED` | `true` / `false`        | Only production posts real replies by default. Also works as an emergency stop.                                                                                                     |
| `SIGNUP_MODE`            | `allowlist` / `open`    | `allowlist` only lets in emails added with `pnpm allow-signup`.                                                                                                                     |
| `EMAIL_PROVIDER`         | `mock` / `resend`       | `mock` prints emails to the logs.                                                                                                                                                   |
| `OPENAI_API_KEY`         | key or empty            | Empty uses the built-in offline drafter.                                                                                                                                            |

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs all four on every push.
