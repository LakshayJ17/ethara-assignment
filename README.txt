Team Task Manager (Ledger)
==========================

Full-stack app: React (Vite) + Express + PostgreSQL (Prisma). Users sign up, create projects, invite teammates by email, and manage tasks with Admin vs Member roles.

Local development
-----------------
Requirements: Node.js 20+, PostgreSQL (local or Docker).

1) Create backend/.env from backend/.env.example and set DATABASE_URL and JWT_SECRET.

2) From the repo root:
   npm install
   cd backend && npx prisma migrate dev && cd ..
   npm run dev

   (migrate dev creates/applies the database; in CI/production use: npm run db:migrate -w backend)

3) Open http://localhost:5173 (Vite proxies /api to the API on port 4000).

Production build (single origin)
--------------------------------
From repo root:
  npm install
  npm run build
  NODE_ENV=production npm start

The API serves the Vite build from frontend/dist when NODE_ENV=production.

Railway deployment (mandatory for submission)
--------------------------------------------
1) Create a new Railway project and add the PostgreSQL plugin.

2) Create a Web Service from this GitHub repo (root directory).

3) In the Web Service Variables, set:
   - DATABASE_URL = (copy from the Railway Postgres service, same as PG provides)
   - JWT_SECRET   = long random string
   - NODE_ENV     = production

4) Railway will use nixpacks.toml: install deps, run prisma migrate deploy, build frontend + backend, start the API.

5) After deploy, open the generated public URL and verify /api/health returns {"ok":true}.

Role rules (summary)
--------------------
- Admin: edit/delete project, manage members and roles, full task control, delete any task.
- Member: create tasks; assign only self; edit tasks they created or are assigned to; cannot reassign to others; cannot manage members or project settings.

Submission checklist
--------------------
[ ] Live URL works (signup, login, projects, tasks)
[ ] GitHub repo is public or shared with reviewers
[ ] README.txt updated with your URLs
[ ] Demo video uploaded per assignment portal
