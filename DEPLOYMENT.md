# Deployment Guide

## Frontend Deployment (Vercel)

The frontend is already configured to deploy on Vercel at: https://ethara-assignment-frontend.vercel.app/

### Setup Instructions:

1. **Environment Variables on Vercel**:
   - Go to your Vercel project settings
   - Add the following environment variable:
     - `BACKEND_URL`: The URL of your backend API (e.g., `https://your-backend.up.railway.app`)
   - No trailing slash on the URL

2. **Auto-deployment**:
   - Changes pushed to the main/master branch will automatically deploy
   - Vercel will build and deploy the frontend automatically

## Backend Deployment (Railway)

The backend can be deployed to Railway or any other Node.js hosting service.

### Setup Instructions:

1. **Environment Variables**:
   - `JWT_SECRET`: A secure random string for JWT signing
   - `DATABASE_URL`: PostgreSQL connection string
   - `PORT`: Default is 4000

2. **Deploy to Railway**:
   - Connect your GitHub repository to Railway
   - Set the environment variables
   - Railway will automatically deploy

3. **Get Backend URL**:
   - Once deployed, you'll get a Railway URL like `https://your-service.up.railway.app`
   - Set this as `BACKEND_URL` in your Vercel project

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
   - Keep `BACKEND_URL=https://<railway-backend-url>` (no trailing slash)
   - Remove `VITE_API_URL` for production so frontend uses same-origin `/api` proxy.
5. Redeploy Railway and Vercel.

## Features Implemented

✅ **Dark/Light Mode**: Toggle theme using the sun/moon icon in the sidebar
✅ **Refresh Button**: Dashboard has a refresh button to reload data
✅ **CORS Fixed**: Frontend can connect to backend on any configured domain
✅ **Connected Frontend**: https://ethara-assignment-frontend.vercel.app/
