# SpokeRSVP

Mill Valley Village event **RSVP + waitlist + optional carpools** for Marin Villages.

This is a lightweight Next.js app for village chairs (hosts) and neighbors (guests). It **complements Helpful Village** — it is not a CRM and it does not rebuild volunteer matching.

The visual system is **Village Warm**: terracotta headers (`#C46B4A`), cream page background (`#FBF6F0`), teal accents (`#4A7C74`), warm brown text (`#3D2F28`), and sand cards, with large type and ~56px labeled buttons.

## Run it locally (Mac, Linux, or Windows)

You need [Node.js 20+](https://nodejs.org/) (22 is a good choice) and Git.

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

If `npm install` fails on `better-sqlite3`, install **Visual Studio Build Tools** with the “Desktop development with C++” workload, then run `npm install` again. (Mac and Linux usually just work if Python and a C compiler are present.)

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

### Demo host (local / development only)

Seeded by `npm run db:seed`. **Do not use these credentials on a public website.**

| | |
| --- | --- |
| Email | `chair@millvalleyvillage.org` |
| Password | `millvalley` |

Sign in at `/login`. You can also request a magic-link email; without a Resend key the link is printed on the login page and in the server log.

The seed also creates three Mill Valley sample events (walkers/hike with carpools, coffee, book club with a waitlist). Rebuild them with `npm run db:reset`.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | App at http://localhost:3000 |
| `npm run db:seed` | Create SQLite file + demo host + sample events |
| `npm run db:reset` | Wipe the local database and seed again |
| `npm run reminders` | Email-stub (or Resend) reminders for Going guests in the next 48 hours |
| `npm run test:smoke` | Waitlist auto-promote + duplicate RSVP checks |
| `npm run build` | Production build (still local; see below) |

SQLite lives at `data/spoke.db` by default (gitignored).

## What the MVP does

- **Hosts** sign in with email/password or a magic link, create events (title, date/time in Pacific Time, location name, optional private street address, capacity, description, carpools on/off), copy a share link, edit or cancel, export a CSV, see RSVPs / waitlist / carpools, and **promote** someone from the waitlist.
- **Guests** open `/e/<token>` with **no account**. They RSVP with name plus phone **or** email: Going, not going, or waitlist when the event is full. Changing from Going to not going **auto-promotes** the next waitlisted neighbor.
- **Carpools** (when enabled): offer seats or need a ride. Visible to Going guests (first names) and the host (full contact).
- **Email**: confirmation, waitlist promotion, and reminders go through [Resend](https://resend.com) when `RESEND_API_KEY` is set. Otherwise they are **logged** (local stub). Magic links work the same way.
- **SMS**: not implemented (`TODO` in `src/lib/notify.ts` and `npm run reminders`).

## Privacy / pilot disclaimer

This is a **local village pilot**, not a production membership system.

- Guest contact information is for the **event host**, not a public directory.
- Optional street addresses on events are **host-only**.
- Do not store medical, financial, or other sensitive records here.
- There is no Helpful Village sync. Volunteer matching stays in Helpful Village.
- The SQLite file on your computer is the database. Back it up if you rely on the lists.
- **Do not deploy this build to Netlify, Vercel, or any public host** until auth, HTTPS, backups, and a real email domain are reviewed. The demo password is for local use only.

## Configuration

Copy `.env.example` to `.env`. Nothing secret belongs in git.

```
DATABASE_PATH=./data/spoke.db
APP_URL=http://localhost:3000
RESEND_API_KEY=
RESEND_FROM=SpokeRSVP <noreply@example.com>
REMINDER_SECRET=
```

`POST /api/reminders` with `Authorization: Bearer $REMINDER_SECRET` is an optional cron hook. Leave `REMINDER_SECRET` empty to keep that endpoint off; use `npm run reminders` instead.

## Tech

Next.js App Router, TypeScript, Tailwind CSS, Drizzle ORM, SQLite (`better-sqlite3`).

## License

Private village pilot code. Ask Mill Valley Village / Marin Villages before redistributing.
