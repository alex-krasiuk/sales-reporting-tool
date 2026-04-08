// Routes HubSpot API calls through the right proxy
// Dev: Vite proxy at /hubspot-api/...
// Prod: Vercel serverless function at /api/hubspot?path=...

const isDev = import.meta.env.DEV;

export async function hsApiFetch(path, token, options = {}) {
  const method = options.method || 'GET';
  const url = isDev
    ? `/hubspot-api${path}`
    : `/api/hubspot?path=${encodeURIComponent(path)}`;

  const fetchOpts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (options.body) {
    fetchOpts.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HubSpot API ${res.status}: ${path}`);
  }
  return res.json();
}
