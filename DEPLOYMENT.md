# Deployment Guide

## Frontend Deployment (Vercel)

The frontend is already configured to deploy on Vercel at: https://ethara-assignment-frontend.vercel.app/

If signup shows `NOT_FOUND` on `/api/auth/signup`, the Vercel project is not seeing the API proxy route. This repo now includes a root-level proxy at `api/[...path].ts` so the route works whether the Vercel root is the repository root or the `frontend` folder.

### Setup Instructions:

1. **Environment Variables on Vercel**:
   - Go to your Vercel project settings
   - Recommended: add `VITE_API_URL=https://backend-production-20c3.up.railway.app`
   - If you use `VITE_API_URL`, make sure it is not empty and has no trailing slash
   - Optional: add `BACKEND_URL=https://backend-production-20c3.up.railway.app` if you still use the Vercel API proxy route

2. **If you still see `NOT_FOUND`**:
   - Redeploy the Vercel project after this commit.
   - Make sure the project root contains the `api` folder from this repo if you rely on the proxy route.
   - If your Vercel project root is `frontend`, keep the existing `frontend/api/[...path].ts` route.
   - If your Vercel project root is the repository root, the new top-level `api/[...path].ts` route will handle `/api/*`.

3. **Auto-deployment**:
   - Changes pushed to the main/master branch will automatically deploy
   - Vercel will build and deploy the frontend automatically

## Backend Deployment (Railway)

The backend can be deployed to Railway or any other Node.js hosting service.

### Setup Instructions:

1. **Environment Variables**:
   - `JWT_SECRET`: A secure random string for JWT signing
   - `DATABASE_URL`: Your PostgreSQL connection string (use the Neon URL here if Neon is your database)
   - `PORT`: Default is 4000

2. **Deploy to Railway**:
   - Open your Railway service
   - Set the service root directory to `backend`
   - Connect the GitHub repo and redeploy from the latest `main` branch
   - Add the environment variables above if they are missing
   - If you want Neon, paste the Neon connection string into `DATABASE_URL` and remove any Railway Postgres override
   - Railway will run `npm install`, `npm run build`, then `npm start` using `backend/package.json`

3. **Get Backend URL**:
   - Once deployed, you'll get a Railway URL like `https://your-service.up.railway.app`
   - Set this as `VITE_API_URL` in your Vercel project
   - If you keep the Vercel proxy route, set `BACKEND_URL` to the same Railway URL as well

## Local Development

### Backend:
```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:4000`

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

The dev server automatically proxies `/api` requests to `http://localhost:4000`

## CORS Configuration

The backend CORS settings allow:
- `http://localhost:5173` (local frontend dev)
- `http://localhost:3000` (alternative local port)
- `https://ethara-assignment-frontend.vercel.app` (Vercel frontend)

The backend also allows `https://*.vercel.app` origins (preview deployments).

You can add extra origins with `CORS_ORIGINS` on Railway (comma-separated), for example:
- `CORS_ORIGINS=https://my-custom-domain.com,https://app.example.com`

Additional domains can be added in `backend/src/server.ts` in the `corsOrigins` array.

## 404/CORS Troubleshooting (Important)

If browser logs show 404 for `/api/*` on Railway and CORS blocked from Vercel:

1. Confirm Railway URL is the API service, not a static frontend service.
2. Open these checks in browser or curl:
   - `https://<railway-backend-url>/api/health`
   - `https://<railway-backend-url>/api/version`
3. In Railway service settings, set root directory to `backend`.
4. In Vercel frontend settings:
   - Keep `VITE_API_URL=https://<railway-backend-url>` (no trailing slash)
   - Optional: set `BACKEND_URL=https://<railway-backend-url>` if you want the Vercel `/api/*` proxy to work too
5. Redeploy Railway and Vercel.

## Railway Redeploy Checklist

Use this when the live backend is behind the code in this repo:

1. In Railway, open the backend service.
2. Confirm the root directory is `backend`.
3. Add or verify `DATABASE_URL`, `JWT_SECRET`, and `PORT`.
4. Trigger a new deploy from the latest `main` commit.
5. After deploy, verify these endpoints in a browser or curl:
   - `/api/health`
   - `/api/version`
   - `/api/auth/signup`
   - `/api/auth/register`
   - `/api/dashboard/summary`
6. If any of those still return 404, Railway is still pointing at an old or wrong service.

## Features Implemented

✅ **Dark/Light Mode**: Toggle theme using the sun/moon icon in the sidebar
✅ **Refresh Button**: Dashboard has a refresh button to reload data
✅ **CORS Fixed**: Frontend can connect to backend on any configured domain
✅ **Connected Frontend**: https://ethara-assignment-frontend.vercel.app/
