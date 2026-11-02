# ReplyPilot — Google Reviews Automation (POC)

Connect a hotel's Google Business Profile, see every review in one inbox, let AI draft replies in your brand voice, then edit and post.

> "ReplyPilot" is a placeholder name. Product design: [docs/superpowers/specs/2026-10-30-google-reviews-automation-design.md](docs/superpowers/specs/2026-10-30-google-reviews-automation-design.md)

## Layout
- `backend/` — Node (Fastify) + Sequelize + Postgres. Background jobs run in-process for the POC.
- `frontend/` — Vite + React + MUI.

## Setup
Requirements: Node 20+, a Postgres database.

```bash
# backend
cd backend
cp .env.example .env          # fill DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD, JWT_SECRET, AES_SECRET_KEY
npm install
npm run migrate
npm run seed -- --connected   # demo account with a connected (mock) Google profile + AI drafts
npm run dev                   # http://localhost:4000

# frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Demo login: `demo@replypilot.app` / `demo1234`. Running `npm run seed` without `--connected` creates the account but leaves onboarding for you to click through live.

## Modes
| Env | Values | Effect |
|---|---|---|
| `GBP_PROVIDER` | `mock` (default) / `live` | `mock` = a fake Google Business Profile shaped like the real v4 API (with simulated moderation), so everything works before Google approves our API access. `live` = real Google calls (needs `GOOGLE_CLIENT_ID/SECRET` and approved API quota). |
| `OPENAI_API_KEY` | key or empty | Empty = built-in offline drafter. Set it for real AI drafts. |
| `MOCK_MODERATION_SECONDS` | number | How long the fake Google takes to approve/reject a posted reply. |

## Demo script (~5 min)
1. **Sign up** as a new hotel → **Connect Google** (demo consent screen) → you land in the inbox with the reviews of one hotel.
2. **Inbox**: every recent review already has an AI draft in English or Spanish, matching the reviewer. Open a 2★ review → **Rewrite → More apologetic** → edit → **Post reply** → status goes *Google reviewing* → *Live*.
3. **Google moderation**: post a reply containing "20% discount" → Google **rejects** it as promotional content; edit and re-post.
4. **New reviews**: **Simulate review** drops in a new review, and a draft appears a moment later.
5. **Dashboard**: rating trend, weekly volume by sentiment, what guests praise vs. complain about.
6. **Settings**: reply voice, Google connection and activity log.

## V1 scope
One user, one Business Profile, and a person approves every reply. Auto-replies and multiple locations are planned for V2. Their tables and columns stay in the database, unused. Auto-reply code can be restored from commit `351b474`.

## Tests
```bash
cd backend && npm test
```
