# Deploying to production

One server (EC2, Ubuntu) runs Nginx and the API under PM2. Nginx serves the built web app and forwards `/api/` to the API, so the app and API share one domain. Postgres is separate.

You do the steps in AWS, DNS and Google Console, and you keep all real secrets. Nothing here needs Docker or Redis.

## What you need first

- A server you can SSH into, and a domain or subdomain pointing at it, for example `app.your-domain.com`.
- A Postgres server. Use the team's if there is one, otherwise create an RDS instance.
- A Resend account with your sending domain verified.
- A Google Cloud project with an OAuth client (see Google below).

## 1. Database

Each environment gets its own database and user, so nothing done in development can touch real customers. The same server is fine.

```sql
CREATE USER replypilot_prod WITH PASSWORD 'a-long-random-password';
CREATE DATABASE replypilot_prod OWNER replypilot_prod;
REVOKE ALL ON DATABASE replypilot_prod FROM PUBLIC;
```

- Allow connections only from the app server's IP or security group, plus known IPs if people need direct access.
- Turn on automated backups. On RDS, set the retention to at least 7 days.
- Use TLS, and verify the server. For RDS, download the CA bundle to the server and add `?sslmode=verify-full&sslrootcert=/var/www/replypilot/rds-ca.pem` to `DATABASE_URL`.

## 2. Server

```bash
git clone https://github.com/Smart-Assistant-ai/Google-Reviews-Automation.git /tmp/replypilot
sudo bash /tmp/replypilot/deploy/setup.sh
```

```bash
git clone https://github.com/Smart-Assistant-ai/Google-Reviews-Automation.git /var/www/replypilot
```

## 3. Secrets

Generate two separate values, one for each secret:

```bash
openssl rand -hex 32
```

Create `/var/www/replypilot/apps/api/.env` from `apps/api/.env.example` and lock it down:

```bash
chmod 600 /var/www/replypilot/apps/api/.env
```

These are the production values. The app refuses to start if any required one is missing or still a placeholder.

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
APP_URL=https://app.your-domain.com
DATABASE_URL=postgresql://replypilot_prod:PASSWORD@HOST:5432/replypilot_prod?sslmode=verify-full&sslrootcert=/var/www/replypilot/rds-ca.pem
JWT_SECRET=first-generated-value
ENCRYPTION_KEY=second-generated-value
SIGNUP_MODE=allowlist
GBP_PROVIDER=live
GOOGLE_SIGNIN_PROVIDER=live
GOOGLE_CLIENT_ID=from-google-console
GOOGLE_CLIENT_SECRET=from-google-console
EMAIL_PROVIDER=resend
RESEND_API_KEY=from-resend
EMAIL_FROM=ReplyPilot <hello@your-domain.com>
OPENAI_API_KEY=from-openai
SENTRY_DSN=optional
```

Keep a copy of `ENCRYPTION_KEY` somewhere safe, such as a password manager. Without it, stored Google tokens can't be read and every business has to reconnect.

## 4. Nginx and HTTPS

Copy `deploy/nginx-site.conf`, replace `app.example.com` with your domain, and turn it on:

```bash
sudo cp deploy/nginx-site.conf /etc/nginx/sites-available/replypilot
sudo ln -s /etc/nginx/sites-available/replypilot /etc/nginx/sites-enabled/replypilot
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d app.your-domain.com
```

## 5. Google Console

In the OAuth client (type: Web application), add both redirect URIs:

- `https://app.your-domain.com/api/v1/google/callback`
- `https://app.your-domain.com/api/v1/auth/google/callback`

Until Google verifies the OAuth consent screen, it stays in Testing mode: only listed test users can connect, up to 100, and their tokens expire every 7 days. The app emails the owner when a token dies, and they reconnect from Settings.

## 6. First deploy

Take a database snapshot before any release that includes a migration. Migrations only move forward.

```bash
cd /var/www/replypilot && bash deploy/deploy.sh
```

The script pulls, installs, migrates, builds, restarts and checks health. It stops at the first failure.

## 7. Add an uptime check

Point an uptime monitor at `https://app.your-domain.com/api/v1/health`. It answers 200 when the app and database are fine, and 503 otherwise.

## 8. Before the first real business

- [ ] Restore a backup into a scratch database and open it. A backup nobody has restored isn't proven.
- [ ] Confirm `https://` works and `http://` redirects to it.
- [ ] Log in and confirm the `rp_refresh` cookie is marked `Secure` and `HttpOnly`.
- [ ] Confirm the database can't be reached from outside its allowed IPs.
- [ ] Have a senior engineer review the security groups and secrets.
- [ ] Have someone confirm the 30-day storage rule with Google or a lawyer (see the design doc).
- [ ] Once Google approves API access, test on the company's own profile first. Real replies are public.

## Adding a business during the pilot

Signup is limited to an allowlist. For each business:

1. Add their email. Run this on the server, from `/var/www/replypilot`:

   ```bash
   pnpm allow-signup owner@business.com "Business name"
   ```

2. While OAuth is in Testing mode, add the Google account that manages their Business Profile as a test user in Google Console. This can be a different address from their login email, so ask them.

To see or remove entries, use `pnpm allow-signup --list` and `pnpm allow-signup --remove owner@business.com`.

## Day-to-day

| Task                                       | Command                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Release                                    | `bash deploy/deploy.sh`                                                                                                    |
| See logs                                   | `pm2 logs replypilot-api`                                                                                                  |
| See job health                             | `psql "$(grep ^DATABASE_URL= apps/api/.env \| cut -d= -f2-)" -c "select name, last_finished_at, last_error from job_runs"` |
| Stop all posting to Google in an emergency | Set `GOOGLE_POSTING_ENABLED=false` in `.env`, then `pm2 restart replypilot-api`                                            |

## Limits to know about

The API runs as one process. Rate limits and Google call limits are counted in memory, so running a second process would double them. A second server, or heavy auto-replies, is the point to add Redis and a queue. Background jobs sit behind one module (`apps/api/src/jobs/runner.ts`), so that change stays contained.
