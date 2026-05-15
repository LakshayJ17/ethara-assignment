import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Proxies /api/* from the Vercel frontend to the Railway (or other) backend.
 * Set BACKEND_URL in Vercel → Settings → Environment Variables, e.g.
 * https://your-service.up.railway.app
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const backend = (process.env.BACKEND_URL || process.env.VITE_API_URL || '').replace(/\/$/, '');

  if (!backend) {
    res.status(500).json({
      error:
        'BACKEND_URL is not set on Vercel. Add your Railway URL (no trailing slash) under Project → Settings → Environment Variables, then redeploy.'
    });
    return;
  }

  const segments = req.query.path;
  const pathPart = Array.isArray(segments) ? segments.join('/') : segments ?? '';
  const queryStart = req.url?.indexOf('?') ?? -1;
  const query = queryStart >= 0 ? req.url!.slice(queryStart) : '';
  const target = `${backend}/api/${pathPart}${query}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const method = req.method ?? 'GET';
  const init: RequestInit = { method, headers };

  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  try {
    const upstream = await fetch(target, init);
    const body = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });
    res.send(body);
  } catch (error) {
    res.status(502).json({
      error: 'Could not reach the backend API',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
