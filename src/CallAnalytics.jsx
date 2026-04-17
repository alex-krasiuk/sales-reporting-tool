import { useState, useMemo } from "react";
import { CALL_DATA as LEGACY_DATA } from "./callData.js";
import { ALL_CALLS, SYNC_META } from "./allCallData.js";

// Merge: legacy has rich fields, new data fills gaps
const legacyById = Object.fromEntries(LEGACY_DATA.map(c => [c.id, c]));
// Filter out "junk" connects: pick up + hang up (<20s with no real dialogue)
const MIN_REAL_CALL_MS = 20000;
const CALL_DATA = ALL_CALLS
  .filter(c => c.isConnect)
  .filter(c => (c.durationMs || 0) >= MIN_REAL_CALL_MS)
  .map(c => {
    const legacy = legacyById[c.id];
    // Always keep AI classification fields from ALL_CALLS (even when legacy exists)
    const aiFields = {
      aiOffer: c.aiOffer,
      aiOfferDetail: c.aiOfferDetail,
      aiObjection: c.aiObjection,
      aiObjections: c.aiObjections,
      aiObjectionDetail: c.aiObjectionDetail,
      aiIsFollowup: c.aiIsFollowup,
    };
    if (legacy) return { ...legacy, ...aiFields };
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
      ...aiFields,
    };
  });

// ============================================================
// TAGGING: top offers + objections (+ Other)
// ============================================================
const OFFERS = [
  'AI Agents Platform',
  'Automate Manual Coordination',
  'AI for Logistics',
  'Other',
  'Not reached',
  'Follow-up call',
];

const OBJECTIONS = [
  'Building in-house / have solution',
  'Too busy / bad timing',
  'Send info / email first',
  'Other',
  'None',
  'N/A',
];

// Signals that this is a real objection/reason, not just filler/noise
const OBJECTION_SIGNAL = /\b(not|don.t|no |busy|already|have|email|send|call|later|time|wrong|personal|happy|all set|we.re|we.ve|retire|vacation|office|meeting|interest|cold|strategy|review|signed|deal|vendor|cover)\b/i;

// Make a short neutral summary from raw prospect objection text
function summarizeObjection(text) {
  if (!text) return '';
  const t = text.toLowerCase().trim();

  // Only produce a summary if the text actually contains objection language
  if (!OBJECTION_SIGNAL.test(t)) return '';

  // Pattern → clean 3rd-person summary
  if (/all set|we.re good|we.ve got it|we got it|no need/.test(t)) return 'We are all set';
  if (/another call|on.*call right now|in.*call/.test(t)) return 'On another call';
  if (/call.*back.*(later|tomorrow|next)|callback/.test(t)) return 'Wants a callback';
  if (/retire|retiring/.test(t)) return 'Retiring';
  if (/vacation|out of office|travelling|travel/.test(t)) return 'Out of office';
  if (/meeting.*starting|about to jump|going into.*meeting/.test(t)) return 'In a meeting';
  if (/strategy.*first|review|vetting/.test(t)) return 'Needs internal review';
  if (/sign.*deal|already.*contract|just signed/.test(t)) return 'Already signed with someone';
  if (/not.*interest|no.*interest/.test(t)) return 'Not interested';
  if (/too many.*call|many.*vendor|overwhelmed/.test(t)) return 'Too many vendors calling';
  if (/don.t.*cold call|cold call/.test(t)) return "Doesn't take cold calls";
  if (/wrong|not.*right person|not.*my area/.test(t)) return 'Wrong person';

  // Fallback: clean up the raw text a bit
  // Strip punctuation, collapse whitespace, take first ~8 meaningful words
  const cleaned = text
    .replace(/[^a-zA-Z0-9\s'.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(w => w.length > 1);
  if (!words.length) return '';

  // Take first 8 words; if the 8th word is cut mid-phrase, stop earlier
  const take = Math.min(8, words.length);
  let phrase = words.slice(0, take).join(' ');
  // Don't end on a preposition/conjunction
  phrase = phrase.replace(/\b(of|the|a|an|to|for|when|that|and|but|or|if|at|in|on|with|comes?|gets?)\s*$/i, '').trim();
  if (!phrase) return '';
  // Capitalize first letter
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// Find the best "pitch" line in a transcript — one that actually sells something
// (mentions what we do, not just greeting/closing)
function findBestPitchLine(call) {
  const repLines = (call.transcript || '')
    .split('\n')
    .filter(l => l.includes('(Rep):'))
    .map(l => l.replace(/^.*?\(Rep\):\s*/, '').trim());

  // Score each line for "pitch likelihood"
  const pitchKeywords = /\b(ai agents?|platform|automate|automation|workflow|manual|coordinat|dispatch|billing|logistics|warehous|freight|carrier|trucking|fleet|supply chain|no.code|accounts payable|invoice|finance|operations?|ops team|business operator|orchestrat|deploy|build.*agent|help.*teams?|companies|help you|solve|problem|challenge|pain|struggle)\b/i;
  const closingKeywords = /\b(appreciate|thank you|take care|bye|have a|good luck|alright|no problem|no worries|have a good)\b/i;

  let best = { line: '', score: -1 };
  for (const line of repLines) {
    if (line.length < 30) continue;
    const hasPitch = pitchKeywords.test(line);
    const isClosing = closingKeywords.test(line.slice(0, 40)); // closing markers usually at start
    let score = 0;
    if (hasPitch) score += 10;
    if (line.split(' ').length > 20) score += 2;
    if (line.split(' ').length > 40) score += 3;
    if (isClosing) score -= 5;
    if (score > best.score) best = { line, score };
  }
  return best.score > 0 ? best.line : (call.hook?.text || '');
}

// Keywords that indicate the pitch actually happened (not just greeting/closing)
const PITCH_SIGNAL = /\b(ai agents?|platform|automat|workflow|manual|coordinat|dispatch|billing|logistics|warehous|freight|carrier|trucking|fleet|supply chain|no.code|accounts payable|invoice|finance|operations?|ops team|business operator|orchestrat|deploy.*agent|help.*teams?|help you|what we do|run book|runbook|solve|problem|challenge|pain|struggle)\b/i;

function autoOffer(call) {
  const hookText = (call.hook?.text || '').toLowerCase();
  // If no hook was ever reached, the offer was never made
  if (!hookText.trim() || /never reached/.test(hookText)) return 'Not reached';

  // Gather all rep text
  const repText = (call.transcript || '').split('\n').filter(l => l.includes('(Rep):')).join(' ').toLowerCase();
  const t = hookText + ' ' + repText;

  // Follow-up call detection — rep references a prior conversation
  if (/\b(we (had )?(talked|spoke|chatted|met)|we (had )?(a )?(conversation|chat)|last (week|time|call|conversation)|previous(ly)?|calling (you )?back|follow(ing)?.?up|as (i|we) (mentioned|discussed)|sent (you )?(a )?(note|email|message)|got (the|my) note|continue (our|the) (conversation|chat)|reach(ing)?.?out (again|back)|touch(ing)?.?base|spoke.*(ago|earlier|before|recently))\b/.test(t)) return 'Follow-up call';

  // If NO pitch signal ever happened in the entire call (just greeting/closing), it's not a real offer
  if (!PITCH_SIGNAL.test(t)) return 'Not reached';

  // AI for Logistics — most specific, check first
  if (/dispatch|carrier|freight|logistics.*team|trucking|warehouse|fleet|supply chain/.test(t)) return 'AI for Logistics';
  // Automate Manual Coordination — manual work / workflow automation
  if (/manual coordination|repetitive|manual.*(task|work|workflow)|workflow automation|automate.*workflow|automate.*manual|80.*percent|eighty percent|slows.*team|coordinat.*task/.test(t)) return 'Automate Manual Coordination';
  // AI Agents Platform — any mention of ai agents, platform for agents, building agents
  if (/ai agents?|agent.*platform|platform.*agent|build.*agent|deploy.*agent|no.code.*agent|orchestrat|agent builder/.test(t)) return 'AI Agents Platform';
  return 'Other';
}

// Short summary of what was pitched when offer is "Other"
function summarizeOffer(call) {
  const pitchLine = findBestPitchLine(call);
  if (!pitchLine) return '';
  const t = pitchLine.toLowerCase().trim();
  // Only produce a summary if the line actually contains pitch content
  if (!PITCH_SIGNAL.test(t)) return '';

  // Map common offer themes to clean labels
  if (/billing|accounts payable|invoice|ap automation/.test(t)) return 'Billing / AP automation';
  if (/order.to.cash|o2c/.test(t)) return 'Order-to-cash automation';
  if (/dispatch|crew dispatch/.test(t)) return 'Dispatch automation';
  if (/customer support|cs agent|service desk/.test(t)) return 'Customer support AI';
  if (/manufactur|factory|plant|production line/.test(t)) return 'Manufacturing automation';
  if (/finance|accounting|book.close|reconcil/.test(t)) return 'Finance ops AI';
  if (/hr|human resources|recruit/.test(t)) return 'HR automation';
  if (/data|analytics|reporting/.test(t)) return 'Data / analytics AI';
  if (/procure|purchase|sourcing|vendor/.test(t)) return 'Procurement AI';
  if (/compliance|audit|risk/.test(t)) return 'Compliance / audit AI';
  if (/sales ops|crm.*automat|pipeline/.test(t)) return 'Sales ops automation';

  // Fallback: pull a clean phrase around the pitch keyword
  const pitchMatch = t.match(/[^.!?]*\b(help|automat|agent|platform|workflow|build)[^.!?]*/);
  let phrase = pitchMatch ? pitchMatch[0] : t;
  // Clean up and trim
  phrase = phrase.replace(/[^a-zA-Z0-9\s'.]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = phrase.split(' ').filter(w => w.length > 1).slice(0, 10);
  if (!words.length) return '';
  let out = words.join(' ');
  out = out.replace(/\b(of|the|a|an|to|for|when|that|and|but|or|if|at|in|on|with|comes?|gets?|been|very|kinda|pretty|really|yeah|so)\s*$/i, '').trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
}

// Outcomes where there's no real "objection phase" — wrong person, no pitch happened, or deal accepted
function isNoObjectionCall(call) {
  const o = (call.outcome || '').toLowerCase();
  if (/wrong|self.?dq|no longer|meeting booked|no answer|voicemail|^busy$/i.test(o)) return true;
  // Also check the call body/title which often contains disposition text like "Self DQ - No Referral"
  const body = (call.transcript || '').slice(0, 500).toLowerCase();
  if (/\bself.?dq\b|'wrong (number|contact)'|no longer at company/i.test(body)) return true;
  return false;
}

function autoObjection(call) {
  // If the outcome means no real sales conversation happened, don't label an objection
  if (isNoObjectionCall(call)) return 'N/A';

  // Scan ALL prospect lines (not just call.objection.text — which may not be set if no pitch)
  const prosText = (call.transcript || '')
    .split('\n')
    .filter(l => l.includes('(Prospect):'))
    .map(l => l.replace(/^.*?\(Prospect\):\s*/, ''))
    .join(' ')
    .toLowerCase();
  const objText = (call.objection?.text || '').toLowerCase();
  const t = prosText + ' ' + objText;

  if (!t.trim()) return 'None';

  // Building in-house: explicit "we built/have it in-house"
  if (/\b(already (have|built|doing|using)|in.?house|internally|building (it|this|them).*ourselves|our (own|team|platform)|we (have|built|are using).*(ai|platform|solution)|we.ve got (our|it)|well developed|have.*(solution|platform|team) (for|to)|doing.*internally)\b/.test(t)) return 'Building in-house / have solution';

  // Too busy / bad timing: explicit time/availability refusal
  if (/\b(i.?m (busy|in (a|the) meeting|on (a|another) call|slammed)|middle of (a|the|my) (meeting|call)|can.?t talk|no time (right now|now|for)|not a good time|call me (back|later)|try (me|back) (later|tomorrow|next week)|bad time|out of (the )?office|on vacation|at lunch)\b/.test(t)) return 'Too busy / bad timing';

  // Send info / email first: prospect explicitly asking for email/linkedin/info
  if (/\b((send|shoot|drop|email) (me|over)|email (it|that|info)|can you (send|email)|ping me (on|via)|hit me (up )?on linkedin|linkedin me|reach out (via|on|through) email|send (me |over |through )?(some )?(info|information|details|material|docs?|stuff))\b/.test(t)) return 'Send info / email first';

  // Only "Other" if the prospect actually said something meaningfully negative
  if (/\b(not interested|no thank|no thanks|don.t (call|bother|want|need)|not (relevant|a good fit|the right)|take me off|remove (me|my)|unsolicited|don.?t do (cold|solicit)|no soliciting)\b/.test(t)) return 'Other';

  return 'None';
}

function loadTags() {
  try { return JSON.parse(localStorage.getItem('call_tags_v1') || '{}'); } catch { return {}; }
}

function saveTags(tags) {
  try { localStorage.setItem('call_tags_v1', JSON.stringify(tags)); } catch {}
}

const OFFER_COLORS = {
  'AI Agents Platform':            { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
  'Automate Manual Coordination':  { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  'AI for Logistics':              { bg: '#d1fae5', text: '#047857', dot: '#10b981' },
  'Other':                         { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Not reached':                   { bg: '#f9fafb', text: '#d1d5db', dot: '#e5e7eb' },
  'Follow-up call':                { bg: '#cffafe', text: '#0e7490', dot: '#06b6d4' },
};

const OBJECTION_COLORS = {
  'None':                                { bg: '#f9fafb', text: '#d1d5db', dot: '#e5e7eb' },
  'N/A':                                 { bg: '#f9fafb', text: '#d1d5db', dot: '#e5e7eb' },
  'Building in-house / have solution':   { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  'Too busy / bad timing':               { bg: '#fecaca', text: '#991b1b', dot: '#ef4444' },
  'Send info / email first':             { bg: '#e0e7ff', text: '#3730a3', dot: '#6366f1' },
  'Other':                               { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};

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
  const [filterOffer, setFilterOffer] = useState('All');
  const [filterObjection, setFilterObjection] = useState('All');
  const [expandedRow, setExpandedRow] = useState(null);
  const [tags, setTags] = useState(loadTags);

  // Priority: manual tag > AI classification > regex fallback
  const getOffer = (row) => tags[row.id]?.offer ?? row.aiOffer ?? autoOffer(row);
  const getObjection = (row) => tags[row.id]?.objection ?? row.aiObjection ?? autoObjection(row);
  const getOfferDetail = (row) => row.aiOfferDetail || '';
  const getObjectionDetail = (row) => row.aiObjectionDetail || '';
  // Multiple objections per call (AI can return an array now)
  const getObjections = (row) => {
    if (tags[row.id]?.objection) return [tags[row.id].objection];
    if (Array.isArray(row.aiObjections) && row.aiObjections.length > 0) return row.aiObjections;
    if (row.aiObjection && row.aiObjection !== 'None' && row.aiObjection !== 'N/A') return [row.aiObjection];
    const fallback = autoObjection(row);
    return [fallback];
  };

  const setOfferFor = (rowId, offer) => {
    const next = { ...tags, [rowId]: { ...tags[rowId], offer } };
    setTags(next); saveTags(next);
  };
  const setObjectionFor = (rowId, objection) => {
    const next = { ...tags, [rowId]: { ...tags[rowId], objection } };
    setTags(next); saveTags(next);
  };

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
      const matchOffer = filterOffer === 'All' || getOffer(row) === filterOffer;
      const matchObjection = filterObjection === 'All' || getObjection(row) === filterObjection;
      return matchSearch && matchDateFrom && matchDateTo && matchOutcome && matchRep && matchOffer && matchObjection;
    });
  }, [rows, search, filterDateFrom, filterDateTo, filterOutcome, filterRep, filterOffer, filterObjection, tags]);

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
        <select value={filterOffer} onChange={e => setFilterOffer(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: '#374151' }}>
          <option value="All">All Offers</option>
          {OFFERS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filterObjection} onChange={e => setFilterObjection(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: '#374151' }}>
          <option value="All">All Objections</option>
          <option value="None">None</option>
          {OBJECTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {(search || filterOutcome !== 'All' || filterRep !== 'All' || filterOffer !== 'All' || filterObjection !== 'All' || filterDateFrom !== pacificToday || filterDateTo !== pacificToday) && (
          <button onClick={() => { setSearch(''); setFilterOutcome('All'); setFilterRep('All'); setFilterOffer('All'); setFilterObjection('All'); setFilterDateFrom(pacificToday); setFilterDateTo(pacificToday); }} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{filtered.length} calls</span>
        <span style={{ fontSize: 10, color: '#d1d5db' }}>{syncAge}</span>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              {['Date', 'Time', 'Rep', 'Contact', 'Company', 'Outcome', 'Offer', 'Objection', 'Duration', 'Transcript', 'Links'].map(h => (
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
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    {(() => {
                      const v = getOffer(row);
                      const c = OFFER_COLORS[v] || OFFER_COLORS['Other'];
                      // Prefer AI detail, fall back to regex summary
                      const summary = v === 'Other' ? (getOfferDetail(row) || summarizeOffer(row)) : '';
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 260 }}>
                          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.text, borderRadius: 5, padding: '3px 9px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                            {v}
                            <select value={v} onChange={e => setOfferFor(row.id, e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', border: 'none' }}>
                              {OFFERS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </label>
                          {summary && (
                            <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {summary}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    {(() => {
                      const objs = getObjections(row);
                      const hasOther = objs.includes('Other');
                      const summary = hasOther ? (getObjectionDetail(row) || summarizeObjection(row.objection?.text || '')) : '';
                      const primary = objs[0] || 'None';
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 260 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {objs.map((v, idx) => {
                              const c = OBJECTION_COLORS[v] || OBJECTION_COLORS['Other'];
                              const isFirst = idx === 0;
                              return (
                                <label key={v + idx} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.text, borderRadius: 5, padding: '3px 9px', fontSize: 12, fontWeight: 600, cursor: isFirst ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                                  {v}
                                  {isFirst && (
                                    <select value={v} onChange={e => setObjectionFor(row.id, e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', border: 'none' }}>
                                      <option value="None">None</option>
                                      {OBJECTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                          {summary && (
                            <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {summary}
                            </span>
                          )}
                        </div>
                      );
                    })()}
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
                <td colSpan={11} style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', fontSize: 14 }}>
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
