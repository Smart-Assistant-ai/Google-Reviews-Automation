# Google Reviews Automation: Product & Build Design (v1)

## ▶ TODAY: Demo POC (approved scope)
Goal: a clickable demo today, entirely in **mock mode** (no Google approval needed).
- **Commits:** many small commits authored by the repo's git user (tejasxspatil). **No `Co-Authored-By: Claude` lines and no Claude attribution.** The user explicitly asked for this.
- **In scope:**
  - Monorepo scaffold (backend Fastify + Sequelize + Postgres, frontend Vite + React + MUI) and docker-compose for postgres.
  - Simple email/password auth (JWT).
  - A "Connect Google" step backed by MockGbpProvider: a fake OAuth consent → location picker. Real OAuth is wired behind `GBP_PROVIDER=live` but not required for the demo.
  - Seeded mock reviews in multiple languages with ratings 1–5, and a "Simulate new review" button.
  - Inbox (three panes, filters, status chips).
  - Voice profile settings.
  - AI drafts via OpenAI, with a deterministic template fallback if `OPENAI_API_KEY` is missing.
  - Edit + post to the mock, with simulated Google moderation (PENDING → APPROVED/REJECTED).
  - Auto-reply rules with a consent checkbox and scheduled posts.
  - Dashboard (KPI tiles + charts from the DB).
- **Simplifications for the POC:** an in-process job runner (setInterval) instead of BullMQ/Redis.
- **Deferred past the POC:** Stripe billing, emails, purge job, live Google calls, team/multi-location.
- **Verify:** `docker compose up -d`, migrate + seed, run backend + frontend, and click through the full flow in the browser before calling it demo-ready.

> Status: design for approval. After approval it gets committed to the new repo as
> `docs/superpowers/specs/2026-10-30-google-reviews-automation-design.md`, followed by a step-by-step implementation plan.

## 1. Context: why this exists

aiassistant.co wants a **new, standalone product**. A business connects its Google Business Profile (GBP), and we manage its reviews. We pull every review into one inbox, AI drafts a reply in the business's voice, the owner edits and approves it, and we post it. Owner-defined rules can auto-post some replies. The CEO asked for the product and its UI to be designed fresh. It is **not** a tab inside the current aiassistant.co platform.

- **First customers:** existing aiassistant.co customers. They are mostly single-location businesses with one owner. They sign up separately, because this is a separate product.
- **Repo:** `/Users/tejas/Documents/GitHub/Google-Reviews-Automation` is currently empty (no commits).
- **Reference code:** `AI-Agents-Combined/nodejs/node-backend` (NB) and `AI-Agents-Combined/frontend` (FE). We copy and adapt patterns from them; we do not share code with them.
- **Company GBP:** verified and more than 60 days old, so we're eligible to apply for API access.

## 2. Market reality (research, Oct 2026)

- **Pricing.** Incumbents (Birdeye $299–449/location/mo, Podium $399+/mo) make their money from review *requests* (SMS/email), multi-platform monitoring, widgets and agency plans. AI-reply-only tools sell for $10–44/location/mo. **Google has also been testing its own "Reply with AI" button since March 2026.** AI drafting alone is turning into a commodity.
- **What incumbents get hated for:** lock-in annual contracts, cancellations that aren't honoured, high prices, generic-sounding replies.
- **How we win v1:** replies that sound like *this* business; a fast, beautiful inbox; month-to-month, cancel anytime; cheap. Then expand into review requests and our voice-agent tie-in (Phase 2/3), where the money is.

## 3. Goals / non-goals / anti-goals

**Goals (v1):**
1. Connect a GBP account and choose a location in under 2 minutes.
2. An inbox showing every review with its full text, rating, reviewer, date, photos and reply status.
3. An AI draft for every unreplied review, editable, with one click to post.
4. Owner-defined auto-reply rules. **Default: nothing auto-posts.**
5. A dashboard: rating trend, review volume, response rate, response time, sentiment.
6. Email alerts for negative reviews, plus a daily digest.
7. Self-serve Stripe billing.

**Non-goals (v1):** review requests (SMS/email/WhatsApp), other platforms (Yelp, Facebook), agency/white-label, team roles, website widgets, competitor tracking. The data model leaves room for multiple locations and team members, but the v1 UI has one owner and one location per workspace.

**Anti-goals** (v1 has failed if any of these happen, even if it "works"):
- A reply is posted that the owner never consented to.
- Replies sound templated: identical openers, or Google moderation rejects them.
- Any review gating, incentives or fake-review behaviour. These breach Google policy and the FTC rule.
- The UI looks like Google's, or we imply we're a Google partner.
- A disconnected Google token goes unnoticed and replies silently stop.

## 4. Google constraints the design must respect

| Constraint | Design response |
|---|---|
| Reviews are only in the **legacy v4 API**: `accounts.locations.reviews.list/get/updateReply/deleteReply`, `locations:batchGetReviews` | Wrap it behind a provider interface (§8). |
| Quota is **0 QPM until Google approves us**; 300 QPM after. Errors before approval come back as 429. | Build against a **mock provider** now and switch with an env flag. |
| Limit of 10 edits/min per profile | The post queue is rate-limited per location. |
| Replies are **max 4096 bytes** (bytes, not characters) | Byte counter in the editor; the AI is asked to stay well under. |
| Replies are moderated: `ReviewReplyState` PENDING/APPROVED/REJECTED, plus `PolicyViolation` | Track the state. Show "Rejected by Google: reason" with re-edit. |
| No auto-posting without explicit consent | Auto-rules are off by default, turned on by the owner with a consent checkbox, and every auto-post is audit-logged. |
| API content may only be stored ≤30 days | A nightly purge deletes review text, reviewer names and reply text older than 30 days. Dashboards use daily **aggregate numbers** only (counts, averages, response times). Older reviews are re-fetched live when someone views them. *(Our reading of the policy. Confirm with Google or a lawyer.)* |
| The API can't delete or flag reviews | Show a "Report to Google" deep link. |
| Offboarding: the client must be able to disconnect within 7 business days | A Disconnect button revokes the token and purges the data immediately. |
| OAuth scope `business.manage`. Unverified apps are capped at 100 users. **Testing-mode refresh tokens expire after 7 days.** Open reports from 2026 say external users get 403 with no way to submit for verification. | Run the Google track (§10) in parallel. Show a reconnect banner and email the owner when the token fails. |
| Pub/Sub `NEW_REVIEW` notifications need API access and carry IDs only | v1 polls every 15 min. Pub/Sub is added post-approval as an optimisation. |

## 5. The product: user journey & UI

**Design direction:** a calm, modern, light-first SaaS look with dark mode, a single brand accent colour and generous whitespace. The visual identity must not look like Google. Each screen has one clear job. Product name and logo are TBD (placeholder: **"ReplyPilot"**).

### 5.1 Onboarding (the first 2 minutes)
```
[Sign up: email+password or Google sign-in]
      ↓
Step 1  Connect Google Business Profile   [Connect with Google]  (OAuth, business.manage)
Step 2  Pick your location                ( ) Joe's Pizza – Pune  ( ) ...
Step 3  Your reply voice                  Tone: Warm / Professional / Playful
                                           Sign-off: "– Team Joe's"   Owner name? Languages?
                                           Things to always/never say (free text)
                                           [We pull 5 of your past replies to learn your style]
Step 4  Auto-reply rules (optional)        Default OFF → "Every reply waits for your approval"
      ↓
Initial sync → land on Inbox with drafts already waiting
```

### 5.2 Inbox (the main screen, three panes)
```
┌────────────┬──────────────────────────┬──────────────────────────────────────┐
│ ReplyPilot │ Filters: [Needs reply 12]│ ★★☆☆☆  Priya S. · 2 days ago         │
│            │ [Drafted] [Posted]       │ "Waited 40 mins, pizza was cold..."  │
│ ▣ Inbox 12 │ [Rejected] [All]  ★ ▾ 🔍  │ [photo] [photo]                      │
│ ▤ Dashboard│──────────────────────────│ Sentiment: Negative · Topics: wait,  │
│ ⚙ Settings │ ● ★★☆☆☆ Priya S.   2d     │   food temp                          │
│ 💳 Billing  │   Waited 40 mins...      │──────────────────────────────────────│
│            │ ○ ★★★★★ Rahul K.   3d     │ AI draft  (Warm)      [↻ Regenerate] │
│ Connection:│   Amazing crust...  ✓auto │ ┌──────────────────────────────────┐ │
│ ● Healthy  │ ○ ★★★★☆ (no text)  4d     │ │ Hi Priya, we're really sorry...  │ │
│            │                          │ └──────────────────────────────────┘ │
│            │                          │ 312 / 4096 bytes  · Tone ▾ Shorter ▾ │
│            │                          │ [Post reply]  [Save draft]  [Skip]   │
│            │                          │ Report to Google ↗                   │
└────────────┴──────────────────────────┴──────────────────────────────────────┘
```
- Each list item shows a status chip: Needs reply / Draft ready / Scheduled auto-post (countdown, cancellable) / Posted · Pending Google / Live / Rejected (reason).
- Keyboard shortcuts: J/K to move, E to edit, ⌘↵ to post.
- An existing reply on a review can be edited and re-posted (`updateReply` overwrites it) or deleted.
- On mobile it collapses to list → detail.

### 5.3 Dashboard
```
[Avg rating 4.3 ▲0.1]  [Reviews this month 38]  [Response rate 92%]  [Avg response time 6h]
Rating over time (line)        Reviews per week by star (stacked bars)
Sentiment split (bar)          Top topics: praised / complained-about (AI-tagged)
Date range: 7d / 30d / 90d / 12m   (long ranges come from the daily aggregates table)
```

### 5.4 Settings
- **Reply voice:** tone, sign-off, owner name, do/don't list, reply language ("match reviewer's language" by default), sample replies. Preview the voice live against a sample review.
- **Auto-reply rules:** toggles per star band, for example:
  - "4–5★ with text: auto-post after [2h] unless I edit"
  - "4–5★ without text: auto-post immediately"
  - 1–3★: always manual (locked in v1)
  - Turning any rule on requires a consent checkbox.
- **Notifications:** instant email on ≤3★; daily digest on/off.
- **Google connection:** account, location, status, Reconnect, Disconnect (purges data).
- **Account:** profile, password, delete account.

### 5.5 Billing
Stripe Checkout with one plan in v1, a 14-day trial and month-to-month billing. Price is TBD (research suggests $19–39/location/mo for this tier). The trial starts at signup, with no card required to see your first drafts.

## 6. Feature roadmap

- **v1 (this design):** everything in §5.
- **Phase 2:**
  - Review requests via email/SMS/WhatsApp. These must go to all customers, with no gating.
  - QR code and review link generator
  - Pub/Sub real-time sync
  - Multi-location UI and team members with roles
  - Weekly PDF report
  - AI insights ("3 complaints about wait time this week")
- **Phase 3:**
  - **Voice-agent tie-in** (our unique angle). After a call, the aiassistant.co agent sends a review request. It can also optionally call back unhappy reviewers.
  - Agency/white-label plan
  - Other platforms (Facebook, Yelp)
  - Website review widget
  - Competitor benchmarking

## 7. Architecture (stack follows what the team already knows)

Monorepo in `Google-Reviews-Automation`:
```
/backend    Fastify 4 + Sequelize 6 (sequelize-cli migrations) + Postgres + BullMQ/Redis + googleapis + openai + stripe + @sendgrid/mail
/frontend   React 18 + Vite + MUI v5 (custom theme, fresh design) + React Router 6 + Redux Toolkit + Recharts + axios
/docs       specs, plans, Google-access runbook
docker-compose.yml  (postgres + redis for local dev)
```
- **Why this stack:** it is the same stack as NB, so the team already knows it. Vite replaces CRA because CRA is deprecated. The frontend stays in JS to match FE.
- **Processes:** `api` (Fastify) and `workers` (BullMQ), following NB's `src/server.js` / `src/workers.js` split.
- **LLM:** OpenAI via the existing pattern (`gpt-4o-mini`-class for drafts), behind a `llm` service so the model or provider can be swapped later.

### Reuse map (copy + adapt from NB/FE)
| Need | Copy from |
|---|---|
| Google OAuth connect/callback/refresh/disconnect | `NB/src/api/services/users.service.js` lines 2043–2345 (Sheets flow), `NB/src/utils/oauth.client.js`, routes `NB/src/api/routes/users.routes.js` lines 478–540 |
| Token encryption | `NB/src/utils/crypto.aes.js` |
| Connection table shape | `NB/src/database/migrations/202604301200000-create-user-google-sheets-connections.js` |
| JWT access/refresh auth | `NB/src/api/services/auth.service.js`, `NB/src/api/middlewares/user.auth.js` |
| BullMQ delayed + cron jobs | `NB/src/queues/scheduled.reports.queue.js`, `NB/src/queues/helpers.js` |
| LLM calls | `NB/src/api/services/openai.service.js` |
| Stripe checkout + webhooks | `NB/src/api/services/stripe.service.js`, `stripe-webhook.service.js` |
| Email | `NB/src/utils/email.utils.js` |
| Axios + token-refresh queue | `FE/src/services/apiServiceV2.js` |
| OAuth return page, connect UI, auth guard | `FE/src/pages/oauth-callback.js`, `FE/src/pages/GoogleSheetsIntegration/index.js`, `FE/src/auth/AuthGuard.js` |

## 8. Coding before Google approves us: the provider seam

```
GbpProvider (interface)
  listAccounts() · listLocations(account) · listReviews(location, pageToken)
  getReview(name) · updateReply(name, text) · deleteReply(name)
  ├─ MockGbpProvider  – fixtures copied byte-for-byte from the v4 docs' JSON shapes
  │                     (incl. reviewReply.replyState, policyViolation, reviewMediaItems),
  │                     seeded multilingual reviews, a "simulate new review" dev button,
  │                     simulated moderation (PENDING → APPROVED/REJECTED after N seconds), simulated 429/401
  └─ LiveGbpProvider  – googleapis / REST v4 calls
Selected by env GBP_PROVIDER=mock|live (per-environment)
```
- **What the mock covers:** everything except the real Google calls can be built and demoed against it, including OAuth. OAuth works today with `business.manage` for test users; only the data calls are blocked by the 0 quota.
- **On approval day:** flip the flag, run a contract test against our own company location, and fix any shape differences.

## 9. Backend design

**Data model (Postgres):**
- `users`, `workspaces` (v1 has 1 per user; `workspace_members` exists for later)
- `google_connections`: encrypted tokens, email, status `healthy|needs_reconnect|revoked`, `expires_at`
- `locations`: GBP account/location resource names, title, address, `sync_cursor`, `last_synced_at`
- `reviews`: Google review name (unique), rating, comment, reviewer, create/update time, media JSONB, sentiment, topics[], status, `purge_after`
- `replies`: review_id, text, `source ai|human|auto`, state `draft|scheduled|posting|pending_google|live|rejected|failed`, `google_reply_state`, `policy_violation`, `scheduled_for`, `posted_by`, `posted_at`
- `voice_profiles`: tone, sign-off, do/don't, language mode, sample replies
- `auto_reply_rules`: star band, has-text flag, delay minutes, enabled, `consented_at`, `consented_by`
- `daily_location_stats`: date, count by star, avg rating, replied count, median response minutes, sentiment counts. Kept forever because it holds numbers, not content.
- `audit_log`: who did what (post, auto-post, edit, connect, disconnect)
- `subscriptions` (Stripe), `notification_prefs`

**Jobs (BullMQ):**
- `sync-location`: cron every 15 min per location. Pages through reviews and upserts. New reviews enqueue `draft-reply`. It also refreshes the Google reply state of pending replies.
- `draft-reply`: LLM call using the voice profile + the review + up to 5 recent replies (so wording varies) + guardrails. The prompt rules:
  - No incentives or discounts for changing a review
  - No admitting legal liability
  - No personal data
  - Reply in the reviewer's language
  - Under about 1500 bytes
  - The output is checked for byte length and similarity to recent replies; a near-duplicate is regenerated
- `evaluate-rules`: when a draft is ready, match it against the rules. On a match, schedule `post-reply` at the configured delay. Editing or cancelling the draft removes the job.
- `post-reply`: rate-limited to 10 per minute per location. Calls `updateReply` → `pending_google`. It retries on 5xx/429 with backoff. On 401 it marks the connection `needs_reconnect` and emails the owner.
- `aggregate-stats`: nightly per location.
- `purge-content`: nightly, removes content older than 30 days.
- `notify`: instant ≤3★ alert, daily digest.

**API (REST, `/api/v1`):** auth (signup/login/refresh), google (connect/callback/status/disconnect/locations/select), reviews (list with filters, get), replies (regenerate draft, save, post, delete, cancel scheduled), voice-profile, rules, stats, notifications, billing (checkout, portal, webhook), and dev-only `POST /dev/simulate-review`.

## 10. Parallel workstreams: what happens while we code

**Track A, the Google access track (start in week 0, owned by a business/ops person and you):**
1. Create a **dedicated Cloud project** for this product. Approval is tied to the project number, so never recreate it.
2. Enable the 7 GBP APIs listed in the setup guide.
3. Set up the OAuth consent screen: app name and logo (not Google-like), a privacy policy and terms on our domain, and domain verification. Add the team and pilot customers as test users.
4. Submit the GBP API "Application for Basic API Access":
   - Apply from a **company-domain email that is an owner/manager on the company GBP**. Not Gmail.
   - Double-check the project number.
   - Make sure the form doesn't auto-pick a duplicate listing.
   - Write a clear use-case description, with screenshots of the mock-mode UI.
5. Check quota weekly (0 → 300 QPM). If 60 days pass with no answer, re-follow-up through the support form.
6. **OAuth production/verification.** Watch the open 2026 issue where `business.manage` blocks external users without a submit path. Until it's resolved, onboard the first pilot customers as test users (up to 100). Testing-mode tokens expire every 7 days, so the reconnect flow must be solid.

**Track B, the build (starts immediately, entirely in mock mode):** milestones in §11.

**Track C, product/design:** final name, logo and brand colour; pricing; landing page; privacy policy/terms (needed by Track A step 3); and recruiting 3–5 pilot customers from the existing base.

## 11. Build milestones (the detailed plan comes next)
1. Repo scaffold: backend, frontend, docker-compose, lint, CI, env templates.
2. Auth + workspace + app shell (layout, nav, theme).
3. Google OAuth connect + location picker (real OAuth, mock data provider).
4. Mock provider + sync job + reviews inbox (list, detail, filters).
5. Voice profile + AI drafting + editor + post flow with moderation states.
6. Auto-reply rules + scheduled posts + audit log.
7. Dashboard + daily aggregates + purge job.
8. Notifications (alert + digest) + connection-health handling.
9. Stripe billing + trial.
10. Live provider + contract test (as soon as approval lands) → pilot with existing customers.

## 12. Calls made on open points (decisions to confirm)
1. **Backfill on first connect.**
   - Initial sync imports the last 30 days of reviews and auto-drafts the unreplied ones.
   - Older unreplied reviews show in a "Backlog" filter, fetched live, with a "Draft reply" button. No bulk auto-drafting.
   - **Auto-rules only ever apply to reviews created after the rule's `consented_at`.** Connecting a profile never causes posts on old reviews.
2. **What the 30-day purge deletes.**
   - Google-sourced content (review text, reviewer name/photo, media URLs) is deleted when `last_fetched_at` is more than 30 days old. Sync re-fetching refreshes that timestamp, so reviews still in Google's list stay usable.
   - The owner's own reply texts and drafts are kept. That's their content, and it powers the voice profile and style samples.
   - Daily aggregates are kept.
   - Inbox queries hit Postgres for the last 30 days. "Backlog" and older views page live from the provider.
   - Get Google or legal confirmation before launch.
3. **Trial end or lapsed subscription.**
   - The workspace goes read-only: sync and drafting stop, and scheduled auto-posts are cancelled.
   - The owner can still see the inbox and dashboard and can pay to resume.
   - Emails go out 3 days before trial end and on lapse.
   - After 30 days lapsed, Google is disconnected and content is purged.
   - Entitlement is checked in API middleware **and** at the start of every worker job.
4. **Multiple locations in one Google account.**
   - The v1 UI lets the owner connect one location per workspace.
   - The Stripe subscription is built with `quantity = locations` from day one (always 1 in v1), and the schema already supports many locations per workspace, so the Phase 2 multi-location work is a UI change plus a quantity change.
   - No workspace switcher in v1.

## 13. Left to the builder
Exact visual design tokens, the component breakdown, prompt wording, test framework choice, CI provider, hosting/deploy target (default: same infra as the current platform), and the logging/monitoring setup.

## 14. Verification
- **Unit tests:** rules engine (star band × text × delay), byte-length limits, purge selection, token refresh.
- **Integration tests (mock provider):** connect → sync → draft → edit → post → simulated PENDING → APPROVED/REJECTED. Auto-rule scheduling and cancel-on-edit. 401 → needs_reconnect + email.
- **Manual end-to-end:** `docker compose up`, then run the api, workers and frontend. Sign up, connect a Google test user, pick the mock location, use "simulate review", and watch the draft appear, edit it, post it, and see the status change. Then turn on an auto-rule and confirm it auto-posts after the delay. Check the dashboard numbers.
- **On approval:** with `GBP_PROVIDER=live`, list reviews and post a reply on our own company location to validate the real shapes.
