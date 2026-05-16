# Team Task Manager (API + production bundle)

Full-stack app: Express + Prisma API here; React UI in `../frontend/`, built into `public/` for production.

## Features

- Signup and login with JWT
- Admin and member roles (app-wide and per-project)
- Projects, team invites by email, tasks with assignee, status, priority, due dates
- Dashboard summary (overdue, due soon, recent activity)
- Demo seed endpoint for walkthroughs

## Tech stack

- Backend: Express, TypeScript, Prisma, PostgreSQL
- Frontend: React, Vite, TypeScript, Tailwind (sibling `frontend/` package)

## Local setup

1. Install dependencies in **both** packages (from repository root):

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. Create `backend/.env` (see `.env.example`). Set `DATABASE_URL` and `JWT_SECRET`.

3. Apply migrations: `cd backend && npm run migrate:deploy`  
   For local development when you change the schema, use `npm run migrate:dev` (creates a new migration from Prisma).  
   To wipe the database and re-apply all migrations (destructive): `npm run migrate:reset`.

4. Run in development (API + Vite with proxy to the API):

   ```bash
   cd backend && npm run dev:all
   ```

   Or run `npm run dev` in `backend/` and `npm run dev` in `frontend/` in two terminals (frontend expects API on port 4000).

5. Production-style single server: `cd backend && npm run build && npm start` — serves API and static UI from `public/`.

## Database migrations

Migrations live in `prisma/migrations/`. Production runs **`prisma migrate deploy`** as a pre-deploy step (no `db push`).

- **`20250501000000_init`**: original tables (legacy enums `MemberRole`, `TaskStatus` TODO/…, `Task.createdById`, int `priority`).
- **`20250514180100_upgrade_legacy_to_v2`**: upgrades to the current app schema (`User.role`, `Task.creatorId`, enum priorities, etc.).

`prisma/legacy_baseline.prisma` is a frozen snapshot of that legacy shape, used only as documentation when authoring future diffs.

### Troubleshooting

- **P3018 / checksum errors** on an old migration: another machine may have applied different SQL. On a throwaway database, reset with `npm run migrate:reset` or recreate the Postgres database, then `migrate:deploy`.
- **`db:push` is still available** as `npm run db:push` for emergencies; prefer migrations so CI and production stay aligned.

## Scripts (this package)

| Script      | Purpose |
|------------|---------|
| `npm run dev` | API only (watch) |
| `npm run dev:all` | API + Vite (requires `../frontend` installed) |
| `npm run build` | Install/build frontend, then bundle API to `dist/` |
| `npm start` | run `dist/server.js` |
| `npm run migrate:dev` | Create/apply migrations in development |
| `npm run migrate:deploy` | Apply pending migrations (CI / production) |
| `npm run migrate:reset` | Drop data and re-apply all migrations |
| `npm run db:push` | Emergency schema push without migrations |

## Railway

1. In Railway, set the service **Root Directory** to `backend` (this folder).
2. Set `DATABASE_URL` to your actual database URL on the service — use the Neon URL if Neon is the database you want.
3. Set `JWT_SECRET` on the service.
4. Default Nixpacks flow: `npm install`, `npm run build`, `npm start` (see `railway.toml` here).

### If `prisma migrate deploy` fails with `P1000`

This means the `DATABASE_URL` on Railway does not match the attached Postgres service credentials.

1. Open the backend service in Railway.
2. Check the Variables tab and remove any manually typed `DATABASE_URL` that points to the wrong database.
3. Paste the correct Neon connection string into `DATABASE_URL` if Neon is your database.
4. Redeploy the backend after saving the variable changes.

## Demo flow

1. Sign up as Admin.
2. Use **Seed demo data** in the UI for sample project + tasks + demo member.
3. Demo member after seed: `member@demo.local` / `Demo123!`

## Submission links

Fill in as you deploy:

- Live application URL:
- GitHub repository URL:
- Demo video URL:
