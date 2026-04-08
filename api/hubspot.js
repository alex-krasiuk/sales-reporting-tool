export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract the HubSpot path from query param
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path query param' });

  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });

  const url = `https://api.hubapi.com${path}`;

  try {
    const fetchOpts = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
      },
    };
    if (req.method === 'POST' && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const hsRes = await fetch(url, fetchOpts);
    const data = await hsRes.json();
    res.status(hsRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
