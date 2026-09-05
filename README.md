# ReachInbox Email Scheduler

A full-stack email job scheduler: schedule cold-outreach emails from a dashboard, send them at the right time via BullMQ delayed jobs (no cron), survive restarts without losing or duplicating work, stay under configurable rate limits, and get a live Slack ping when a limit is hit.

This project is split into two repositories:
- backend: Express + TypeScript API, BullMQ worker, Postgres, Elasticsearch, Slack/Google OAuth
- frontend: React + Vite + TypeScript dashboard

Clone both side by side and follow the setup steps below for each.

## Features implemented

### Backend

| Feature | Status | Notes |
|---|---|---|
| Email scheduling API | Done | POST /api/emails/schedule - validates and persists to Postgres |
| Scheduler (BullMQ, no cron) | Done | Delayed job per schedule, fires at scheduled_at |
| Persistence / restart-safety | Done | Redis holds the delayed jobs; Postgres is the source of truth; recipient-level status makes retries idempotent |
| Worker concurrency | Done | WORKER_CONCURRENCY env var |
| Delay between sends | Done | Per-schedule delayMs, applied between each recipient in the worker loop |
| Hourly rate limit | Done | Per-schedule hourlyLimit (capped by MAX_EMAILS_PER_HOUR), Redis-counter backed, reschedules remaining recipients to the next hour window instead of dropping them |
| Slack notification on rate-limit hit | Done | Real OAuth connect flow plus live chat.postMessage call; no-ops safely if not connected |
| Google OAuth login | Done | Full code exchange, issues a JWT |
| Dynamic "From" address | Done | Resolved from the schedule owner's own account (schedule to user_id to user.email), not a static env var |
| Elasticsearch search | Done | Indexes on schedule, updates status on send; best-effort/non-blocking if ES is down |
| Live BullMQ dashboard | Done | Bull Board at /admin/queues, protected by HTTP Basic Auth |
| API docs | Done | Swagger UI at /api-docs |

### Frontend

| Feature | Status | Notes |
|---|---|---|
| Google login (real OAuth) | Done | Redirects through the backend, lands back on /auth/callback with a token |
| Header: name, email, avatar, logout | Done | Sidebar in this layout, per Figma |
| Scheduled / Sent tabs with counts | Done | |
| Compose modal | Done | Subject, body, CSV/TXT upload with live detected-email count, start time, delay, hourly limit |
| Search | Done | Hits the Elasticsearch-backed search endpoint |
| Loading / empty states | Done | |
| Slack connect/disconnect | Done | |
| Reusable UI components | Done | Button, Input, Modal, Badge, Spinner, EmptyState |

## Architecture overview

### How scheduling works

1. POST /api/emails/schedule validates the request, writes one email_schedules row and one email_recipients row per recipient (status SCHEDULED) in a single DB transaction.
2. A BullMQ job is added to the email queue with delay = scheduled_at minus now. This is a delayed job, not a cron task - BullMQ tracks it in Redis and hands it to a worker the moment the delay elapses, even across restarts.
3. The worker loads the schedule (and its still-SCHEDULED recipients) and sends one email at a time via Ethereal SMTP, waiting delayMs between each.
4. Each send updates that recipient's row to SENT or FAILED in Postgres, and mirrors the same status into Elasticsearch.

### How persistence on restart is handled

- Redis is BullMQ's backing store - delayed and waiting jobs live there, independent of the Node process. Restarting the server does not lose or reset them.
- Postgres is the source of truth for what's actually happened. The worker's query only pulls recipients still in SCHEDULED status, so if a job is retried (after a crash mid-send, for example) it naturally skips anything already marked SENT or FAILED - nothing gets re-sent, and nothing restarts from scratch.

This covers the app-restart scenario the assignment asks for (stop the Node process, start it again, jobs still fire on time). It does not by itself cover Redis itself crashing or the machine rebooting - that depends on how Redis's own persistence is configured, which is separate from anything in this codebase:

- RDB (snapshotting): Redis periodically writes its whole dataset to a single .rdb file on disk, based on save rules in redis.conf (for example, save 60 10000 means snapshot if at least 10000 keys changed in the last 60 seconds). This is Redis's default persistence mode. If Redis crashes between snapshots, writes since the last snapshot are lost.
- AOF (append-only file): every write command is logged to a file as it happens and replayed on startup to rebuild state. Enabled by setting appendonly yes in redis.conf. With the default appendfsync everysec, at most about one second of writes can be lost on a hard crash, which is a much smaller window than RDB alone.

To make Redis durable against its own crashes or a reboot (not just app restarts), enable both in redis.conf:

```
appendonly yes
appendfsync everysec
save 900 1
save 300 10
save 60 10000
```

Then restart the Redis service for the config file change to take effect. This step is independent of the backend and frontend in this repository - it is a Redis server configuration choice, made once wherever Redis is deployed, not something the application code controls.

### How rate limiting and concurrency are implemented

- Concurrency: WORKER_CONCURRENCY configures how many BullMQ jobs the worker processes in parallel (Worker with a concurrency option).
- Delay between sends: each schedule carries its own delayMs (set at compose time), applied as a wait between recipients inside the worker loop.
- Hourly limit: each schedule carries its own hourlyLimit, capped server-side by the env-configured ceiling MAX_EMAILS_PER_HOUR. The worker keeps a Redis counter keyed by emailScheduleId plus the current hour bucket, incremented atomically (INCR plus PEXPIREAT) after every successful send. This is safe across multiple worker instances since the counter lives in Redis, not in-process memory.
- On limit hit: the worker does not drop or fail the remaining recipients. It fires a Slack notification (if connected) and re-enqueues a new delayed job for the same schedule, timed to the start of the next hour, so sending resumes automatically, in the same recipient order, without manual intervention.

Trade-off: rate limits are scoped per-schedule (per compose action), not globally across all of a user's schedules - this matches the Figma's compose-time Hourly Limit field and was a deliberate scope decision (see Assumptions below), not an oversight.

## Setup and running

### Prerequisites

- Node.js (LTS)
- PostgreSQL
- Redis
- Elasticsearch (8.x or 9.x)
- A free Ethereal Email test account (ethereal.email)

Docker was intentionally not used for this submission - Postgres, Redis, and Elasticsearch were installed and run natively, and the setup below was verified end to end against that native setup.

### Ethereal Email setup

1. Go to ethereal.email/create and create a free test account (or call nodemailer.createTestAccount() once and note the credentials).
2. Copy the generated user and pass into SMTP_USER and SMTP_PASS below. Ethereal never delivers real mail - every "sent" email is caught and viewable from their web inbox.

### Backend

```
cd backend
npm install
cp .env.example .env
npm run build
npm start
```

Fill in .env before running. Env vars:

| Variable | Purpose |
|---|---|
| DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, DB_SSL | Postgres connection |
| REDIS_URL | Redis connection string used by both BullMQ and the rate-limit counters. Local: redis://localhost:6379. Hosted (e.g. Upstash): rediss://default:password@endpoint:port, copied straight from the provider's dashboard - the rediss scheme enables TLS automatically, no extra config needed to switch between local and hosted |
| JWT_SECRET | Signs and verifies session JWTs - set to a long random string |
| FRONTEND_URL | Where OAuth callbacks redirect back to (e.g. http://localhost:5173) |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL | Google OAuth app credentials |
| SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_CALLBACK_URL | Slack OAuth app credentials (needs Bot Token Scopes chat:write and im:write) |
| WORKER_CONCURRENCY | Parallel jobs the BullMQ worker processes |
| MAX_EMAILS_PER_HOUR | System-wide ceiling a schedule's hourlyLimit cannot exceed |
| ELASTICSEARCH_NODE | Elasticsearch endpoint URL. Local: http://localhost:9200. Hosted (e.g. Elastic Cloud): the deployment's endpoint URL |
| ELASTICSEARCH_API_KEY | API key for hosted Elasticsearch (e.g. Elastic Cloud). Leave empty for a local instance with security disabled |
| ADMIN_USER, ADMIN_PASSWORD | HTTP Basic Auth credentials for the Bull Board dashboard - change these before demoing or submitting |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS | Ethereal test account credentials |

Note: the backend has no watch or dev mode configured - after any code or .env change, re-run npm run build and restart the process (npm start) to pick it up.

### Frontend

```
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set VITE_API_URL in frontend/.env to the backend's URL, e.g. http://localhost:3000.

## API reference

- Swagger UI: http://localhost:3000/api-docs
- Bull Board (queue dashboard, Basic Auth): http://localhost:3000/admin/queues

## Assumptions, shortcuts and trade-offs

- "Multiple senders" is interpreted as concurrent schedules/campaigns per user (each with its own delayMs and hourlyLimit), not literal multiple SMTP mailbox accounts - no sender-pool config or sender-management UI exists. This reading is confirmed by the Figma, which has no sender-connection screen and shows hourlyLimit as a per-compose field.
- CSV/lead-list parsing is entirely frontend-side - the backend just receives an array of recipient emails; there is no upload/parsing endpoint.
- Rate-limit counters are keyed per-schedule, not globally or per literal sender.
- Elasticsearch indexing/search is best-effort and non-blocking. If ES is down, scheduling still succeeds and the search endpoint fails gracefully with a 500 instead of crashing - but there is no reconciliation job, so a write missed while ES is down stays missing until the next update to that recipient.
- Slack notifications are best-effort - a disconnected or unreachable Slack simply no-ops rather than blocking a send.
- Idempotency relies on recipient-level status checks, not an explicit BullMQ jobId. In normal single-call operation this is sufficient; it is not structurally defended against a schedule being enqueued twice.
- A BullMQ job "completing" does not mean every recipient in it sent successfully - per-recipient failures are caught and recorded in Postgres/Elasticsearch, but the job itself still reports "completed" in Bull Board. Per-email status only lives in the DB/search index, not the queue dashboard.
- Bull Board is protected with HTTP Basic Auth, not the app's JWT auth, since it is opened directly in a browser rather than called with an Authorization header.
- Docker was not used - Postgres, Redis, and Elasticsearch were run natively, and the assignment itself marks Docker as recommended but not mandatory.

