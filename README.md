# ReplyPilot — Google Reviews Automation (POC)

Connect a Google Business Profile, see every review in one inbox, let AI draft replies in your brand voice, edit and post — with owner-controlled auto-reply rules.

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
1. **Sign up** as a new business → **Connect Google** (demo consent screen) → **pick a location** → set **reply voice** → see **auto-reply rules** (all off by default; 1–3★ locked to manual).
2. **Inbox**: every review already has an AI draft in your voice (English, Hindi, Marathi, Spanish). Open a 2★ review → **Rewrite → More apologetic** → edit → **Post reply** → status goes *Google reviewing* → *Live*.
3. **Google moderation**: post a reply containing "20% discount" → Google **rejects** it as promotional content; edit and re-post.
4. **Auto-replies**: Settings → Auto-replies → enable "5★ rating only" (consent checkbox) → Inbox → **Simulate review → 5★ rating only** → it auto-posts. **Simulate → 1★ complaint** → stays a draft for a human.
5. **Dashboard**: rating trend, weekly volume by sentiment, what customers praise vs. complain about.

## Tests
```bash
cd backend && npm test
```
