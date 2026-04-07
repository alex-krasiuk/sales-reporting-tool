import { useState, useMemo, useEffect } from "react";
import { CALL_DATA } from "./callData.js";
import useHubSpotCalls from "./useHubSpotCalls.js";

const OUTCOME_COLORS = {
  'Not Interested':        { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  'Meeting Booked':        { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e' },
  'Follow up - interested':{ bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6' },
  'Call me later':         { bg: '#fef3c7', text: '#d97706', dot: '#f59e0b' },
  'Account to Pursue':    { bg: '#f0fdf4', text: '#15803d', dot: '#4ade80' },
  'No longer at company':  { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};

const TAG_COLORS = {
  'Not the decision maker':   { bg: '#fef3c7', text: '#92400e' },
  'Already has solution':     { bg: '#dbeafe', text: '#1e40af' },
  'No budget':                { bg: '#fee2e2', text: '#991b1b' },
  'Bad timing':               { bg: '#fce7f3', text: '#9d174d' },
  'No need/pain':             { bg: '#f3f4f6', text: '#374151' },
  'Hung up / cut off':        { bg: '#fecaca', text: '#dc2626' },
  'Wants email/info first':   { bg: '#e0e7ff', text: '#3730a3' },
  'Gatekeeper block':         { bg: '#fed7aa', text: '#9a3412' },
  'Too busy right now':       { bg: '#fef9c3', text: '#854d0e' },
  'Left company/wrong person':{ bg: '#e5e7eb', text: '#6b7280' },
  'Positive - meeting set':   { bg: '#dcfce7', text: '#166534' },
  'Positive - follow up':     { bg: '#d1fae5', text: '#065f46' },
  'Positive - interest shown':{ bg: '#cffafe', text: '#155e75' },
};

// --- Helpers ---
const fmtDuration = (ms) => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const TH = ({ children, style = {} }) => (
  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb', ...style }}>
    {children}
  </th>
);

const TD = ({ children, style = {} }) => (
  <td style={{ padding: '10px 14px', verticalAlign: 'top', fontSize: 13, color: '#1f2937', borderBottom: '1px solid #f3f4f6', ...style }}>
    {children}
  </td>
);

// --- Main Component ---
export default function CallAnalytics() {
  const [hsToken, setHsToken] = useState(() => localStorage.getItem('hs_token') || '');
  const [showHsInput, setShowHsInput] = useState(false);
  const { calls: liveCalls, loading: hsLoading, error: hsError, lastSync, refresh } = useHubSpotCalls(hsToken);

  // Use live data if available, fall back to static
  const [rows, setRows] = useState(CALL_DATA);
  useEffect(() => {
    if (liveCalls.length > 0) setRows(liveCalls);
  }, [liveCalls]);

  const [customCols, setCustomCols] = useState([]);
  const [search, setSearch] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('All');
  const [filterRep, setFilterRep] = useState('All');
  const [filterVertical, setFilterVertical] = useState('All');
  const [filterTag, setFilterTag] = useState('All');
  const [tags, setTags] = useState({});  // callId -> [tag1, tag2, ...]
  const [taggingProgress, setTaggingProgress] = useState(null); // null | { done, total }
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [colForm, setColForm] = useState({ name: '', type: 'ai', prompt: '', formula: '' });
  const [processing, setProcessing] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [apiError, setApiError] = useState('');

  // Stats
  const stats = useMemo(() => {
    const total = rows.length;
    const notInterested = rows.filter(r => r.outcome === 'Not Interested').length;
    const meetingBooked = rows.filter(r => r.outcome === 'Meeting Booked').length;
    const followUp = rows.filter(r => r.outcome === 'Follow up - interested').length;
    const withRecording = rows.filter(r => r.recordingUrl).length;
    const withTranscript = rows.filter(r => r.transcript && r.transcript.length > 50).length;
    const avgMs = rows.reduce((a, r) => a + r.durationMs, 0) / total;
    const avgSec = Math.round(avgMs / 1000);
    return { total, notInterested, meetingBooked, followUp, withRecording, withTranscript, avgSec };
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    return rows.filter(row => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        row.outcome?.toLowerCase().includes(q) ||
        row.rep?.toLowerCase().includes(q) ||
        row.contactName?.toLowerCase().includes(q) ||
        row.title?.toLowerCase().includes(q) ||
        row.transcript?.toLowerCase().includes(q) ||
        row.date?.includes(q) ||
        row.id.includes(q);
      const matchOutcome = filterOutcome === 'All' || row.outcome === filterOutcome;
      const matchRep = filterRep === 'All' || row.rep === filterRep;
      const matchVertical = filterVertical === 'All' || row.vertical === filterVertical;
      const matchTag = filterTag === 'All' || (tags[row.id] && tags[row.id].includes(filterTag));
      return matchSearch && matchOutcome && matchRep && matchVertical && matchTag;
    });
  }, [rows, search, filterOutcome, filterRep, filterVertical, filterTag, tags]);

  // Unique reps and verticals for filters
  const reps = useMemo(() => ['All', ...new Set(rows.map(r => r.rep))], [rows]);
  const verticals = useMemo(() => ['All', ...new Set(rows.map(r => r.vertical).filter(Boolean).sort())], [rows]);
  const allTags = useMemo(() => {
    const s = new Set();
    Object.values(tags).forEach(arr => arr.forEach(t => s.add(t)));
    return ['All', ...Array.from(s).sort()];
  }, [tags]);

  // Analyze all calls with transcripts
  const analyzeAllCalls = async () => {
    if (!apiKey) { setApiError('Set your Anthropic API key first'); return; }
    const toAnalyze = rows.filter(r => r.transcript && r.transcript.length > 100 && !tags[r.id]);
    if (toAnalyze.length === 0) return;
    setTaggingProgress({ done: 0, total: toAnalyze.length });
    const tagList = Object.keys(TAG_COLORS).join(', ');
    const newTags = { ...tags };
    for (let i = 0; i < toAnalyze.length; i++) {
      const row = toAnalyze[i];
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 150,
            messages: [{ role: 'user', content: `Analyze this cold call transcript and pick 1-3 tags that best describe what happened. Only use tags from this list: ${tagList}\n\nCall outcome: ${row.outcome}\nTranscript:\n${row.transcript.slice(0, 2000)}\n\nReturn ONLY the tags, one per line. No bullets, no explanation.` }]
          })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        const parsed = text.split('\n').map(l => l.trim()).filter(l => TAG_COLORS[l]);
        newTags[row.id] = parsed.length > 0 ? parsed : ['No need/pain'];
      } catch (e) {
        if (i === 0) { setApiError(`Tag analysis failed: ${e.message}`); setTaggingProgress(null); return; }
        newTags[row.id] = ['Error'];
      }
      setTags({ ...newTags });
      setTaggingProgress({ done: i + 1, total: toAnalyze.length });
    }
    setTaggingProgress(null);
  };

  // Export CSV
  const exportCSV = () => {
    const baseHeaders = ['Call ID', 'Date', 'Time', 'Rep', 'Contact', 'Title', 'Outcome', 'Vertical', 'Duration (s)', 'Tags', 'Transcript', 'Recording URL', 'HubSpot URL'];
    const customHeaders = customCols.map(c => c.name);
    const headers = [...baseHeaders, ...customHeaders];
    const csvRows = rows.map(r => {
      const base = [
        r.id, r.date, r.time, r.rep, r.contactName || '', r.title || '', r.outcome, r.vertical || '',
        Math.round(r.durationMs / 1000),
        `"${(tags[r.id] || []).join('; ')}"`,
        `"${(r.transcript || '').replace(/"/g, '""')}"`,
        r.recordingUrl || '',
        r.hsUrl || '',
      ];
      const custom = customCols.map(c => `"${(r[c.key] || '').replace(/"/g, '""')}"`);
      return [...base, ...custom].join(',');
    });
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-analytics-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Run AI column
  const addAIColumn = async (colName, prompt) => {
    setApiError('');
    const key = 'ai_' + colName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    setProcessing(colName);
    setProcessingProgress(0);
    const updatedRows = rows.map(r => ({ ...r }));

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
              role: 'user',
              content: `You are analyzing a cold call record for a B2B sales team (RunBook — AP automation for logistics companies). ${prompt}\n\nCall data:\n- Outcome: ${row.outcome}\n- Duration: ${fmtDuration(row.durationMs)}\n- Contact: ${row.contactName || 'Unknown'} (${row.title || 'Unknown title'})\n- Transcript: ${row.transcript ? row.transcript.slice(0, 2000) : '(no transcript)'}\n\nRespond with ONLY the answer. Be concise (max 1-2 sentences, or a single word/phrase if that's all that's needed).`
            }]
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        updatedRows[i][key] = data.content?.[0]?.text?.trim() || '—';
      } catch (e) {
        updatedRows[i][key] = `Error: ${e.message}`;
        if (i === 0) {
          setApiError(`API error: ${e.message}`);
          setProcessing(null);
          return;
        }
      }
      setProcessingProgress(Math.round(((i + 1) / updatedRows.length) * 100));
      setRows([...updatedRows]);
    }

    setCustomCols(prev => [...prev, { name: colName, key, type: 'ai' }]);
    setProcessing(null);
    setProcessingProgress(0);
  };

  // Formula column
  const addFormulaColumn = (colName, formula) => {
    const key = 'fx_' + colName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const updatedRows = rows.map(row => {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('row', 'fmtDuration', `"use strict"; return (${formula})`);
        const result = fn(row, fmtDuration);
        return { ...row, [key]: result == null ? '—' : String(result) };
      } catch (e) {
        return { ...row, [key]: `Error: ${e.message}` };
      }
    });
    setRows(updatedRows);
    setCustomCols(prev => [...prev, { name: colName, key, type: 'formula' }]);
  };

  const handleAddColumn = () => {
    if (!colForm.name.trim()) return;
    if (colForm.type === 'ai') {
      if (!apiKey.trim()) { setApiError('Please enter your Anthropic API key to use AI columns.'); return; }
      if (!colForm.prompt.trim()) return;
      addAIColumn(colForm.name.trim(), colForm.prompt.trim());
    } else {
      if (!colForm.formula.trim()) return;
      addFormulaColumn(colForm.name.trim(), colForm.formula.trim());
    }
    setShowModal(false);
    setColForm({ name: '', type: 'ai', prompt: '', formula: '' });
  };

  const deleteCustomCol = (keyToDelete) => {
    setCustomCols(prev => prev.filter(c => c.key !== keyToDelete));
    setRows(prev => prev.map(row => {
      const r = { ...row };
      delete r[keyToDelete];
      return r;
    }));
  };

  // ---- RENDER ----
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📞</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>Call Analytics</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {rows.length} calls · {hsToken ? (hsLoading ? 'Syncing...' : lastSync ? `Live · Last sync ${lastSync.toLocaleTimeString()}` : 'Connecting...') : 'Static data · Set HubSpot token for live sync'}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* HubSpot token */}
        <div style={{ position: 'relative' }}>
          {showHsInput ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="password"
                placeholder="pat-na2-..."
                value={hsToken}
                onChange={e => setHsToken(e.target.value)}
                autoFocus
                style={{ border: '1px solid #f97316', borderRadius: 7, padding: '6px 11px', fontSize: 13, width: 200, outline: 'none' }}
              />
              <button onClick={() => { localStorage.setItem('hs_token', hsToken); setShowHsInput(false); }} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Save</button>
            </div>
          ) : (
            <button
              onClick={() => setShowHsInput(true)}
              style={{
                background: hsToken ? '#dcfce7' : '#fefce8',
                color: hsToken ? '#166534' : '#713f12',
                border: `1px solid ${hsToken ? '#86efac' : '#fde68a'}`,
                borderRadius: 7, padding: '6px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              {hsToken ? 'HubSpot ✓' : 'Set HubSpot Token'}
            </button>
          )}
        </div>

        {hsToken && (
          <button onClick={refresh} disabled={hsLoading} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 13px', fontSize: 13, cursor: hsLoading ? 'not-allowed' : 'pointer', fontWeight: 600, color: '#374151' }}>
            {hsLoading ? 'Syncing...' : '↻ Sync'}
          </button>
        )}

        {/* API Key button */}
        <div style={{ position: 'relative' }}>
          {showApiInput ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="password"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setApiError(''); }}
                autoFocus
                style={{ border: '1px solid #c4b5fd', borderRadius: 7, padding: '6px 11px', fontSize: 13, width: 230, outline: 'none' }}
              />
              <button onClick={() => setShowApiInput(false)} style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Save</button>
            </div>
          ) : (
            <button
              onClick={() => setShowApiInput(true)}
              style={{
                background: apiKey ? '#dcfce7' : '#fefce8',
                color: apiKey ? '#166534' : '#713f12',
                border: `1px solid ${apiKey ? '#86efac' : '#fde68a'}`,
                borderRadius: 7, padding: '6px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5
              }}
            >
              🔑 {apiKey ? 'API Key ✓' : 'Set API Key'}
            </button>
          )}
        </div>

        <button onClick={exportCSV} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}>
          ↓ Export CSV
        </button>
      </div>

      {/* ── Stats Bar ── */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, overflowX: 'auto' }}>
        {[
          { label: 'Total Calls', value: stats.total, color: '#4f46e5', icon: '📞' },
          { label: 'Not Interested', value: stats.notInterested, color: '#dc2626', icon: '❌' },
          { label: 'Meeting Booked', value: stats.meetingBooked, color: '#16a34a', icon: '✅' },
          { label: 'Follow Up', value: stats.followUp, color: '#2563eb', icon: '🔄' },
          { label: 'Avg Duration', value: `${Math.floor(stats.avgSec / 60)}m ${stats.avgSec % 60}s`, color: '#7c3aed', icon: '⏱' },
          { label: 'Book Rate', value: `${Math.round((stats.meetingBooked / stats.total) * 100)}%`, color: '#0891b2', icon: '📊' },
          { label: 'w/ Transcript', value: stats.withTranscript, color: '#059669', icon: '📝' },
        ].map(s => (
          <div key={s.label} style={{ background: s.color + '08', border: `1px solid ${s.color}22`, borderRadius: 9, padding: '7px 14px', textAlign: 'center', minWidth: 90, flexShrink: 0 }}>
            <div style={{ fontSize: 11, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, alignItems: 'center' }}>
        <input
          placeholder="🔍  Search notes, outcome, rep..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 12px', fontSize: 13, width: 260, outline: 'none' }}
        />
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {['All', 'Not Interested', 'Meeting Booked', 'Follow up - interested', 'Call me later', 'Account to Pursue', 'No longer at company'].map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {reps.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {verticals.map(v => <option key={v} value={v}>{v === 'All' ? 'All Verticals' : v}</option>)}
        </select>
        {allTags.length > 1 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
            {allTags.map(t => <option key={t} value={t}>{t === 'All' ? 'All Tags' : t}</option>)}
          </select>
        )}
        {(search || filterOutcome !== 'All' || filterRep !== 'All' || filterVertical !== 'All' || filterTag !== 'All') && (
          <button onClick={() => { setSearch(''); setFilterOutcome('All'); setFilterRep('All'); setFilterVertical('All'); setFilterTag('All'); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>✕ Clear</button>
        )}
        <button
          onClick={analyzeAllCalls}
          disabled={!!taggingProgress || !apiKey}
          style={{ background: taggingProgress ? '#e5e7eb' : 'linear-gradient(135deg, #f59e0b, #ef4444)', color: taggingProgress ? '#9ca3af' : 'white', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, cursor: taggingProgress ? 'not-allowed' : 'pointer', fontWeight: 700 }}
        >
          {taggingProgress ? `Tagging ${taggingProgress.done}/${taggingProgress.total}...` : `🏷 Analyze Objections${!apiKey ? ' (need API key)' : ''}`}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {filtered.length} of {rows.length} calls {filtered.length !== rows.length && '(filtered)'}
          {Object.keys(tags).length > 0 && ` · ${Object.keys(tags).length} tagged`}
        </span>
        {processing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ede9fe', borderRadius: 7, padding: '6px 12px' }}>
            <div style={{ width: 120, height: 6, background: '#ddd6fe', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${processingProgress}%`, background: '#7c3aed', transition: 'width 0.3s', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>🤖 {processing} — {processingProgress}%</span>
          </div>
        )}
        {(apiError || hsError) && (
          <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 7, padding: '6px 12px', fontSize: 12, maxWidth: 400 }}>
            ⚠️ {apiError || hsError} <button onClick={() => setApiError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>×</button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <TH style={{ width: 36, textAlign: 'center' }}>#</TH>
              <TH>Date</TH>
              <TH>Time</TH>
              <TH>Rep</TH>
              <TH>Contact</TH>
              <TH>Outcome</TH>
              <TH>Vertical</TH>
              <TH>Duration</TH>
              <TH style={{ minWidth: 180 }}>Tags / Insights</TH>
              <TH style={{ minWidth: 300 }}>Transcript</TH>
              <TH>Recording</TH>
              {customCols.map(c => (
                <TH key={c.key} style={{ minWidth: 200, background: c.type === 'ai' ? '#f5f3ff' : '#eff6ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{c.type === 'ai' ? '🤖' : '⚙️'}</span>
                    <span>{c.name}</span>
                    <button
                      onClick={() => deleteCustomCol(c.key)}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                      title="Remove column"
                    >×</button>
                  </div>
                  {processing === c.name && (
                    <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 2 }}>Running… {processingProgress}%</div>
                  )}
                </TH>
              ))}
              <TH style={{ width: 130, background: '#f0fdf4' }}>
                <button
                  onClick={() => setShowModal(true)}
                  disabled={!!processing}
                  style={{
                    background: processing ? '#e5e7eb' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    color: processing ? '#9ca3af' : 'white',
                    border: 'none', borderRadius: 6, padding: '5px 11px',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap'
                  }}
                >
                  + Add Column
                </button>
              </TH>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const oc = OUTCOME_COLORS[row.outcome] || { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' };

              return (
                <tr key={row.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <TD style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{i + 1}</TD>
                  <TD style={{ whiteSpace: 'nowrap', color: '#6b7280', fontSize: 12 }}>{row.date}</TD>
                  <TD style={{ whiteSpace: 'nowrap', color: '#6b7280' }}>{row.time}</TD>
                  <TD style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#4f46e5', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {row.rep.split(' ').map(w => w[0]).join('')}
                      </div>
                      {row.rep.split(' ')[0]}
                    </div>
                  </TD>
                  <TD style={{ fontSize: 12 }}>
                    {row.contactName ? (() => {
                      const parts = row.contactName.split(' ');
                      const display = parts.length > 1 ? `${parts[0]} ${parts[parts.length-1][0]}.` : parts[0];
                      return (
                        <div>
                          <a href={row.hsUrl.replace('/calls/','/contacts/').replace('/review/','/contact/')} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none', fontSize: 12 }}>{display}</a>
                          {row.title && <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>{row.title}</div>}
                        </div>
                      );
                    })() : <span style={{ color: '#d1d5db' }}>—</span>}
                  </TD>
                  <TD>
                    <span style={{ background: oc.bg, color: oc.text, borderRadius: 5, padding: '3px 9px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: oc.dot, flexShrink: 0, display: 'inline-block' }} />
                      {row.outcome}
                    </span>
                  </TD>
                  <TD style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#6b7280' }}>
                    {row.vertical || '—'}
                  </TD>
                  <TD style={{ fontVariantNumeric: 'tabular-nums', color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {fmtDuration(row.durationMs)}
                  </TD>
                  <TD>
                    {tags[row.id] ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tags[row.id].map(tag => {
                          const tc = TAG_COLORS[tag] || { bg: '#f3f4f6', text: '#374151' };
                          return <span key={tag} style={{ background: tc.bg, color: tc.text, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{tag}</span>;
                        })}
                      </div>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: 11 }}>{taggingProgress ? '...' : '—'}</span>
                    )}
                  </TD>
                  <TD style={{ maxWidth: 350 }}>
                    {row.transcript && row.transcript.length > 50 ? (
                      <div>
                        <div style={{
                          overflow: expandedRow === row.id ? 'visible' : 'hidden',
                          display: expandedRow === row.id ? 'block' : '-webkit-box',
                          WebkitLineClamp: expandedRow === row.id ? undefined : 3,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.6', fontSize: 11,
                        }}>
                          {row.transcript.split('\n').map((line, li) => {
                            const repMatch = line.match(/^(.+?)\s*\((Rep)\):\s*(.*)$/);
                            const prospMatch = line.match(/^(.+?)\s*\((Prospect)\):\s*(.*)$/);
                            if (repMatch) return <div key={li} style={{ marginBottom: 3 }}><span style={{ color: '#4f46e5', fontWeight: 600, fontSize: 10 }}>{repMatch[1]}:</span> <span style={{ color: '#374151' }}>{repMatch[3]}</span></div>;
                            if (prospMatch) return <div key={li} style={{ marginBottom: 3 }}><span style={{ color: '#059669', fontWeight: 600, fontSize: 10 }}>{prospMatch[1]}:</span> <span style={{ color: '#374151' }}>{prospMatch[3]}</span></div>;
                            return line ? <div key={li} style={{ color: '#6b7280', marginBottom: 2 }}>{line}</div> : null;
                          })}
                        </div>
                        <button onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: 11, padding: 0, marginTop: 3 }}>
                          {expandedRow === row.id ? '▲ collapse' : '▼ expand transcript'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                    )}
                  </TD>
                  <TD>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {row.recordingUrl && (
                        <a href={row.recordingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          ▶ Listen
                        </a>
                      )}
                      <a href={row.hsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 11 }}>
                        HubSpot ↗
                      </a>
                    </div>
                  </TD>
                  {customCols.map(c => (
                    <TD key={c.key} style={{ maxWidth: 220, fontSize: 12 }}>
                      {processing === c.name && row[c.key] === undefined ? (
                        <span style={{ color: '#c4b5fd', fontStyle: 'italic' }}>running…</span>
                      ) : row[c.key] ? (
                        <span style={{ color: row[c.key].startsWith('Error:') ? '#dc2626' : '#1f2937' }}>{row[c.key]}</span>
                      ) : (
                        <span style={{ color: '#e5e7eb' }}>—</span>
                      )}
                    </TD>
                  ))}
                  <TD />
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13 + customCols.length + 1} style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', fontSize: 14 }}>
                  No calls match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add Column Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 500, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Add Smart Column</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Enrich your call data with AI analysis or custom formulas.</div>

            {/* Column name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Column Name</label>
              <input
                value={colForm.name}
                onChange={e => setColForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Main Objection"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Type selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { val: 'ai', icon: '🤖', title: 'AI Column', desc: 'Claude analyzes each row using your prompt' },
                  { val: 'formula', icon: '⚙️', title: 'Formula Column', desc: 'JavaScript expression run on each row' }
                ].map(({ val, icon, title, desc }) => (
                  <div
                    key={val}
                    onClick={() => setColForm(p => ({ ...p, type: val }))}
                    style={{
                      flex: 1, border: `2px solid ${colForm.type === val ? '#4f46e5' : '#e5e7eb'}`,
                      borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      background: colForm.type === val ? '#eef2ff' : 'white',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: colForm.type === val ? '#4f46e5' : '#1f2937' }}>{title}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI prompt */}
            {colForm.type === 'ai' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Prompt</label>
                <textarea
                  value={colForm.prompt}
                  onChange={e => setColForm(p => ({ ...p, prompt: e.target.value }))}
                  placeholder="Describe what you want to extract or analyze from each call..."
                  rows={3}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {[
                    'What was the main objection raised? If none, say "No objection".',
                    'Did the prospect hang up mid-pitch? Answer Yes or No.',
                    'Was this a genuine conversation or a wrong number/no answer? One word.',
                    'Identify any follow-up opportunity mentioned.',
                    'What topic or pain point did the prospect respond to?',
                  ].map(example => (
                    <button
                      key={example}
                      onClick={() => setColForm(p => ({ ...p, prompt: example }))}
                      style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#374151', textAlign: 'left' }}
                    >
                      {example.slice(0, 45)}…
                    </button>
                  ))}
                </div>
                {!apiKey && (
                  <div style={{ marginTop: 8, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                    ⚠️ You need to set your Anthropic API key (click "Set API Key" in the header) before running AI columns.
                  </div>
                )}
              </div>
            )}

            {/* Formula */}
            {colForm.type === 'formula' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Formula (JavaScript)</label>
                <input
                  value={colForm.formula}
                  onChange={e => setColForm(p => ({ ...p, formula: e.target.value }))}
                  placeholder={`row.durationMs > 60000 ? "Long call" : "Short call"`}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ marginTop: 8, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#374151' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Available fields:</div>
                  <code style={{ display: 'block', color: '#4f46e5' }}>row.outcome</code>
                  <code style={{ display: 'block', color: '#4f46e5' }}>row.durationMs &nbsp;// e.g. 69428</code>
                  <code style={{ display: 'block', color: '#4f46e5' }}>row.notes &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;// AI summary text</code>
                  <code style={{ display: 'block', color: '#4f46e5' }}>row.rep &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;// rep name</code>
                  <code style={{ display: 'block', color: '#4f46e5' }}>fmtDuration(row.durationMs) &nbsp;// "1:09"</code>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>Example formulas:</div>
                  <code style={{ display: 'block', color: '#059669' }}>{`row.durationMs > 60000 ? "Long" : "Short"`}</code>
                  <code style={{ display: 'block', color: '#059669' }}>{`row.outcome === "Connected" ? "✅" : "—"`}</code>
                  <code style={{ display: 'block', color: '#059669' }}>{`row.notes ? "Has summary" : "No summary"`}</code>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowModal(false); setColForm({ name: '', type: 'ai', prompt: '', formula: '' }); }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                disabled={
                  !colForm.name.trim() ||
                  (colForm.type === 'ai' && !colForm.prompt.trim()) ||
                  (colForm.type === 'formula' && !colForm.formula.trim())
                }
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: 'white', border: 'none', borderRadius: 8, padding: '9px 20px',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  opacity: (!colForm.name.trim() || (colForm.type === 'ai' && !colForm.prompt.trim()) || (colForm.type === 'formula' && !colForm.formula.trim())) ? 0.4 : 1
                }}
              >
                {colForm.type === 'ai' ? `🤖 Run on ${rows.length} calls` : '⚙️ Add Formula Column'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
