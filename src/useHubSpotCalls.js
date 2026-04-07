import { useState, useEffect, useCallback, useRef } from 'react';

const DISPOSITION_MAP = {
  'a12225bd-f90c-43bb-aa10-4b7875a05937': 'Not Interested',
  '81180310-0202-4b44-8417-168bd57e399a': 'Meeting Booked',
  'fa4b685a-eb2a-4a5f-ac74-a8e8dde76558': 'Call me later',
  '95d90a61-32bf-4d8d-9445-010e6ce6a055': 'Account to Pursue',
  'f76aed06-41e0-4b55-8f96-361bfd09bf0c': 'Follow up - interested',
  'e9a4df2f-3fcd-4f8a-bbd8-7634e48ca97c': 'No longer at company',
  '91fd5005-2ed7-45dd-b8ec-f22511b5ece2': 'Wrong Contact - no referral',
  '72a50c73-0b12-4595-9c31-5f197913be05': 'Wrong contact - referral',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'Wrong number',
};

const OWNER_MAP = {
  '163308867': 'Brandon Liao',
  '162266623': 'Chuck Gartland',
};

const VALID_DISPOSITIONS = Object.keys(DISPOSITION_MAP);
const OWNER_IDS = Object.keys(OWNER_MAP);
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

function parseCall(raw) {
  const p = raw.properties || {};
  const ts = p.hs_timestamp || '';
  let date = '', time = '';
  if (ts) {
    const d = new Date(ts);
    date = d.toISOString().slice(0, 10);
    time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // Strip HTML from summary
  const summary = (p.hs_call_summary || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    id: raw.id,
    date,
    time,
    timestamp: ts,
    rep: OWNER_MAP[p.hubspot_owner_id] || 'Unknown',
    outcome: DISPOSITION_MAP[p.hs_call_disposition] || 'Unknown',
    durationMs: parseInt(p.hs_call_duration || '0', 10),
    notes: summary,
    transcript: p.hs_call_body || '',
    recordingUrl: p.hs_call_recording_url || '',
    hsUrl: `https://app.hubspot.com/calls/244248253/review/${raw.id}`,
  };
}

async function fetchCalls(token, afterTimestamp) {
  const properties = [
    'hs_call_body', 'hs_call_recording_url', 'hs_call_summary',
    'hs_call_disposition', 'hs_call_duration', 'hs_timestamp', 'hubspot_owner_id',
  ];

  // Build filter groups: one per owner (OR), each with disposition IN + duration >= 10s
  const filterGroups = OWNER_IDS.map(ownerId => {
    const filters = [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
      { propertyName: 'hs_call_disposition', operator: 'IN', values: VALID_DISPOSITIONS },
      { propertyName: 'hs_call_duration', operator: 'GTE', value: '10000' },
      { propertyName: 'hs_call_has_transcript', operator: 'EQ', value: 'true' },
    ];
    if (afterTimestamp) {
      filters.push({ propertyName: 'hs_timestamp', operator: 'GT', value: afterTimestamp });
    }
    return { filters };
  });

  const allResults = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch('/hubspot-api/crm/v3/objects/calls/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        filterGroups,
        properties,
        sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
        limit: 200,
        after: offset || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HubSpot API error: ${res.status}`);
    }

    const data = await res.json();
    allResults.push(...(data.results || []));

    if (data.paging?.next?.after) {
      offset = data.paging.next.after;
    } else {
      hasMore = false;
    }

    // Safety: don't fetch more than 1000 in one go
    if (allResults.length >= 1000) break;
  }

  return allResults.map(parseCall);
}

export default function useHubSpotCalls(token) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const latestTimestamp = useRef(null);

  // Full fetch (initial load)
  const fullFetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const results = await fetchCalls(token);
      setCalls(results);
      if (results.length > 0) {
        latestTimestamp.current = results[0].timestamp;
      }
      setLastSync(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Incremental fetch (poll for new calls)
  const pollForNew = useCallback(async () => {
    if (!token || !latestTimestamp.current) return;
    try {
      const newCalls = await fetchCalls(token, latestTimestamp.current);
      if (newCalls.length > 0) {
        setCalls(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const fresh = newCalls.filter(c => !existingIds.has(c.id));
          if (fresh.length === 0) return prev;
          latestTimestamp.current = fresh[0].timestamp;
          return [...fresh, ...prev];
        });
      }
      setLastSync(new Date());
    } catch (e) {
      console.warn('Poll failed:', e.message);
    }
  }, [token]);

  // Initial fetch when token is set
  useEffect(() => {
    if (token) fullFetch();
  }, [token, fullFetch]);

  // Poll every 2 minutes
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(pollForNew, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [token, pollForNew]);

  return { calls, loading, error, lastSync, refresh: fullFetch };
}
