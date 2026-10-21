# TigerRetail

Princeton's student marketplace. Next.js app, Princeton CAS sign-in, the TigerRetail development PostgreSQL database, and Cloudflare R2 for photos.

## Run it on your machine

1. Install Node 22+ and Google Chrome (the e2e tests drive Chrome).
2. `git clone https://github.com/TigerAppsOrg/TigerRetail.git && cd TigerRetail && npm install`
3. `npm run setup` asks for the database and R2 keys one at a time and saves them to `.env.local`.
4. Copy the remaining keys you need from `.env.example` into `.env.local` (see the table below).
5. `npm run dev`, open http://localhost:3000 and sign in with your netid.

`.env.local` is gitignored. Never commit keys, and never paste them in Slack or GitHub.

## Keys

| Key | Needed for | Where to get it |
|---|---|---|
| `DATABASE_URL` | everything | Ask Raj (shared dev database) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` | photos | Ask Raj for an R2 API token (Object Read & Write on bucket `tigerretail`) |
| `SESSION_SECRET` | sign-in | Make your own: `openssl rand -base64 48` |
| `APP_URL` | sign-in | `http://localhost:3000` |
| `ADMIN_NETIDS` | the import review page (`/admin/imports`) | Your netid |
| `ANTHROPIC_API_KEY` | reading sale slide decks | Your own key from console.anthropic.com |
| `INBOX_ENGINE_URL`, `INBOX_ENGINE_TOKEN` | finding listserv sale emails | Ask TigerApps |
| `CRON_SECRET` | `npm run import` | Make your own: `openssl rand -hex 24` |
| `SENDGRID_API_KEY`, `MAIL_FROM` | sending seller invites | Ask Raj |
| `INVITE_TEST_RECIPIENT` | sending seller invites | Your own `netid@princeton.edu`; every test invite goes here |

Only the first four rows are needed to run the app. Leave `INVITES_TO_SELLERS` unset: it sends invites to real sellers.

## Commands

- `npm test`: unit tests.
- `npm run lint`: lint.
- `npm run e2e`, `npm run e2e:import`, `npm run e2e:map`: browser tests. Run them with `npm run dev` going in another terminal.
- `npm run migrate -- --status`: lists the database migrations that have been applied.
- `npm run migrate`: applies new files from `db/migrations/`.
- `npm run seed -- --owner <netid>`: adds the demo marketplace.
- `npm run seed:clear`: removes the demo marketplace.

## The shared database

Everyone works on the same dev database and photo bucket, so:

- Tell the team before you run `npm run migrate`, `npm run seed` or `npm run seed:clear`. They change everyone's data.
- The e2e tests create `e2e-*` users and delete them when they finish.

## Hosting

- Princeton CAS only accepts `*.tigerapps.org` addresses, so the hosted site lives on one.
