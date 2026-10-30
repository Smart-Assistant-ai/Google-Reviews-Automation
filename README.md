# ReplyPilot — Google Reviews Automation (POC)

Connect a Google Business Profile, see every review in one inbox, let AI draft replies in your brand voice, edit and post — with owner-controlled auto-reply rules.

> Working name "ReplyPilot" is a placeholder. Design doc: [docs/superpowers/specs/2026-10-30-google-reviews-automation-design.md](docs/superpowers/specs/2026-10-30-google-reviews-automation-design.md)

## Layout
- `backend/` — Fastify + Sequelize + Postgres
- `frontend/` — Vite + React + MUI

## Run the demo
```bash
cd backend && cp .env.example .env && npm install && npm run migrate && npm run seed && npm run dev
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Demo login: `demo@replypilot.app` / `demo1234`

### Google mode
`GBP_PROVIDER=mock` (default) uses a fake Google Business Profile shaped like the real v4 API, so everything works before Google approves API access. `GBP_PROVIDER=live` switches to the real API.

### Database
Any Postgres. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `backend/.env` (same convention as node-backend).
