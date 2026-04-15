import { useState, useMemo } from "react";
import { CALL_DATA as LEGACY_DATA } from "./callData.js";
import { ALL_CALLS, SYNC_META } from "./allCallData.js";

// Merge: legacy has rich fields, new data fills gaps
const legacyById = Object.fromEntries(LEGACY_DATA.map(c => [c.id, c]));
const CALL_DATA = ALL_CALLS
  .filter(c => c.isConnect)
  .map(c => {
    const legacy = legacyById[c.id];
    if (legacy) return legacy;
    return {
      id: c.id, date: c.date, time: c.time, timestamp: c.timestamp,
      rep: c.rep, outcome: c.outcome, vertical: c.vertical || c.industry || '',
      title: c.title || '', contactName: c.contactName || '',
      company: c.company || '',
      durationMs: c.durationMs, transcript: c.transcript || '',
      recordingUrl: c.recordingUrl || '', hsUrl: c.hsUrl || '',
      persona: c.persona || '',
      iceBreaker: c.iceBreaker || { text: '', success: false },
      hook: c.hook || { text: '', success: false },
      objection: c.objection || { text: 'None', success: 'NONE' },
      tags: [],
    };
  });

const OUTCOME_COLORS = {
  'Not Interested':              { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  'Meeting Booked':              { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e' },
  'Follow up - interested':      { bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6' },
  'Call me later':               { bg: '#fef3c7', text: '#d97706', dot: '#f59e0b' },
  'Account to Pursue':           { bg: '#f0fdf4', text: '#15803d', dot: '#4ade80' },
  'Connected':                   { bg: '#ede9fe', text: '#7c3aed', dot: '#8b5cf6' },
  'Busy':                        { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'No longer at company':        { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
  'Wrong Contact - no referral': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Wrong contact - referral':    { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Wrong number':                { bg: '#e5e7eb', text: '#6b7280', dot: '#9ca3af' },
};

const fmtDuration = (ms) => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

const pacificNow = () => new Date(Date.now() - 7 * 60 * 60 * 1000);

export default function CallAnalytics() {
  const [rows] = useState(CALL_DATA);
  const [search, setSearch] = useState('');
  const pacificToday = pacificNow().toISOString().slice(0, 10);
  const [filterDateFrom, setFilterDateFrom] = useState(pacificToday);
  const [filterDateTo, setFilterDateTo] = useState(pacificToday);
  const [filterOutcome, setFilterOutcome] = useState('All');
  const [filterRep, setFilterRep] = useState('All');
  const [expandedRow, setExpandedRow] = useState(null);

  // All dials in date range (for funnel)
  const allDials = useMemo(() => ALL_CALLS.filter(d =>
    d.date >= filterDateFrom && d.date <= filterDateTo
  ), [filterDateFrom, filterDateTo]);

  // Filtered connected calls
  const filtered = useMemo(() => {
    return rows.filter(row => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        row.outcome?.toLowerCase().includes(q) ||
        row.rep?.toLowerCase().includes(q) ||
        row.contactName?.toLowerCase().includes(q) ||
        row.title?.toLowerCase().includes(q) ||
        row.company?.toLowerCase().includes(q) ||
        row.transcript?.toLowerCase().includes(q);
      const matchDateFrom = !filterDateFrom || row.date >= filterDateFrom;
      const matchDateTo = !filterDateTo || row.date <= filterDateTo;
      const matchOutcome = filterOutcome === 'All' || row.outcome === filterOutcome;
      const matchRep = filterRep === 'All' || row.rep === filterRep;
      return matchSearch && matchDateFrom && matchDateTo && matchOutcome && matchRep;
    });
  }, [rows, search, filterDateFrom, filterDateTo, filterOutcome, filterRep]);

  // Full funnel stats
  const funnel = useMemo(() => {
    const dials = allDials.length;
    const connects = allDials.filter(d => d.isConnect).length;
    const convos = allDials.filter(d => d.isConversation).length;
    const meetings = allDials.filter(d => d.isMeeting).length;
    const followUps = allDials.filter(d => d.outcome === 'Follow up - interested').length;
    const notInterested = allDials.filter(d => d.outcome === 'Not Interested').length;
    const cr = dials ? (connects / dials * 100).toFixed(1) : '0';
    return { dials, connects, convos, meetings, followUps, notInterested, cr };
  }, [allDials]);

  // Unique values for filters
  const reps = useMemo(() => ['All', ...new Set(rows.map(r => r.rep))], [rows]);
  const outcomes = ['All', 'Meeting Booked', 'Follow up - interested', 'Account to Pursue', 'Not Interested', 'Connected', 'Busy', 'Call me later', 'Wrong number', 'Wrong contact - referral', 'No longer at company'];

  // Date presets
  const mondayStr = (() => { const d = pacificNow(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d.toISOString().slice(0, 10); })();
  const yesterdayStr = (() => { const d = pacificNow(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  const syncAge = SYNC_META?.syncedAt
    ? `Synced: ${new Date(SYNC_META.syncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ── Header: Funnel Cards ── */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { label: 'Dials', value: funnel.dials, color: '#6b7280' },
          { label: 'Connects', value: funnel.connects, sub: `${funnel.cr}%`, color: '#4f46e5' },
          { label: 'Convos (>1m)', value: funnel.convos, color: '#2563eb' },
          { label: 'Meetings', value: funnel.meetings, color: '#16a34a' },
          { label: 'Follow Ups', value: funnel.followUps, color: '#0891b2' },
          { label: 'Not Interested', value: funnel.notInterested, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{ background: s.color + '08', border: `1px solid ${s.color}22`, borderRadius: 9, padding: '8px 16px', textAlign: 'center', minWidth: 80, flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginTop: 2, opacity: 0.7 }}>{s.sub}</div>}
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, whiteSpace: 'nowrap' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#b0b0b0' }}>{syncAge}</span>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: '#374151' }} />
        <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: '#374151' }} />
        {[
          ['Today', pacificToday, pacificToday],
          ['Yesterday', yesterdayStr, yesterdayStr],
          ['This Week', mondayStr, pacificToday],
          ['All Time', SYNC_META?.dateRange?.from || '2026-02-01', pacificToday],
        ].map(([label, from, to]) => (
          <button key={label} onClick={() => { setFilterDateFrom(from); setFilterDateTo(to); }} style={{
            background: filterDateFrom === from && filterDateTo === to ? '#eef2ff' : '#f3f4f6',
            border: `1px solid ${filterDateFrom === from && filterDateTo === to ? '#c7d2fe' : '#e5e7eb'}`,
            borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#374151',
            fontWeight: filterDateFrom === from && filterDateTo === to ? 700 : 400,
          }}>{label}</button>
        ))}
        <div style={{ width: 1, height: 24, background: '#e5e7eb', margin: '0 4px' }} />
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 12px', fontSize: 13, width: 200, outline: 'none' }}
        />
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: '#374151' }}>
          {outcomes.map(o => <option key={o}>{o === 'All' ? 'All Outcomes' : o}</option>)}
        </select>
        <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: '#374151' }}>
          {reps.map(r => <option key={r}>{r === 'All' ? 'All Reps' : r}</option>)}
        </select>
        {(search || filterOutcome !== 'All' || filterRep !== 'All' || filterDateFrom !== pacificToday || filterDateTo !== pacificToday) && (
          <button onClick={() => { setSearch(''); setFilterOutcome('All'); setFilterRep('All'); setFilterDateFrom(pacificToday); setFilterDateTo(pacificToday); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{filtered.length} calls</span>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              {['Date', 'Time', 'Rep', 'Contact', 'Company', 'Outcome', 'Duration', 'Transcript', 'Links'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb', ...(h === 'Transcript' ? { minWidth: 300 } : {}) }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const oc = OUTCOME_COLORS[row.outcome] || { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' };
              return (
                <tr key={row.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>{row.date}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>{row.time}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#4f46e5', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {row.rep.split(' ').map(w => w[0]).join('')}
                      </div>
                      {row.rep.split(' ')[0]}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}>
                    {row.contactName ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{row.contactName}</div>
                        {row.title && <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>{row.title}</div>}
                      </div>
                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
                    {row.company || row.vertical || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ background: oc.bg, color: oc.text, borderRadius: 5, padding: '3px 9px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: oc.dot, flexShrink: 0 }} />
                      {row.outcome}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: '#6b7280', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' }}>
                    {fmtDuration(row.durationMs)}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 400, borderBottom: '1px solid #f3f4f6' }}>
                    {row.transcript && row.transcript.length > 50 ? (
                      <div>
                        <div style={{
                          overflow: expandedRow === row.id ? 'visible' : 'hidden',
                          display: expandedRow === row.id ? 'block' : '-webkit-box',
                          WebkitLineClamp: expandedRow === row.id ? undefined : 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.6', fontSize: 11,
                        }}>
                          {row.transcript.split('\n').map((line, li) => {
                            const repMatch = line.match(/^(.+?)\s*\((Rep)\):\s*(.*)$/);
                            const prospMatch = line.match(/^(.+?)\s*\((Prospect)\):\s*(.*)$/);
                            if (repMatch) return <div key={li} style={{ marginBottom: 2 }}><span style={{ color: '#4f46e5', fontWeight: 600, fontSize: 10 }}>{repMatch[1]}:</span> {repMatch[3]}</div>;
                            if (prospMatch) return <div key={li} style={{ marginBottom: 2 }}><span style={{ color: '#059669', fontWeight: 600, fontSize: 10 }}>{prospMatch[1]}:</span> {prospMatch[3]}</div>;
                            return line ? <div key={li} style={{ color: '#6b7280' }}>{line}</div> : null;
                          })}
                        </div>
                        <button onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 11, padding: 0, marginTop: 2 }}>
                          {expandedRow === row.id ? 'collapse' : 'expand'}
                        </button>
                      </div>
                    ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {row.recordingUrl && (
                        <a href={row.recordingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}>
                          Listen
                        </a>
                      )}
                      <a href={row.hsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 11 }}>
                        HubSpot
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', fontSize: 14 }}>
                  No calls match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
