import { useState, useMemo, useEffect } from "react";
import { CALL_DATA } from "./callData.js";
import useHubSpotCalls from "./useHubSpotCalls.js";

const OUTCOME_COLORS = {
  'Not Interested':              { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  'Meeting Booked':              { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e' },
  'Follow up - interested':      { bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6' },
  'Call me later':               { bg: '#fef3c7', text: '#d97706', dot: '#f59e0b' },
  'Account to Pursue':           { bg: '#f0fdf4', text: '#15803d', dot: '#4ade80' },
  'No longer at company':        { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
  'Wrong Contact - no referral': { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Wrong contact - referral':    { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Wrong number':                { bg: '#e5e7eb', text: '#6b7280', dot: '#9ca3af' },
};

// --- Reach Quality tags ---
const REACH_TAGS = {
  'Right person, right target':    { bg: '#dcfce7', text: '#166534' },
  'Right person, wrong department':{ bg: '#fef3c7', text: '#92400e' },
  'Right person, not decision maker':{ bg: '#fde68a', text: '#78350f' },
  'Wrong person answered':         { bg: '#fed7aa', text: '#9a3412' },
  'Stale number':                  { bg: '#e5e7eb', text: '#6b7280' },
  'Person left company':           { bg: '#f3f4f6', text: '#6b7280' },
};

// --- Pitch Outcome tags ---
const PITCH_TAGS = {
  'Full pitch delivered':      { bg: '#dbeafe', text: '#1e40af' },
  'Partial pitch, cut off':    { bg: '#fecaca', text: '#dc2626' },
  'No pitch, too busy':        { bg: '#fef9c3', text: '#854d0e' },
  'No pitch, immediate rejection':{ bg: '#fee2e2', text: '#991b1b' },
  'Callback requested':        { bg: '#e0e7ff', text: '#3730a3' },
};

// --- Objection / Why No tags ---
const OBJECTION_TAGS = {
  'Happy with current setup':  { bg: '#cffafe', text: '#155e75' },
  'No budget':                 { bg: '#fee2e2', text: '#991b1b' },
  'Bad timing':                { bg: '#fce7f3', text: '#9d174d' },
  'Not relevant to me':        { bg: '#f3f4f6', text: '#374151' },
  'No pain felt':              { bg: '#e5e7eb', text: '#374151' },
  'Wants proof/info first':    { bg: '#e0e7ff', text: '#3730a3' },
  'Referred elsewhere':        { bg: '#fef3c7', text: '#92400e' },
  'Meeting booked':            { bg: '#dcfce7', text: '#166534' },
  'Follow up agreed':          { bg: '#d1fae5', text: '#065f46' },
  'Interest shown':            { bg: '#cffafe', text: '#155e75' },
};

const ALL_TAG_COLORS = { ...REACH_TAGS, ...PITCH_TAGS, ...OBJECTION_TAGS };

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
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('All');
  const [filterRep, setFilterRep] = useState('All');
  const [filterVertical, setFilterVertical] = useState('All');
  const [filterPersona, setFilterPersona] = useState('All');
  const [filterTag, setFilterTag] = useState('All');
  const [tags, setTags] = useState({});  // callId -> [tag1, tag2, ...]
  const [taggingProgress, setTaggingProgress] = useState(null); // null | { done, total }
  const [stages, setStages] = useState({}); // callId -> { iceBreaker: {text,success}, hook: {text,success}, objection: {text,success} }
  const [stagesProgress, setStagesProgress] = useState(null);
  const [filterIceBreaker, setFilterIceBreaker] = useState('All');
  const [filterHook, setFilterHook] = useState('All');
  const [filterObjection, setFilterObjection] = useState('All');
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [colForm, setColForm] = useState({ name: '', type: 'ai', prompt: '', formula: '' });
  const [processing, setProcessing] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [apiError, setApiError] = useState('');

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
      const matchDateFrom = !filterDateFrom || row.date >= filterDateFrom;
      const matchDateTo = !filterDateTo || row.date <= filterDateTo;
      const matchOutcome = filterOutcome === 'All' || row.outcome === filterOutcome;
      const matchRep = filterRep === 'All' || row.rep === filterRep;
      const matchVertical = filterVertical === 'All' || row.vertical === filterVertical;
      const matchPersona = filterPersona === 'All' || row.persona === filterPersona;
      const matchTag = filterTag === 'All' || (tags[row.id] && tags[row.id].includes(filterTag));
      const s = stages[row.id];
      const matchIB = filterIceBreaker === 'All' || (s && ((filterIceBreaker === 'Passed' && s.iceBreaker?.success) || (filterIceBreaker === 'Failed' && s.iceBreaker?.success === false)));
      const matchHk = filterHook === 'All' || (s && ((filterHook === 'Passed' && s.hook?.success) || (filterHook === 'Failed' && s.hook?.success === false)));
      const matchObj = filterObjection === 'All' || (s && ((filterObjection === 'Handled' && s.objection?.success) || (filterObjection === 'Lost' && s.objection?.success === false) || (filterObjection === 'None' && s.objection?.success === null)));
      return matchSearch && matchDateFrom && matchDateTo && matchOutcome && matchRep && matchVertical && matchPersona && matchTag && matchIB && matchHk && matchObj;
    });
  }, [rows, search, filterDateFrom, filterDateTo, filterOutcome, filterRep, filterVertical, filterPersona, filterTag, tags, filterIceBreaker, filterHook, filterObjection, stages]);

  // Stats — computed from filtered rows so they reflect current filters
  const stats = useMemo(() => {
    const total = filtered.length;
    const notInterested = filtered.filter(r => r.outcome === 'Not Interested').length;
    const meetingBooked = filtered.filter(r => r.outcome === 'Meeting Booked').length;
    const followUp = filtered.filter(r => r.outcome === 'Follow up - interested').length;
    const wrongContact = filtered.filter(r => r.outcome.startsWith('Wrong')).length;
    const avgMs = total ? filtered.reduce((a, r) => a + r.durationMs, 0) / total : 0;
    const avgSec = Math.round(avgMs / 1000);
    return { total, notInterested, meetingBooked, followUp, wrongContact, avgSec };
  }, [filtered]);

  // Funnel stats from tags — also scoped to filtered rows
  const funnel = useMemo(() => {
    const filteredIds = new Set(filtered.map(r => r.id));
    const filteredTags = Object.entries(tags).filter(([id]) => filteredIds.has(id));
    const tagged = filteredTags.length;
    if (tagged === 0) return null;
    const reachCounts = {};
    const pitchCounts = {};
    const objCounts = {};
    filteredTags.forEach(([, arr]) => {
      arr.forEach(t => {
        if (REACH_TAGS[t]) reachCounts[t] = (reachCounts[t] || 0) + 1;
        if (PITCH_TAGS[t]) pitchCounts[t] = (pitchCounts[t] || 0) + 1;
        if (OBJECTION_TAGS[t]) objCounts[t] = (objCounts[t] || 0) + 1;
      });
    });
    const rightPerson = (reachCounts['Right person, right target'] || 0) + (reachCounts['Right person, wrong department'] || 0) + (reachCounts['Right person, not decision maker'] || 0);
    const rightTarget = (reachCounts['Right person, right target'] || 0);
    const fullPitch = (pitchCounts['Full pitch delivered'] || 0);
    const partialPitch = (pitchCounts['Partial pitch, cut off'] || 0);
    const heardPitch = fullPitch + partialPitch;
    return { tagged, reachCounts, pitchCounts, objCounts, rightPerson, rightTarget, fullPitch, heardPitch };
  }, [filtered, tags]);

  // Stage funnel stats — scoped to filtered rows
  const stageFunnel = useMemo(() => {
    const filteredIds = new Set(filtered.map(r => r.id));
    const filteredStages = Object.entries(stages).filter(([id]) => filteredIds.has(id));
    const total = filteredStages.length;
    if (total === 0) return null;
    const ibPassed = filteredStages.filter(([, s]) => s.iceBreaker?.success).length;
    const hookPassed = filteredStages.filter(([, s]) => s.hook?.success).length;
    const objHandled = filteredStages.filter(([, s]) => s.objection?.success === true).length;
    const objLost = filteredStages.filter(([, s]) => s.objection?.success === false).length;
    return { total, ibPassed, hookPassed, objHandled, objLost };
  }, [filtered, stages]);

  // Unique reps and verticals for filters
  const reps = useMemo(() => ['All', ...new Set(rows.map(r => r.rep))], [rows]);
  const verticals = useMemo(() => ['All', ...new Set(rows.map(r => r.vertical).filter(Boolean).sort())], [rows]);
  const personas = useMemo(() => ['All', ...new Set(rows.map(r => r.persona).filter(Boolean).sort())], [rows]);
  const allTags = useMemo(() => {
    const s = new Set();
    Object.values(tags).forEach(arr => arr.forEach(t => s.add(t)));
    return ['All', ...Array.from(s).sort()];
  }, [tags]);

  // Analyze all calls with transcripts
  const analyzeAllCalls = async () => {
    if (!apiKey) { setApiError('Set your Anthropic API key first'); return; }
    const toAnalyze = rows.filter(r => r.transcript && r.transcript.length > 50 && !tags[r.id]);
    if (toAnalyze.length === 0) return;
    setTaggingProgress({ done: 0, total: toAnalyze.length });
    const reachList = Object.keys(REACH_TAGS).join(', ');
    const pitchList = Object.keys(PITCH_TAGS).join(', ');
    const objectionList = Object.keys(OBJECTION_TAGS).join(', ');
    const newTags = { ...tags };
    for (let i = 0; i < toAnalyze.length; i++) {
      const row = toAnalyze[i];
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 250,
            messages: [{ role: 'user', content: `You are analyzing a cold call for RunBook (AP/billing automation for logistics). Classify this call across 3 dimensions. Pick EXACTLY ONE tag per dimension.

REACH — Did we reach the right person?
${reachList}
Guidelines: "Right person, right target" = the person we wanted AND they handle the relevant area. "Right person, wrong department" = we got them but they do something unrelated (e.g. CTO of food science, not IT). "Right person, not decision maker" = right area but can't buy. "Wrong person answered" = someone else picked up the phone. "Stale number" = number no longer belongs to contact. "Person left company" = they no longer work there.

PITCH — How far did the conversation get?
${pitchList}
Guidelines: "Full pitch delivered" = rep explained RunBook's value prop. "Partial pitch, cut off" = started but prospect hung up or stopped them. "No pitch, too busy" = prospect said they're in a meeting / busy. "No pitch, immediate rejection" = shut down before any pitch ("take me off your list"). "Callback requested" = prospect asked for email or to call back later.

OBJECTION — If rejected or not interested, why? (use "None" if meeting booked or clearly positive)
${objectionList}
Guidelines: "Happy with current setup" = explicitly said current tools work fine. "No budget" = mentioned cost/budget. "Bad timing" = "not right now" / "maybe later". "Not relevant to me" = topic doesn't match their role. "No pain felt" = don't see the problem. "Wants proof/info first" = asked for email/materials. "Referred elsewhere" = gave a name or department. "Meeting booked" = scheduled a call. "Follow up agreed" = agreed to reconnect. "Interest shown" = positive signals but no firm next step.

Call outcome: ${row.outcome}
Contact: ${row.contactName || 'Unknown'} (${row.title || 'Unknown title'})
Transcript:
${row.transcript.slice(0, 2000)}

Return EXACTLY 3 lines, using ONLY tags from the lists above:
REACH: <tag>
PITCH: <tag>
OBJECTION: <tag or None>` }]
          })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        const parsed = [];
        for (const line of text.split('\n')) {
          const match = line.match(/^(?:REACH|PITCH|OBJECTION):\s*(.+)/i);
          if (match) {
            const tag = match[1].trim();
            if (tag !== 'None' && ALL_TAG_COLORS[tag]) parsed.push(tag);
          }
        }
        newTags[row.id] = parsed.length > 0 ? parsed : ['Right person, right target', 'Full pitch delivered'];
      } catch (e) {
        if (i === 0) { setApiError(`Tag analysis failed: ${e.message}`); setTaggingProgress(null); return; }
        newTags[row.id] = ['Error'];
      }
      setTags({ ...newTags });
      setTaggingProgress({ done: i + 1, total: toAnalyze.length });
    }
    setTaggingProgress(null);
  };

  // Analyze call stages: Ice Breaker, Hook, Objection
  const analyzeCallStages = async () => {
    if (!apiKey) { setApiError('Set your Anthropic API key first'); return; }
    const toAnalyze = rows.filter(r => r.transcript && r.transcript.length > 100 && r.transcript.includes('(Rep):') && !stages[r.id]);
    if (toAnalyze.length === 0) return;
    setStagesProgress({ done: 0, total: toAnalyze.length });
    const newStages = { ...stages };
    for (let i = 0; i < toAnalyze.length; i++) {
      const row = toAnalyze[i];
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 300,
            messages: [{ role: 'user', content: `You are an expert cold call analyst. Analyze this B2B cold call transcript and break it into 3 stages.

STAGE 1 — ICE BREAKER (the intro + permission ask)
This is everything from "Hi, this is [rep]" up to and including the prospect's response to the permission ask ("can I borrow 30 seconds?").
- Extract: What the rep said to open and ask for time. Use their actual words, cleaned up slightly.
- Success: TRUE if the prospect agreed to listen or stayed on the line. FALSE if they immediately refused, said "no time", or hung up before any pitch.

STAGE 2 — HOOK (the value proposition / reason for calling)
This is where the rep explains what they do and why it's relevant to the prospect.
- Extract: The core pitch/value prop the rep delivered. Use their actual words, cleaned up.
- Success: TRUE if the rep finished delivering the hook AND the prospect responded to it (even if negatively — an objection means they heard it). FALSE if the prospect cut them off mid-pitch, hung up, or the call never reached this stage.
- If call ended before hook, write "Never reached hook" for the text.

STAGE 3 — OBJECTION (prospect's pushback + rep's handling)
This is the prospect's reason for saying no and how the rep responded.
- Extract: The specific objection the prospect raised. Use their actual words.
- Success: TRUE if the rep overcame the objection (got a meeting, follow-up, or kept the conversation going). FALSE if the objection ended the call. Use NONE if no objection was raised (meeting booked smoothly, or call ended before this stage).
- If no objection, write "None" for the text.

Call outcome: ${row.outcome}
Contact: ${row.contactName || 'Unknown'} (${row.title || 'Unknown title'})

Transcript:
${row.transcript.slice(0, 2500)}

Respond in EXACTLY this format (6 lines, no extra text):
ICE_BREAKER_TEXT: [1 sentence max]
ICE_BREAKER_SUCCESS: [TRUE or FALSE]
HOOK_TEXT: [1 sentence max]
HOOK_SUCCESS: [TRUE or FALSE]
OBJECTION_TEXT: [1 sentence max]
OBJECTION_SUCCESS: [TRUE or FALSE or NONE]` }]
          })
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        const parsed = { iceBreaker: { text: '', success: false }, hook: { text: '', success: false }, objection: { text: '', success: null } };
        for (const line of text.split('\n')) {
          const m = line.match(/^(ICE_BREAKER_TEXT|ICE_BREAKER_SUCCESS|HOOK_TEXT|HOOK_SUCCESS|OBJECTION_TEXT|OBJECTION_SUCCESS):\s*(.+)/i);
          if (!m) continue;
          const [, key, val] = m;
          const v = val.trim();
          switch (key.toUpperCase()) {
            case 'ICE_BREAKER_TEXT': parsed.iceBreaker.text = v; break;
            case 'ICE_BREAKER_SUCCESS': parsed.iceBreaker.success = v.toUpperCase() === 'TRUE'; break;
            case 'HOOK_TEXT': parsed.hook.text = v; break;
            case 'HOOK_SUCCESS': parsed.hook.success = v.toUpperCase() === 'TRUE'; break;
            case 'OBJECTION_TEXT': parsed.objection.text = v; break;
            case 'OBJECTION_SUCCESS': parsed.objection.success = v.toUpperCase() === 'NONE' ? null : v.toUpperCase() === 'TRUE'; break;
          }
        }
        newStages[row.id] = parsed;
      } catch (e) {
        if (i === 0) { setApiError(`Stage analysis failed: ${e.message}`); setStagesProgress(null); return; }
        newStages[row.id] = { iceBreaker: { text: 'Error', success: false }, hook: { text: 'Error', success: false }, objection: { text: 'Error', success: null } };
      }
      setStages({ ...newStages });
      setStagesProgress({ done: i + 1, total: toAnalyze.length });
    }
    setStagesProgress(null);
  };

  // Export CSV
  const exportCSV = () => {
    const baseHeaders = ['Call ID', 'Date', 'Time', 'Rep', 'Contact', 'Title', 'Persona', 'Outcome', 'Vertical', 'Duration (s)', 'Offer Used', 'Tags', 'Transcript', 'Recording URL', 'HubSpot URL'];
    const customHeaders = customCols.map(c => c.name);
    const headers = [...baseHeaders, ...customHeaders];
    const csvRows = rows.map(r => {
      const base = [
        r.id, r.date, r.time, r.rep, r.contactName || '', r.title || '', r.persona || '', r.outcome, r.vertical || '',
        Math.round(r.durationMs / 1000),
        `"${(r.offer || '').replace(/"/g, '""')}"`,
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
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

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
          { label: 'Total Calls', value: stats.total, color: '#4f46e5' },
          { label: 'Not Interested', value: stats.notInterested, color: '#dc2626' },
          { label: 'Meeting Booked', value: stats.meetingBooked, color: '#16a34a' },
          { label: 'Follow Up', value: stats.followUp, color: '#2563eb' },
          { label: 'Wrong Contact', value: stats.wrongContact, color: '#d97706' },
          { label: 'Book Rate', value: `${stats.total ? Math.round((stats.meetingBooked / stats.total) * 100) : 0}%`, color: '#0891b2' },
          { label: 'Avg Duration', value: `${Math.floor(stats.avgSec / 60)}m ${stats.avgSec % 60}s`, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ background: s.color + '08', border: `1px solid ${s.color}22`, borderRadius: 9, padding: '7px 14px', textAlign: 'center', minWidth: 80, flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, whiteSpace: 'nowrap' }}>{s.label}</div>
          </div>
        ))}
        {funnel && (
          <>
            <div style={{ width: 1, background: '#e5e7eb', margin: '4px 4px', flexShrink: 0 }} />
            {[
              { label: 'Right Person', value: funnel.rightPerson, pct: `${Math.round(funnel.rightPerson / funnel.tagged * 100)}%`, color: '#16a34a' },
              { label: 'Right Target', value: funnel.rightTarget, pct: `${Math.round(funnel.rightTarget / funnel.tagged * 100)}%`, color: '#059669' },
              { label: 'Heard Pitch', value: funnel.heardPitch, pct: `${Math.round(funnel.heardPitch / funnel.tagged * 100)}%`, color: '#2563eb' },
              { label: 'Pitch → Book', value: funnel.heardPitch ? `${Math.round(stats.meetingBooked / funnel.heardPitch * 100)}%` : '—', color: '#7c3aed' },
            ].map(s => (
              <div key={s.label} style={{ background: s.color + '08', border: `1px solid ${s.color}22`, borderRadius: 9, padding: '7px 14px', textAlign: 'center', minWidth: 90, flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                {s.pct && <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.pct}</div>}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap' }}>{s.label}</div>
              </div>
            ))}
          </>
        )}
        {stageFunnel && (
          <>
            <div style={{ width: 1, background: '#e5e7eb', margin: '4px 4px', flexShrink: 0 }} />
            {[
              { label: 'IB Passed', value: stageFunnel.ibPassed, pct: `${Math.round(stageFunnel.ibPassed / stageFunnel.total * 100)}%`, color: '#16a34a' },
              { label: 'Hook Passed', value: stageFunnel.hookPassed, pct: `${Math.round(stageFunnel.hookPassed / stageFunnel.total * 100)}%`, color: '#2563eb' },
              { label: 'Obj Handled', value: stageFunnel.objHandled, pct: `${Math.round(stageFunnel.objHandled / stageFunnel.total * 100)}%`, color: '#7c3aed' },
              { label: 'Obj Lost', value: stageFunnel.objLost, pct: `${Math.round(stageFunnel.objLost / stageFunnel.total * 100)}%`, color: '#dc2626' },
            ].map(s => (
              <div key={s.label} style={{ background: s.color + '08', border: `1px solid ${s.color}22`, borderRadius: 9, padding: '7px 14px', textAlign: 'center', minWidth: 80, flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                {s.pct && <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.pct}</div>}
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap' }}>{s.label}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: filterDateFrom ? '#374151' : '#9ca3af' }} title="From date" />
        <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: filterDateTo ? '#374151' : '#9ca3af' }} title="To date" />
        <input
          placeholder="🔍  Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 12px', fontSize: 13, width: 260, outline: 'none' }}
        />
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {['All', 'Not Interested', 'Meeting Booked', 'Follow up - interested', 'Call me later', 'Account to Pursue', 'No longer at company', 'Wrong Contact - no referral', 'Wrong contact - referral', 'Wrong number'].map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {reps.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {verticals.map(v => <option key={v} value={v}>{v === 'All' ? 'All Verticals' : v}</option>)}
        </select>
        <select value={filterPersona} onChange={e => setFilterPersona(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
          {personas.map(p => <option key={p} value={p}>{p === 'All' ? 'All Personas' : p}</option>)}
        </select>
        {allTags.length > 1 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 13, color: '#374151' }}>
            {allTags.map(t => <option key={t} value={t}>{t === 'All' ? 'All Tags' : t}</option>)}
          </select>
        )}
        {Object.keys(stages).length > 0 && (
          <>
            <select value={filterIceBreaker} onChange={e => setFilterIceBreaker(e.target.value)} style={{ border: '1px solid #bbf7d0', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: '#374151', background: '#f0fdf4' }}>
              {['All', 'Passed', 'Failed'].map(v => <option key={v}>{v === 'All' ? 'IB: All' : `IB: ${v}`}</option>)}
            </select>
            <select value={filterHook} onChange={e => setFilterHook(e.target.value)} style={{ border: '1px solid #bfdbfe', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: '#374151', background: '#eff6ff' }}>
              {['All', 'Passed', 'Failed'].map(v => <option key={v}>{v === 'All' ? 'Hook: All' : `Hook: ${v}`}</option>)}
            </select>
            <select value={filterObjection} onChange={e => setFilterObjection(e.target.value)} style={{ border: '1px solid #fecaca', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: '#374151', background: '#fef2f2' }}>
              {['All', 'Handled', 'Lost', 'None'].map(v => <option key={v}>{v === 'All' ? 'Obj: All' : `Obj: ${v}`}</option>)}
            </select>
          </>
        )}
        {(search || filterDateFrom || filterDateTo || filterOutcome !== 'All' || filterRep !== 'All' || filterVertical !== 'All' || filterPersona !== 'All' || filterTag !== 'All' || filterIceBreaker !== 'All' || filterHook !== 'All' || filterObjection !== 'All') && (
          <button onClick={() => { setSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterOutcome('All'); setFilterRep('All'); setFilterVertical('All'); setFilterPersona('All'); setFilterTag('All'); setFilterIceBreaker('All'); setFilterHook('All'); setFilterObjection('All'); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>✕ Clear</button>
        )}
        <button
          onClick={analyzeAllCalls}
          disabled={!!taggingProgress || !!stagesProgress || !apiKey}
          style={{ background: taggingProgress ? '#e5e7eb' : 'linear-gradient(135deg, #f59e0b, #ef4444)', color: taggingProgress ? '#9ca3af' : 'white', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, cursor: taggingProgress ? 'not-allowed' : 'pointer', fontWeight: 700 }}
        >
          {taggingProgress ? `Tagging ${taggingProgress.done}/${taggingProgress.total}...` : `🏷 Tags${!apiKey ? ' (key)' : ''}`}
        </button>
        <button
          onClick={analyzeCallStages}
          disabled={!!stagesProgress || !!taggingProgress || !apiKey}
          style={{ background: stagesProgress ? '#e5e7eb' : 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: stagesProgress ? '#9ca3af' : 'white', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, cursor: stagesProgress ? 'not-allowed' : 'pointer', fontWeight: 700 }}
        >
          {stagesProgress ? `Stages ${stagesProgress.done}/${stagesProgress.total}...` : `📊 Analyze Stages${!apiKey ? ' (key)' : ''}`}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {filtered.length} of {rows.length} calls {filtered.length !== rows.length && '(filtered)'}
          {Object.keys(stages).length > 0 && ` · ${Object.keys(stages).length} staged`}
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
              <TH>Persona</TH>
              <TH>Outcome</TH>
              <TH>Vertical</TH>
              <TH>Duration</TH>
              <TH style={{ minWidth: 200 }}>Offer Used</TH>
              <TH style={{ minWidth: 180 }}>Tags / Insights</TH>
              <TH style={{ minWidth: 160 }}>Ice Breaker</TH>
              <TH style={{ minWidth: 160 }}>Hook</TH>
              <TH style={{ minWidth: 160 }}>Objection</TH>
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
                  <TD style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {row.persona ? (
                      <span style={{ background: '#f0f9ff', color: '#0c4a6e', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{row.persona}</span>
                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
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
                  <TD style={{ maxWidth: 220, fontSize: 11 }}>
                    {row.offer ? (
                      <div style={{ color: '#374151', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                        "{row.offer}"
                      </div>
                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
                  </TD>
                  <TD style={{ minWidth: 180 }}>
                    {tags[row.id] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {[['Reach', REACH_TAGS], ['Pitch', PITCH_TAGS], ['Why', OBJECTION_TAGS]].map(([label, group]) => {
                          const matching = tags[row.id].filter(t => group[t]);
                          if (matching.length === 0) return null;
                          return (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, width: 32, flexShrink: 0, textTransform: 'uppercase' }}>{label}</span>
                              {matching.map(tag => {
                                const tc = ALL_TAG_COLORS[tag] || { bg: '#f3f4f6', text: '#374151' };
                                return <span key={tag} style={{ background: tc.bg, color: tc.text, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{tag}</span>;
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: 11 }}>{taggingProgress ? '...' : '—'}</span>
                    )}
                  </TD>
                  {/* Ice Breaker / Hook / Objection stage cells */}
                  {['iceBreaker', 'hook', 'objection'].map(stageKey => {
                    const s = stages[row.id]?.[stageKey];
                    if (!s) return <TD key={stageKey}><span style={{ color: '#d1d5db', fontSize: 11 }}>{stagesProgress ? '...' : '—'}</span></TD>;
                    const isNone = s.success === null;
                    const bg = isNone ? '#f3f4f6' : s.success ? '#dcfce7' : '#fee2e2';
                    const dot = isNone ? '#9ca3af' : s.success ? '#22c55e' : '#ef4444';
                    const label = isNone ? 'N/A' : s.success ? 'Passed' : 'Failed';
                    return (
                      <TD key={stageKey} style={{ fontSize: 11 }}>
                        <div style={{ background: bg, borderRadius: 6, padding: '5px 8px', border: `1px solid ${isNone ? '#e5e7eb' : s.success ? '#bbf7d0' : '#fecaca'}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: 10, color: isNone ? '#6b7280' : s.success ? '#166534' : '#991b1b' }}>{label}</span>
                          </div>
                          <div style={{ color: '#374151', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {s.text || '—'}
                          </div>
                        </div>
                      </TD>
                    );
                  })}
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
                <td colSpan={18 + customCols.length + 1} style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', fontSize: 14 }}>
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
