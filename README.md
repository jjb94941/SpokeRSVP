# SpokeRSVP

Mill Valley Village event **RSVP + waitlist + optional carpools** for Marin Villages.

This is a lightweight Next.js app for village chairs (hosts) and neighbors (guests). It **complements Helpful Village** — it is not a CRM and it does not rebuild volunteer matching.

The visual system is **Village Warm**: terracotta headers (`#C46B4A`), cream page background (`#FBF6F0`), teal accents (`#4A7C74`), warm brown text (`#3D2F28`), and sand cards, with large type and ~56px labeled buttons.

## Run it locally (Mac, Linux, or Windows)

You need [Node.js 20+](https://nodejs.org/) (22 is a good choice) and Git.

Local development can use a **file-backed LibSQL** database (default) or a free **Turso** database. There is no `better-sqlite3` native build step.

### Windows (PowerShell)

```powershell
git clone https://github.com/jjb94941/SpokeRSVP.git
cd SpokeRSVP
Copy-Item .env.example .env
npm install
npm run db:seed
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

PowerShell uses `Copy-Item`, not `cp`. If you already have a `.env` file, skip that line.

### Mac / Linux

```bash
git clone https://github.com/jjb94941/SpokeRSVP.git
cd SpokeRSVP
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database: local `file:` or Turso

`.env.example` defaults to a local file:

```
DATABASE_URL=file:./data/spoke.db
DATABASE_AUTH_TOKEN=
```

Leave `DATABASE_AUTH_TOKEN` empty for a file URL. The `data/` folder is created automatically and gitignored.

To use a Turso database locally instead (same setup you will use on Vercel):

1. Create a database in the [Turso dashboard](https://turso.tech) (a free database is enough for the pilot).
2. Copy the `libsql://…` URL and the auth token into `.env` as `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.
3. Run `npm run db:seed` so schema + demo data land on that database.

Never commit `.env` or real tokens.

### Demo hosts (local / development only)

Seeded by `npm run db:seed`. **Do not use these credentials on a public website. Change these passwords before any production deploy.**

| | Administrator | Sub-administrator |
| --- | --- | --- |
| Email | `chair@millvalleyvillage.org` | `volunteer@millvalleyvillage.org` |
| Password | `millvalley` | `millvalley` |
| Can manage | All events, and host roles | Only events they created |

Sign in at `/login`. You can also request a magic-link email; without a Resend key the link is printed on the login page and in the server log.

The seed also creates Mill Valley sample events (walkers/hike with carpools, coffee, book club with a waitlist, plus a stretch class owned by the volunteer). Rebuild them with `npm run db:reset` (works for both the local file DB and Turso).

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | App at http://localhost:3000 |
| `npm run db:seed` | Create schema + demo hosts + sample events (file: or Turso) |
| `npm run db:reset` | Wipe that database and seed again |
| `npm run reminders` | Email-stub (or Resend) reminders for Going guests in the next 48 hours |
| `npm run test:smoke` | Waitlist auto-promote, duplicate RSVP, host-role, and schema-migration checks (uses a temp file DB) |
| `npm run build` | Production build |

CI / offline build (no Turso network):

```bash
DATABASE_URL=file:./data/spoke.db npm run build
```

The app is `force-dynamic`, so a production Vercel build does not need a live database at compile time. Runtime still needs `DATABASE_URL` (and `DATABASE_AUTH_TOKEN` for Turso).

## Deploy on Vercel (Turso)

Do **not** put secrets in git. Change the demo host password before the site is public.

1. **Create a Turso database** at [turso.tech](https://turso.tech) (free tier is fine for the village pilot).
2. **Copy credentials** from the Turso dashboard:
   - Database URL (`libsql://…`) → `DATABASE_URL`
   - Auth token → `DATABASE_AUTH_TOKEN`
3. **Seed once** from your laptop (same `.env` values): `npm run db:seed`. Change the demo password in the host UI (or re-seed only on a throwaway DB).
4. **Import the GitHub repo** into [Vercel](https://vercel.com) (Next.js is auto-detected).
5. **Set Vercel environment variables** (Production, and Preview if you use it):

   | Name | Required | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | yes | Turso `libsql://…` URL |
   | `DATABASE_AUTH_TOKEN` | yes | Turso token |
   | `APP_URL` | yes | Public origin, e.g. `https://your-app.vercel.app` |
   | `REMINDER_SECRET` | for cron | Random string; also set `CRON_SECRET` to the **same** value so Vercel Cron sends `Authorization: Bearer …` |
   | `RESEND_API_KEY` | optional | Confirmation / waitlist / reminder email |
   | `RESEND_FROM` | optional | Verified Resend from-address |

6. **Deploy** from the Vercel dashboard (or by pushing to the connected branch). This repo includes `vercel.json` with a **daily** cron hitting `GET /api/reminders` at 16:00 UTC. The route stays disabled until `REMINDER_SECRET` (or `CRON_SECRET`) is set.

You can also run reminders manually: `POST` or `GET` `/api/reminders` with `Authorization: Bearer $REMINDER_SECRET`.

## What the MVP does

- **Hosts** sign in with email/password or a magic link. **Administrators** can view, edit, cancel, export, and manage RSVPs/waitlists/carpools for **every** event, create events, and appoint or remove sub-administrators at `/host/admins`. **Sub-administrators** can create events and manage **only** the events they created. They cannot change anyone’s role. Existing hosts default to administrator when the `hosts.role` column is added.
- **Guests** open `/e/<token>` with **no account**. They RSVP with name plus phone **or** email: Going, not going, or waitlist when the event is full. Changing from Going to not going **auto-promotes** the next waitlisted neighbor.
- **Carpools** (when enabled): offer seats or need a ride. Visible to Going guests (first names) and the host (full contact).
- **Email**: confirmation, waitlist promotion, and reminders go through [Resend](https://resend.com) when `RESEND_API_KEY` is set. Otherwise they are **logged** (local stub). Magic links work the same way.
- **SMS**: not implemented (`TODO` in `src/lib/notify.ts` and `npm run reminders`).

## Host roles

- **Administrator** — complete control over every event (view, edit, cancel, RSVP/waitlist/carpool management, CSV export), can create events, and can appoint, promote, demote, or remove hosts at `/host/admins`.
- **Sub-administrator** — can create events and manage only events they created. They cannot open other people’s dashboards and cannot change anyone’s role.

Existing production hosts are treated as administrators: `ensureSchema` adds `hosts.role` with `DEFAULT 'admin'` (ALTER-safe on SQLite/Turso).

### Local smoke check (admin vs sub-admin)

1. `npm run db:reset` then `npm run dev`.
2. Sign in as `chair@millvalleyvillage.org` / `millvalley`. Host home should list **all** events, including **Saturday stretch & chat**, and **Manage hosts** should appear. Open `/host/admins` and confirm both demo accounts.
3. Sign out, then sign in as `volunteer@millvalleyvillage.org` / `millvalley`. Host home should show **only** the stretch class. **Manage hosts** should not appear. Opening `/host/admins` should send you back to host home. Pasting a chair-owned event dashboard URL should 404.

`npm run test:smoke` also checks role policy helpers and that a pre-role `hosts` table gets `role = admin`.

To try this branch on a laptop **before any production deploy**:

```bash
git fetch && git checkout cursor/admin-sub-admin-roles-5ebd
cp .env.example .env   # keep DATABASE_URL=file:./data/spoke.db for local
npm install && npm run db:reset && npm run dev
```

Then:

1. Sign in as the administrator (`chair@millvalleyvillage.org` / `millvalley`). Confirm **Manage hosts** and that **Saturday stretch & chat** is listed. Open `/host/admins`, appoint a new sub-administrator (name, email, optional temporary password). The temporary password is shown once on that page.
2. Sign out, sign in as the seeded volunteer (`volunteer@millvalleyvillage.org` / `millvalley`) or the host you just appointed. Confirm you only see events you created, cannot open `/host/admins`, and a chair-owned dashboard URL 404s.
3. Confirm the footer on public and host pages reads **Ver. 2.0 · September 15, 2026**.

Do not deploy this to Vercel production until that local check is done.

## Versioning

Every release bumps **both** fields in `src/lib/version.ts`:

| Field | Meaning |
| --- | --- |
| `number` | `XX.YY` — XX for major updates, YY for minor changes and bug fixes |
| `releaseDate` | ISO date (`YYYY-MM-DD`) of the release |

The footer always shows both together as `Ver. XX.YY · Month D, YYYY` (never the version number alone). See [CHANGELOG.md](CHANGELOG.md).

## Privacy / pilot disclaimer

This is a **village pilot**, not a production membership system.

- Guest contact information is for the **event host**, not a public directory.
- Optional street addresses on events are **host-only**.
- Do not store medical, financial, or other sensitive records here.
- There is no Helpful Village sync. Volunteer matching stays in Helpful Village.
- Back up the Turso database (or the local `data/spoke.db` file) if you rely on the lists.
- **Change the demo host password before production.** Never commit API keys, Turso tokens, or `REMINDER_SECRET`. Review auth, HTTPS, backups, and a real email sending domain before neighbors depend on the site.

## Configuration

Copy `.env.example` to `.env`. Nothing secret belongs in git.

```
DATABASE_URL=file:./data/spoke.db
DATABASE_AUTH_TOKEN=
APP_URL=http://localhost:3000
RESEND_API_KEY=
RESEND_FROM=SpokeRSVP <noreply@example.com>
REMINDER_SECRET=
```

`DATABASE_PATH` is no longer used; use `DATABASE_URL` (`file:` locally or `libsql://` for Turso).

`GET`/`POST` `/api/reminders` with `Authorization: Bearer $REMINDER_SECRET` is the cron hook. Leave `REMINDER_SECRET` empty to keep that endpoint off; use `npm run reminders` instead.

## Tech

Next.js App Router, TypeScript, Tailwind CSS, Drizzle ORM (SQLite table dialect), LibSQL via `@libsql/client` (local `file:` or Turso).

## License

Private village pilot code. Ask Mill Valley Village / Marin Villages before redistributing.
