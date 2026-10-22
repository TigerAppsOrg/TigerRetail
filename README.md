# TigerRetail

Princeton's student marketplace. Next.js app, Princeton CAS sign-in, the TigerRetail development PostgreSQL database, and AWS S3 + CloudFront for photos.

## Run it on your machine

1. Install Node 22, Bun, AWS CLI, and Google Chrome (the e2e tests drive Chrome).
2. `git clone https://github.com/TigerAppsOrg/TigerRetail.git && cd TigerRetail && bun install --frozen-lockfile`
3. `bun run setup` asks for the database and S3 settings one at a time and saves them to `.env.local`.
4. Copy the remaining keys you need from `.env.example` into `.env.local` (see the table below).
5. `bun run dev`, open http://localhost:3000 and sign in with your netid.

`.env.local` is gitignored. Never commit keys, and never paste them in Slack or GitHub.

## Keys

| Key | Needed for | Where to get it |
|---|---|---|
| `DATABASE_URL` | everything | Ask Raj (shared dev database) |
| `AWS_REGION`, `S3_BUCKET`, `S3_PUBLIC_URL` | photos | See [AWS hosting](deploy/README.md); ask TigerApps for AWS access, then `aws sso login --profile <profile>` and set `AWS_PROFILE` locally |
| `SESSION_SECRET` | sign-in | Make your own: `openssl rand -base64 48` |
| `APP_URL` | sign-in | `http://localhost:3000` |
| `ADMIN_NETIDS` | the import review page (`/admin/imports`) | Your netid |
| `ANTHROPIC_API_KEY` | reading sale slide decks | Your own key from console.anthropic.com |
| `INBOX_ENGINE_URL`, `INBOX_ENGINE_TOKEN` | finding listserv sale emails | Ask TigerApps |
| `CRON_SECRET` | `bun run import` | Make your own: `openssl rand -hex 24` |
| `SENDGRID_API_KEY`, `MAIL_FROM` | sending seller invites | Ask Raj |
| `INVITE_TEST_RECIPIENT` | sending seller invites | Your own `netid@princeton.edu`; every test invite goes here |

Only the first four rows are needed to run the app. S3 uses the AWS SDK default credential chain: your local AWS profile or the EC2 instance role. No R2 keys are needed. Leave `INVITES_TO_SELLERS` unset: it sends invites to real sellers.

## Commands

- `bun run test`: unit tests.
- `bun run lint`: lint.
- `bun run e2e`, `bun run e2e:import`, `bun run e2e:map`: browser tests. Run them with `bun run dev` going in another terminal.
- `bun run migrate -- --status`: lists the database migrations that have been applied.
- `bun run migrate`: applies new files from `db/migrations/`.
- `bun run seed -- --owner <netid>`: adds the demo marketplace.
- `bun run seed:clear`: removes the demo marketplace.

## The shared database

Everyone works on the same dev database and photo bucket, so:

- Tell the team before you run `bun run migrate`, `bun run seed` or `bun run seed:clear`. They change everyone's data.
- The e2e tests create `e2e-*` users and delete them when they finish.

## Hosted MVP (AWS)

The deployment targets https://retail.tigerapps.org. Pushes to `main` run CI and
then deploy to the dedicated EC2 instance through GitHub OIDC and AWS Systems Manager.
See [AWS hosting](deploy/README.md) for SSH, secrets, release management, and
shared database migration details.

Princeton CAS requires the custom `*.tigerapps.org` hostname for sign-in.

## Where to work

`main` is the shared source of truth and the branch deployed to AWS. Start new
work from an up-to-date `main` and merge changes through a pull request.

- `app/(site)/`: the live marketplace pages, actions, and shared UI styles.
- `components/campus-map/`: the live map and its filtering/rendering logic.
- `lib/`: authentication, database access, storage, messaging, and imports.
- `db/migrations/`: database history; keep applied migrations intact.
- `deploy/` and `.github/workflows/`: AWS release configuration.
- `fixtures/seed/`: development seed data and illustrations, used by `bun run seed`.
- `app/dev/map-demo/` and `fixtures/demoMarketplace.ts`: the development-only
  map stress test, exercised by `bun run e2e:map`. It returns 404 in production.

The standalone HTML prototype has been retired. Update the Next.js app directly;
its shared marketplace styles live in `app/(site)/marketplace.css`.
