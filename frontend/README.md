# Team Task Manager (frontend)

Vite + React client. In development it proxies `/api` to `http://localhost:4000` (run the backend from `../backend`).

## Setup

```bash
npm install
npm run dev
```

Ensure the API is running (see `../backend/README.md`). Open the URL Vite prints (port 5173).

## Production build

Normally you run `npm run build` from **backend**, which installs dependencies here and runs this package’s `vite build`, outputting static files to `../backend/public/`.
