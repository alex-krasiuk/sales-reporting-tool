import { useState, useEffect, useCallback, useRef } from 'react';
import { hsApiFetch } from './hsApi.js';

const DISPOSITION_MAP = {
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'Busy',
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  '348880cf-1981-4671-b4de-0645d5926dfa': 'Connected : Confirmed Meeting',
  'af0d4f3e-13fd-4917-8242-b32daaad5fd8': 'Connected : Demo Set',
  '79ce9f07-ff5f-4f17-ba9e-01d8d8838c75': 'Connected : No Longer With Company',
  '91fd5005-2ed7-45dd-b8ec-f22511b5ece2': 'Connected : Not Decision Maker',
  '63c120ab-9172-4cc9-92d5-73628674759a': 'Connected : Opt Out',
  '7b8d1d5e-9280-44c2-b201-3bd47709b716': 'Connected Negative - Competitor',
  'c8d1d5f1-fa74-4b16-8973-ef69bb98c3e5': 'Connected Negative - Homegrown',
  '38cfbd27-abc5-4e34-aa18-2f95d0446518': 'Connected Negative - Other',
  '5a19720c-f6a2-4d55-b260-d37f955f1316': 'Connected Negative - Timing',
  'c9d83dd7-08e6-4fa6-abf8-f00768c1a23e': 'Connected Positive : Add To Strat',
  '255a94e1-a80f-4799-b533-0d46e9e83732': 'Connected Positive : Call Later',
  '6e91ac09-47aa-4071-b418-837a389c9b18': 'Connected Positive : Follow-Up (PS)',
  'eeda19de-af72-47f6-820e-7a3348267d16': 'Hung Up',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff': 'Left live message',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'Left voicemail',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'No answer',
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
    const body = {
      filterGroups,
      properties,
      sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
      limit: 200,
      after: offset || undefined,
    };
    const data = await hsApiFetch('/crm/v3/objects/calls/search', token, { method: 'POST', body });
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
