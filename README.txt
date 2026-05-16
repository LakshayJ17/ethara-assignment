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

Production build
----------------
Backend deploys from `backend/`.
Frontend deploys from `frontend/`.

Backend (Railway):
   cd backend
   railway up

Frontend (Vercel):
   set `VITE_API_URL` to the Railway backend URL and redeploy.

Railway deployment
------------------
1) Open the Railway backend service.
2) Set the service root to `backend`.
3) Add `DATABASE_URL` and `JWT_SECRET`.
4) Run `railway up` from `backend/`.
5) Verify `/api/health` returns `{\"ok\":true}`.

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
