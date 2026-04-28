import { useState, useMemo } from 'react';
import { CALL_DATA as LEGACY_DATA } from './callData.js';
import { ALL_CALLS } from './allCallData.js';

// Merge: legacy data has rich fields (tags, stages), new data fills gaps
const legacyById = Object.fromEntries(LEGACY_DATA.map(c => [c.id, c]));
// Skip "junk" connects (pick up + hang up, <20s) — not meaningful
const CALL_DATA = ALL_CALLS
  .filter(c => c.isConnect)
  .filter(c => (c.durationMs || 0) >= 20000)
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
    if (legacy) return { ...legacy, ...aiFields, isConnect: c.isConnect, isConversation: c.isConversation, isMeeting: c.isMeeting };
    return {
      id: c.id, date: c.date, time: c.time, timestamp: c.timestamp,
      rep: c.rep, outcome: c.outcome, vertical: c.vertical || c.industry || '',
      title: c.title || '', contactName: c.contactName || '',
      durationMs: c.durationMs, transcript: c.transcript || '',
      recordingUrl: c.recordingUrl || '', hsUrl: c.hsUrl || '',
      persona: c.persona || '', offer: '',
      isConnect: c.isConnect, isConversation: c.isConversation, isMeeting: c.isMeeting,
      iceBreaker: c.iceBreaker || { text: '', success: false },
      hook: c.hook || { text: '', success: false },
      objection: c.objection || { text: 'None', success: 'NONE' },
      tags: [],
      ...aiFields,
    };
  });

// --- Objection categorization ---
function categorizeObjection(text) {
  if (!text || text === 'None' || text === 'NONE') return null;
  const t = text.toLowerCase();
  // Already solved / building in-house
  if (/already|in-house|internally|building.*ourselves|have.*partner|our.*team|own.*ai|we.*build|we.*doing.*lot|power automat|we.ve got.*department|well developed|ongoing.*framework|massive.*it.*department/.test(t)) return 'Building in-house / have solution';
  // Happy with current setup
  if (/happy|current.*(setup|solution|method)|working (well|fine)|satisfied|what i have.*works|in place.*working|we.re good|all set|good right now|doing.*things.*by hand.*lean/.test(t)) return 'Happy with current setup';
  // Not the right person / decisions made elsewhere
  if (/not.*decision|not authorized|corporate.*team|corporate.*runs|decisions.*made.*above|don.t make.*decision|not.*my.*area|cio.*handles|you.d need to call|strictly over operations|made at corporate|not.*involved|not.*part of/.test(t)) return 'Not the decision maker';
  // Personal phone / DNC
  if (/personal.*(phone|number|line|time|cell)|don.t discuss work|don.t ever call|do not.*call.*back|take.*name off|take me off|just take.*off|unsolicited|cyber risk/.test(t)) return 'Personal phone / DNC';
  // Immediate rejection / no interest
  if (/cold call|don.t take|no interest|not interested|no thanks|no thank|all good.*sales|sales call.*no|let.s not|sorry.*no|don.t have time for this|don.t like ai/.test(t)) return 'Immediate rejection';
  // Too busy / bad timing
  if (/busy|meeting|no time|not.*(right|good) time|middle of|between meetings|slammed|conference call|coming into|can.t.*talk|apartment shopping|out of.*office|call.*back.*tomorrow|call.*next/.test(t)) return 'Too busy / bad timing';
  // Not ready / purchasing freeze / onboarding
  if (/six months|not.*ready|coming together|integrat|purchasing freeze|hit.*pause|onboarding.*business|need to.*first|implement.*new.*tms|q[0-9]|next quarter/.test(t)) return 'Not ready / timing';
  // Budget / no appetite
  if (/budget|fund|cost|haven.t budgeted|no money|no.*appetite|too.*small|we.re.*small/.test(t)) return 'No budget / too small';
  // Send info / email first
  if (/email|send.*info|send.*over|forward|linkedin|ping me/.test(t)) return 'Send info / email first';
  // AI complexity / governance concerns
  if (/governance|architecture.*strategy|security.*review|supply chain.*approval|vetting|complex.*ai|ai.*risk|not.*allowed.*ai/.test(t)) return 'AI governance / compliance concerns';
  // Wrong person
  if (/wrong|not the right|i.m not.*the|financial.*not logistics|fleet maintenance|i.m.*owner of/.test(t)) return 'Wrong person / wrong dept';
  // Too new
  if (/new.*to|just started|not even.*month|haven.t done anything|still evaluating/.test(t)) return 'Too new at company';
  // Duplicate call frustration
  if (/another call.*from.*runbook|just.*hung up|too many|getting.*calls|overwhelming/.test(t)) return 'Call fatigue / too many calls';
  // Person left / retired
  if (/retir|no longer|left.*company|not.*here anymore/.test(t)) return 'Person left / retired';
  // Compared to competitor
  if (/zapier|similar to|is it like/.test(t)) return 'Compared to competitor';
  // Automated already
  if (/most.*automated|billing.*automated|api|edi/.test(t)) return 'Already automated';
  // Generic no
  if (/^no$|^not.*good.*time$|^sorry/.test(t.trim())) return 'Generic no';
  return 'Other';
}

// --- Hook categorization ---
function categorizeHook(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/never reached/.test(t)) return null;
  if (/billing|accounts payable|dispatch|carrier|pod|order.to.cash|invoice|back office|scheduling.*crew/.test(t)) return 'Use-Case Specific ("automate billing, AP, dispatch for logistics")';
  if (/common theme|challenge|production|edge case|struggle|trust.*accuracy|getting.*agents.*work/.test(t)) return 'Pain-Led ("teams struggle getting AI agents to work in production")';
  if (/platform.*build|build.*deploy|orchestration|no.code|natural language.*build/.test(t)) return 'Platform pitch ("platform to build and deploy agents, no code")';
  if (/manual coordination|automate.*manual|repetitive|80%|slows.*down|slow.*team/.test(t)) return 'Manual Work ("automate manual coordination that slows teams down")';
  return 'Generic / exploratory ("working with IT teams, curious if relevant")';
}

// --- Icebreaker element detection (not categories — elements can stack) ---
const IB_ELEMENTS = [
  { key: 'title', label: 'Mentions their title/role', example: '"I see you\'re leading IT at Shell..."', regex: /i see your|i noticed|leading|working on|director|manager|cio|cto|vp |architect|operations|it team|data and|your.*role|look after/i },
  { key: 'followup', label: 'Follow-up reference', example: '"We spoke last week, wanted to continue..."', regex: /follow.up|spoke.*last|talked.*before|called.*earlier|we chatted|called.*other day|callback|spoke.*week|spoke.*ago|sent.*note|left.*message/i },
  { key: 'company', label: 'Mentions their company', example: '"I see you\'re at Shell / FedEx..."', regex: /at (shell|pike|eco|ryder|fedex|pepsi|brock|otis|gordon|lineage|werner|crowley|western|motive|barn)|at your|over at/i },
  { key: '30sec', label: '"Borrow 30 seconds" ask', example: '"Can I borrow 30 seconds to explain?"', regex: /borrow.*(30|thirty)|mind if|seconds|quick second|quick moment/i },
  { key: 'howru', label: '"How are you?" opener', example: '"Hey, how are you?" (small talk first)', regex: /how are you|how.s it going|how you doing|how have you been/i },
];

// --- SVG Mini Line Chart ---
function MiniChart({ data, dataKey, color, height = 120 }) {
  if (data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: 12 }}>Not enough data</div>;
  const W = 500, H = height, PAD = { top: 8, right: 10, bottom: 24, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const values = data.map(d => d[dataKey]);
  const maxVal = Math.max(...values, 5);
  const yMax = Math.ceil(maxVal / 10) * 10 || 10;

  const points = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1)) * plotW,
    y: PAD.top + plotH - (d[dataKey] / yMax) * plotH,
    val: d[dataKey], label: d.label,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${PAD.top + plotH} L ${points[0].x} ${PAD.top + plotH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, yMax / 2, yMax].map(tick => {
        const y = PAD.top + plotH - (tick / yMax) * plotH;
        return <g key={tick}><line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth={1} /><text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#9ca3af">{Math.round(tick)}%</text></g>;
      })}
      <path d={areaD} fill={color} opacity={0.06} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={1.5} /><title>{p.label}: {p.val.toFixed(1)}%</title></g>)}
      {data.map((d, i) => {
        if (data.length > 12 && i % 2 !== 0 && i !== data.length - 1) return null;
        const x = PAD.left + (i / (data.length - 1)) * plotW;
        return <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{d.label}</text>;
      })}
    </svg>
  );
}

// --- Metric Card ---
function MetricCard({ label, value, sub, color, big }) {
  return (
    <div style={{ background: color + '08', border: `1px solid ${color}18`, borderRadius: 10, padding: big ? '16px 20px' : '12px 16px', flex: 1, minWidth: big ? 140 : 100 }}>
      <div style={{ fontSize: big ? 32 : 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, opacity: 0.6, marginTop: 3, fontWeight: 600 }}>{sub}</div>}
      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// --- Objection Bar ---
function ObjBar({ label, count, total, color }) {
  const pct = total ? (count / total * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{ width: 180, fontSize: 12, color: '#374151', fontWeight: 500, textAlign: 'right', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 20, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, minWidth: count > 0 ? 2 : 0 }} />
      </div>
      <div style={{ width: 60, fontSize: 12, fontWeight: 700, color, textAlign: 'right' }}>{count} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({Math.round(pct)}%)</span></div>
    </div>
  );
}

// --- Call Highlight Card ---
// --- Main ---
export default function AnalyticsCharts() {
  const pacificNow = () => new Date(Date.now() - 7 * 60 * 60 * 1000);
  const todayStr = pacificNow().toISOString().slice(0, 10);
  const mondayStr = (() => { const d = pacificNow(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d.toISOString().slice(0, 10); })();
  // Default to last Friday if weekend, else today
  const defaultDay = (() => {
    const d = pacificNow();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() - 2);
    else if (day === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const [dateFrom, setDateFrom] = useState(defaultDay);
  const [dateTo, setDateTo] = useState(defaultDay);

  // Notes & Changes
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('call_analytics_notes') || '[]'); } catch { return []; } });
  const [noteText, setNoteText] = useState('');
  const [noteDate, setNoteDate] = useState(todayStr);
  const [noteAnalysis, setNoteAnalysis] = useState({}); // noteId -> { text, loading }
  const apiKey = localStorage.getItem('anthropic_api_key') || '';

  const saveNote = () => {
    if (!noteText.trim()) return;
    const newNote = { id: Date.now(), text: noteText.trim(), date: noteDate, createdAt: new Date().toISOString() };
    const updated = [newNote, ...notes];
    setNotes(updated);
    localStorage.setItem('call_analytics_notes', JSON.stringify(updated));
    setNoteText('');
  };

  const deleteNote = (id) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    localStorage.setItem('call_analytics_notes', JSON.stringify(updated));
  };

  const getBeforeAfter = (noteDate) => {
    const before = CALL_DATA.filter(d => d.date && d.date < noteDate && d.date >= (() => { const dt = new Date(noteDate + 'T12:00:00'); dt.setDate(dt.getDate() - 7); return dt.toISOString().slice(0, 10); })());
    const after = CALL_DATA.filter(d => d.date && d.date >= noteDate);
    const calc = (arr) => {
      const total = arr.length;
      const convos = arr.filter(d => d.durationMs >= 60000).length;
      const mtgs = arr.filter(d => d.isMeeting).length;
      const wrongNum = arr.filter(d => d.outcome === 'Wrong number').length;
      const days = new Set(arr.map(d => d.date)).size;
      return { total, convos, mtgs, wrongNum, days, connectRate: total, convoRate: total ? Math.round(convos / total * 100) : 0, wrongRate: total ? Math.round(wrongNum / total * 100) : 0, mtgRate: convos ? Math.round(mtgs / convos * 100) : 0 };
    };
    return { before: calc(before), after: calc(after) };
  };

  const analyzeNote = async (note) => {
    if (!apiKey) return;
    setNoteAnalysis(prev => ({ ...prev, [note.id]: { text: '', loading: true } }));
    const { before, after } = getBeforeAfter(note.date);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 400,
          messages: [{ role: 'user', content: `You are a sales operations analyst. Be honest and critical.

A cold calling team made this change: "${note.text}" on ${note.date}.

BEFORE (7 days prior):
- ${before.total} connects over ${before.days} days
- ${before.convos} conversations (1m+), ${before.convoRate}% conversation rate
- ${before.mtgs} meetings booked, ${before.mtgRate}% conv→meeting rate
- ${before.wrongNum} wrong numbers, ${before.wrongRate}% wrong number rate

AFTER (${note.date} to today):
- ${after.total} connects over ${after.days} days
- ${after.convos} conversations (1m+), ${after.convoRate}% conversation rate
- ${after.mtgs} meetings booked, ${after.mtgRate}% conv→meeting rate
- ${after.wrongNum} wrong numbers, ${after.wrongRate}% wrong number rate

Analyze in 3-4 sentences:
1. Did the key metrics improve or worsen?
2. Is the sample size enough to draw conclusions? (be specific about how many more days needed)
3. Are there confounding variables that could explain the change?
4. What's your recommendation?` }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || 'No analysis available.';
        setNoteAnalysis(prev => ({ ...prev, [note.id]: { text, loading: false } }));
      }
    } catch (e) {
      setNoteAnalysis(prev => ({ ...prev, [note.id]: { text: `Error: ${e.message}`, loading: false } }));
    }
  };

  // All calls in date range (connects only — for detailed analysis)
  const filtered = useMemo(() => CALL_DATA.filter(d => d.date && d.date >= dateFrom && d.date <= dateTo), [dateFrom, dateTo]);
  // ALL dials in date range (includes no-answer, voicemail — for funnel)
  const allDials = useMemo(() => ALL_CALLS.filter(d => d.date && d.date >= dateFrom && d.date <= dateTo), [dateFrom, dateTo]);

  // --- Full funnel metrics ---
  const totalDials = allDials.length;
  const totalConnects = allDials.filter(d => d.isConnect).length;
  const connectRate = totalDials ? (totalConnects / totalDials * 100) : 0;
  const conversations = allDials.filter(d => d.isConversation).length;
  const meetings = allDials.filter(d => d.isMeeting).length;

  // Legacy metrics (from connects only)
  const total = filtered.length;
  const wrongNumber = filtered.filter(d => d.outcome === 'Wrong number').length;
  const wrongContact = filtered.filter(d => d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number').length;
  const realConvos = filtered.filter(d => !d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number').length;

  // --- Per rep (full funnel from ALL dials) ---
  const reps = {};
  allDials.forEach(d => {
    const r = d.rep;
    if (!reps[r]) reps[r] = { dials: 0, connects: 0, conversations: 0, meetings: 0, positive: 0, negative: 0, heardPitch: 0 };
    reps[r].dials++;
    if (d.isConnect) reps[r].connects++;
    if (d.isConversation) reps[r].conversations++;
    if (d.isMeeting) reps[r].meetings++;
    if ((d.outcome || '').startsWith('Connected Positive')) reps[r].positive++;
    if ((d.outcome || '').startsWith('Connected Negative')) reps[r].negative++;
  });
  // Add heardPitch from enriched connects
  filtered.forEach(d => {
    if (d.hook?.success && reps[d.rep]) reps[d.rep].heardPitch++;
  });

  // --- Pitch funnel ---
  const withStages = filtered.filter(d => d.iceBreaker?.text);
  const ibPassed = withStages.filter(d => d.iceBreaker?.success).length;
  const hookPassed = withStages.filter(d => d.hook?.success).length;
  const heardPitchTotal = hookPassed;

  // --- Objection aggregation — only counts objections on CONVERSATIONS (>60s) to match Offer Performance ---
  const manualTags = (() => { try { return JSON.parse(localStorage.getItem('call_tags_v1') || '{}'); } catch { return {}; } })();
  const objCounts = {};
  filtered.forEach(d => {
    // Only count convos (>60s) — short calls don't have real objections
    if (d.durationMs < 60000) return;
    // Manual tag overrides all
    if (manualTags[d.id]?.objection) {
      const cat = manualTags[d.id].objection;
      if (cat && cat !== 'N/A' && cat !== 'None') objCounts[cat] = (objCounts[cat] || 0) + 1;
      return;
    }
    // Use array if available, else fall back to single
    const cats = Array.isArray(d.aiObjections) && d.aiObjections.length > 0
      ? d.aiObjections
      : (d.aiObjection && d.aiObjection !== 'None' && d.aiObjection !== 'N/A' ? [d.aiObjection] : []);
    cats.forEach(cat => {
      if (cat && cat !== 'N/A' && cat !== 'None') objCounts[cat] = (objCounts[cat] || 0) + 1;
    });
  });
  const sortedObjs = Object.entries(objCounts).sort((a, b) => b[1] - a[1]);
  const totalObjs = sortedObjs.reduce((a, [, v]) => a + v, 0);

  // --- Daily trend data (from ALL dials) ---
  const daily = useMemo(() => {
    const byDate = {};
    allDials.forEach(d => {
      if (!d.date) return;
      if (!byDate[d.date]) byDate[d.date] = { dials: 0, connects: 0, meetings: 0, conversations: 0 };
      byDate[d.date].dials++;
      if (d.isConnect) byDate[d.date].connects++;
      if (d.isMeeting) byDate[d.date].meetings++;
      if (d.isConversation) byDate[d.date].conversations++;
    });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
      date, label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      connectRate: d.dials ? (d.connects / d.dials * 100) : 0,
      meetingRate: d.dials ? (d.meetings / d.dials * 100) : 0,
      convoRate: d.connects ? (d.conversations / d.connects * 100) : 0,
      ...d,
    }));
  }, [allDials]);

  // --- Hook & Icebreaker analytics ---
  const meetingCalls = filtered.filter(d => d.isMeeting).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // --- Best time to call (all calls by hour) ---
  const hourlyStats = useMemo(() => {
    const hours = {};
    let totalAll = 0;
    filtered.forEach(d => {
      const t = (d.time || '').trim();
      if (!t) return;
      try {
        const parts = t.split(':');
        let h = parseInt(parts[0]);
        const ampm = t.slice(-2).toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        if (!hours[h]) hours[h] = { total: 0, convos: 0, meetings: 0, wrong: 0 };
        hours[h].total++;
        totalAll++;
        if (d.durationMs >= 60000) hours[h].convos++;
        if (d.isMeeting) hours[h].meetings++;
        if (d.outcome?.startsWith('Wrong') || d.outcome === 'Wrong number') hours[h].wrong++;
      } catch {}
    });
    return { hours, totalAll };
  }, [filtered]);

  // Offer Performance — only counts CONVERSATIONS (>60s) to measure real pitch effectiveness
  const hookStats = useMemo(() => {
    const cats = {};
    filtered.forEach(d => {
      // Only include real conversations (>60s) where a pitch actually happened
      if (d.durationMs < 60000) return;
      const cat = d.aiOffer;
      if (!cat || cat === 'Not reached' || cat === 'Follow-up call') return;
      if (!cats[cat]) cats[cat] = { total: 0, meetings: 0 };
      cats[cat].total++;
      if (d.isMeeting) cats[cat].meetings++;
    });
    return Object.entries(cats).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const ibStats = useMemo(() => {
    const FOLLOWUP_RE = /follow.up|spoke.*last|talked.*before|called.*earlier|we chatted|called.*other day|callback|spoke.*week|spoke.*ago|sent.*note|left.*message/i;
    // Split warm vs cold
    let warmTotal = 0, warmPassed = 0, warmMeetings = 0;
    let coldTotal = 0, coldPassed = 0, coldMeetings = 0;
    filtered.forEach(d => {
      const ib = d.iceBreaker?.text;
      if (!ib) return;
      if (FOLLOWUP_RE.test(ib)) {
        warmTotal++; if (d.iceBreaker?.success) warmPassed++; if (d.isMeeting) warmMeetings++;
      } else {
        coldTotal++; if (d.iceBreaker?.success) coldPassed++; if (d.isMeeting) coldMeetings++;
      }
    });
    // Element stats (cold calls only)
    const coldElements = IB_ELEMENTS.filter(el => el.key !== 'followup').map(el => {
      let total = 0, passed = 0, meetings = 0;
      filtered.forEach(d => {
        const ib = d.iceBreaker?.text;
        if (!ib || FOLLOWUP_RE.test(ib)) return; // skip warm calls
        if (el.regex.test(ib)) {
          total++; if (d.iceBreaker?.success) passed++; if (d.isMeeting) meetings++;
        }
      });
      return { ...el, total, passed, meetings };
    }).filter(el => el.total > 0).sort((a, b) => (b.total ? b.passed / b.total : 0) - (a.total ? a.passed / a.total : 0));
    return { warmTotal, warmPassed, warmMeetings, coldTotal, coldPassed, coldMeetings, coldElements };
  }, [filtered]);

  // Quick presets
  const yesterdayStr = (() => { const d = pacificNow(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Period:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
        <span style={{ color: '#9ca3af' }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
        {[['Today', todayStr, todayStr], ['Yesterday', yesterdayStr, yesterdayStr], ['This Week', mondayStr, todayStr],
          ['Last 14d', (() => { const d = pacificNow(); d.setDate(d.getDate()-14); return d.toISOString().slice(0,10); })(), todayStr],
          ['All Time', '2026-02-01', todayStr],
        ].map(([label, from, to]) => (
          <button key={label} onClick={() => { setDateFrom(from); setDateTo(to); }} style={{
            background: dateFrom === from && dateTo === to ? '#eef2ff' : '#f3f4f6',
            border: `1px solid ${dateFrom === from && dateTo === to ? '#c7d2fe' : '#e5e7eb'}`,
            borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#374151',
            fontWeight: dateFrom === from && dateTo === to ? 700 : 400,
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{totalDials} dials · {totalConnects} connects · {daily.length} days</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#f8fafc' }}>
        <div style={{ maxWidth: 1200 }}>

          {/* ===== ROW 1: FULL FUNNEL ===== */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <MetricCard label="Dials" value={totalDials} color="#6b7280" big />
            <MetricCard label="Connects" value={totalConnects} sub={`${connectRate.toFixed(1)}% connect rate`} color="#4f46e5" big />
            <MetricCard label="Conversations (>1m)" value={conversations} sub={totalConnects ? `${Math.round(conversations / totalConnects * 100)}% of connects` : ''} color="#2563eb" big />
            <MetricCard label="Meetings Booked" value={meetings} sub={totalDials ? `${(meetings / totalDials * 100).toFixed(2)}% of dials` : ''} color="#16a34a" big />
          </div>

          {/* ===== OFFER PERFORMANCE + CALL OUTCOMES ===== */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Offer Performance — Convos only (>60s). Bar visual shows relative Conv→Mtg rate. */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1.2, minWidth: 380 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Offer Performance</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 14 }}>Convos (&gt;1m) where each offer was pitched. Bar = Conv→Mtg rate.</div>
              {hookStats.length > 0 ? (() => {
                // Max rate for normalizing bar widths
                const maxRate = Math.max(...hookStats.map(([, d]) => d.total ? (d.meetings / d.total * 100) : 0), 1);
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#374151', fontWeight: 600 }}>Offer</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, color: '#374151', fontWeight: 600 }}>Convos</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, color: '#374151', fontWeight: 600 }}>Meetings</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#374151', fontWeight: 600, minWidth: 140 }}>Conv→Mtg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hookStats.map(([cat, d], i) => {
                        const rate = d.total ? (d.meetings / d.total * 100) : 0;
                        const rateInt = Math.round(rate);
                        const barWidth = maxRate > 0 ? (rate / maxRate * 100) : 0;
                        const barColor = rateInt >= 15 ? '#16a34a' : rateInt > 0 ? '#d97706' : rateInt === 0 && d.total > 0 ? '#ef4444' : '#e5e7eb';
                        return (
                          <tr key={cat} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '8px 10px', color: '#1f2937' }}>{cat}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#1f2937' }}>{d.total}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#1f2937' }}>{d.meetings}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 10, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.max(barWidth, rateInt > 0 ? 4 : 0)}%`, height: '100%', background: barColor, borderRadius: 3, opacity: 0.85 }} />
                                </div>
                                <span style={{ color: '#1f2937', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{rateInt}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })() : <div style={{ color: '#9ca3af', fontSize: 12 }}>No offer data for this period</div>}
            </div>

            {/* Call outcomes — breakdown of CONNECTS only */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1.5, minWidth: 350 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Call Outcomes</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 12 }}>% of {totalConnects} connected calls</div>
              {(() => {
                const connectedOnly = allDials.filter(d => d.isConnect);
                const outcomes = {};
                connectedOnly.forEach(d => { outcomes[d.outcome] = (outcomes[d.outcome] || 0) + 1; });
                const sorted = Object.entries(outcomes).sort((a, b) => b[1] - a[1]);
                const colorMap = {
                  'Connected': '#4f46e5', 'Connected : Confirmed Meeting': '#16a34a', 'Connected : Demo Set': '#16a34a',
                  'Connected : No Longer With Company': '#9ca3af', 'Connected : Not Decision Maker': '#f97316', 'Connected : Opt Out': '#ef4444',
                  'Connected Negative - Competitor': '#ef4444', 'Connected Negative - Homegrown': '#ef4444',
                  'Connected Negative - Other': '#ef4444', 'Connected Negative - Timing': '#d97706',
                  'Connected Positive : Add To Strat': '#0891b2', 'Connected Positive : Call Later': '#0891b2',
                  'Connected Positive : Follow-Up (PS)': '#0891b2',
                  'Hung Up': '#9ca3af', 'Left live message': '#9ca3af', 'Left voicemail': '#9ca3af',
                  'Busy': '#d97706', 'No answer': '#9ca3af', 'Wrong number': '#f97316',
                };
                return sorted.map(([outcome, count]) => (
                  <ObjBar key={outcome} label={outcome} count={count} total={totalConnects} color={colorMap[outcome] || '#6b7280'} />
                ));
              })()}
            </div>
          </div>

          {/* ===== CALL ANALYSIS header ===== */}
          <div style={{ background: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: 700, fontSize: 13, borderRadius: '6px 6px 0 0', marginTop: 8 }}>
            CALL ANALYSIS {withStages.length > 0 ? `(${withStages.length} analyzed calls)` : '— select a date range including Mar 26 - Apr 10 for AI analysis'}
          </div>

          {/* ===== TOP OBJECTIONS (AI-analyzed calls only) ===== */}
          {withStages.length > 0 && (
            <div style={{ background: 'white', borderRadius: '0 0 10px 10px', border: '1px solid #e5e7eb', borderTop: 'none', padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>Top Objections <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>(AI-analyzed calls only)</span></div>
              {sortedObjs.length > 0 ? sortedObjs.filter(([obj]) => obj !== 'Other').map(([obj, count]) => (
                <ObjBar key={obj} label={obj} count={count} total={totalObjs} color={
                  obj.includes('Happy') || obj.includes('Already') ? '#2563eb' :
                  obj.includes('Wrong') ? '#d97706' :
                  obj.includes('rejection') || obj.includes('DNC') ? '#ef4444' :
                  obj.includes('budget') ? '#dc2626' :
                  '#6b7280'
                } />
              )) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No objection data</div>}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
