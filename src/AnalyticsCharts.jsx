import { useState, useMemo } from 'react';
import { CALL_DATA } from './callData.js';

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
  const todayStr = new Date().toISOString().slice(0, 10);
  const mondayStr = (() => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d.toISOString().slice(0, 10); })();
  const [dateFrom, setDateFrom] = useState(mondayStr);
  const [dateTo, setDateTo] = useState(todayStr);

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
      const mtgs = arr.filter(d => d.outcome === 'Meeting Booked').length;
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

  const filtered = useMemo(() => CALL_DATA.filter(d => d.date && d.date >= dateFrom && d.date <= dateTo), [dateFrom, dateTo]);

  // --- Core metrics ---
  const total = filtered.length;
  const wrongNumber = filtered.filter(d => d.outcome === 'Wrong number').length;
  const wrongContact = filtered.filter(d => d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number').length;
  const realConvos = filtered.filter(d => !d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number').length;
  const conversations = filtered.filter(d => d.durationMs >= 60000).length; // 1m+ = conversation
  const meetings = filtered.filter(d => d.outcome === 'Meeting Booked').length;

  // --- Per rep ---
  const reps = {};
  filtered.forEach(d => {
    const r = d.rep;
    if (!reps[r]) reps[r] = { dials: 0, wrongNumber: 0, wrongContact: 0, realConvos: 0, meetings: 0, followUp: 0, notInterested: 0, heardPitch: 0 };
    reps[r].dials++;
    if (d.outcome === 'Wrong number') reps[r].wrongNumber++;
    else if (d.outcome.startsWith('Wrong')) reps[r].wrongContact++;
    else reps[r].realConvos++;
    if (d.outcome === 'Meeting Booked') reps[r].meetings++;
    if (d.outcome === 'Follow up - interested') reps[r].followUp++;
    if (d.outcome === 'Not Interested') reps[r].notInterested++;
    if (d.hook?.success) reps[r].heardPitch++;
  });

  // --- Pitch funnel ---
  const withStages = filtered.filter(d => d.iceBreaker?.text);
  const ibPassed = withStages.filter(d => d.iceBreaker?.success).length;
  const hookPassed = withStages.filter(d => d.hook?.success).length;
  const heardPitchTotal = hookPassed;

  // --- Objection aggregation ---
  const objCounts = {};
  filtered.forEach(d => {
    const cat = categorizeObjection(d.objection?.text);
    if (cat) objCounts[cat] = (objCounts[cat] || 0) + 1;
  });
  const sortedObjs = Object.entries(objCounts).sort((a, b) => b[1] - a[1]);
  const totalObjs = sortedObjs.reduce((a, [, v]) => a + v, 0);

  // --- Daily trend data ---
  const daily = useMemo(() => {
    const byDate = {};
    filtered.forEach(d => {
      if (!d.date) return;
      if (!byDate[d.date]) byDate[d.date] = { connects: 0, meetings: 0, wrongNumber: 0, conversations: 0, realConvos: 0 };
      byDate[d.date].connects++;
      if (d.outcome === 'Meeting Booked') byDate[d.date].meetings++;
      if (d.outcome === 'Wrong number') byDate[d.date].wrongNumber++;
      if (d.durationMs >= 60000) byDate[d.date].conversations++;
      if (!d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number') byDate[d.date].realConvos++;
    });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
      date, label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      meetingRate: d.connects ? (d.meetings / d.connects * 100) : 0,
      wrongNumberRate: d.connects ? (d.wrongNumber / d.connects * 100) : 0,
      convoRate: d.connects ? (d.conversations / d.connects * 100) : 0,
      realConvoRate: d.connects ? (d.realConvos / d.connects * 100) : 0,
      ...d,
    }));
  }, [filtered]);

  // --- Hook & Icebreaker analytics ---
  const meetingCalls = filtered.filter(d => d.outcome === 'Meeting Booked').sort((a, b) => b.timestamp.localeCompare(a.timestamp));

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
        if (d.outcome === 'Meeting Booked') hours[h].meetings++;
        if (d.outcome?.startsWith('Wrong') || d.outcome === 'Wrong number') hours[h].wrong++;
      } catch {}
    });
    return { hours, totalAll };
  }, [filtered]);

  const hookStats = useMemo(() => {
    const cats = {};
    filtered.forEach(d => {
      const cat = categorizeHook(d.hook?.text);
      if (!cat) return;
      if (!cats[cat]) cats[cat] = { total: 0, conversations: 0, meetings: 0 };
      cats[cat].total++;
      if (d.durationMs >= 60000) cats[cat].conversations++; // 1m+ = conversation
      if (d.outcome === 'Meeting Booked') cats[cat].meetings++;
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
        warmTotal++; if (d.iceBreaker?.success) warmPassed++; if (d.outcome === 'Meeting Booked') warmMeetings++;
      } else {
        coldTotal++; if (d.iceBreaker?.success) coldPassed++; if (d.outcome === 'Meeting Booked') coldMeetings++;
      }
    });
    // Element stats (cold calls only)
    const coldElements = IB_ELEMENTS.filter(el => el.key !== 'followup').map(el => {
      let total = 0, passed = 0, meetings = 0;
      filtered.forEach(d => {
        const ib = d.iceBreaker?.text;
        if (!ib || FOLLOWUP_RE.test(ib)) return; // skip warm calls
        if (el.regex.test(ib)) {
          total++; if (d.iceBreaker?.success) passed++; if (d.outcome === 'Meeting Booked') meetings++;
        }
      });
      return { ...el, total, passed, meetings };
    }).filter(el => el.total > 0).sort((a, b) => (b.total ? b.passed / b.total : 0) - (a.total ? a.passed / a.total : 0));
    return { warmTotal, warmPassed, warmMeetings, coldTotal, coldPassed, coldMeetings, coldElements };
  }, [filtered]);

  // Quick presets
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Period:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
        <span style={{ color: '#9ca3af' }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 8px', fontSize: 12 }} />
        {[['Today', todayStr, todayStr], ['Yesterday', yesterdayStr, yesterdayStr], ['This Week', mondayStr, todayStr],
          ['Last 14d', (() => { const d = new Date(); d.setDate(d.getDate()-14); return d.toISOString().slice(0,10); })(), todayStr],
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
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{total} connects · {daily.length} days</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#f8fafc' }}>
        <div style={{ maxWidth: 1200 }}>

          {/* ===== ROW 1: KEY METRICS ===== */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <MetricCard label="Total Connects" value={total} color="#4f46e5" big />
            <MetricCard label="Real Conversations" value={realConvos} sub={`${total ? Math.round(realConvos / total * 100) : 0}% of connects`} color="#059669" big />
            <MetricCard label="Wrong Numbers" value={wrongNumber} sub={`${total ? Math.round(wrongNumber / total * 100) : 0}% of connects`} color="#ef4444" big />
            <MetricCard label="Meetings Booked" value={meetings} sub={realConvos ? `${Math.round(meetings / realConvos * 100)}% of real convos` : ''} color="#16a34a" big />
            <MetricCard label="Conversations (1m+)" value={conversations} sub={conversations ? `${Math.round(meetings / conversations * 100)}% → meetings` : ''} color="#2563eb" big />
          </div>

          {/* ===== ROW 2: REP COMPARISON ===== */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ background: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>Rep Comparison</div>
            <div style={{ display: 'flex', background: '#eff6ff', fontWeight: 700, fontSize: 11, borderBottom: '1px solid #dbeafe' }}>
              {['Rep', 'Connects', 'Real Convos', 'Wrong #', 'W# Rate', 'Heard Pitch', 'Meetings', 'Follow Up', 'Not Int'].map((h, i) => (
                <div key={h} style={{ flex: i === 0 ? 2 : 1, padding: '8px 12px', textAlign: i === 0 ? 'left' : 'center', color: '#1f2937' }}>{h}</div>
              ))}
            </div>
            {Object.entries(reps).sort((a, b) => b[1].dials - a[1].dials).map(([rep, d], i) => (
              <div key={rep} style={{ display: 'flex', fontSize: 12, borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f8f9fa' : 'white' }}>
                <div style={{ flex: 2, padding: '10px 12px', fontWeight: 700, color: '#1f2937' }}>{rep}</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>{d.dials}</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>{d.realConvos} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({d.dials ? Math.round(d.realConvos / d.dials * 100) : 0}%)</span></div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>{d.wrongNumber}</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', color: d.dials && d.wrongNumber / d.dials > 0.4 ? '#ef4444' : '#374151', fontWeight: 600 }}>{d.dials ? Math.round(d.wrongNumber / d.dials * 100) : 0}%</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{d.heardPitch}</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{d.meetings}</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', color: '#2563eb' }}>{d.followUp}</div>
                <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', color: '#dc2626' }}>{d.notInterested}</div>
              </div>
            ))}
          </div>

          {/* ===== ROW 3: PITCH FUNNEL + TOP OBJECTIONS ===== */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Pitch funnel */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>Pitch Funnel</div>
              {withStages.length > 0 ? (
                <div>
                  {[
                    { label: 'Connected (with transcripts)', value: withStages.length, pct: 100, color: '#4f46e5' },
                    { label: 'Ice Breaker Passed', value: ibPassed, pct: withStages.length ? Math.round(ibPassed / withStages.length * 100) : 0, color: '#059669' },
                    { label: 'Heard Full Pitch', value: heardPitchTotal, pct: withStages.length ? Math.round(heardPitchTotal / withStages.length * 100) : 0, color: '#2563eb' },
                    { label: 'Meeting Booked', value: meetings, pct: heardPitchTotal ? Math.round(meetings / heardPitchTotal * 100) : 0, color: '#16a34a', note: 'of those who heard pitch' },
                  ].map(s => (
                    <div key={s.label} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                        <span style={{ color: '#374151' }}>{s.label}</span>
                        <span style={{ fontWeight: 700, color: s.color }}>{s.value} ({s.pct}%){s.note ? ` ${s.note}` : ''}</span>
                      </div>
                      <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                        <div style={{ width: `${Math.min(s.pct, 100)}%`, height: '100%', background: s.color, borderRadius: 4, opacity: 0.7 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No stage data for this period</div>}
            </div>

            {/* Top objections */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1.5, minWidth: 350 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>Top Objections</div>
              {sortedObjs.length > 0 ? sortedObjs.filter(([obj]) => obj !== 'Other').map(([obj, count]) => (
                <ObjBar key={obj} label={obj} count={count} total={totalObjs} color={
                  obj.includes('Happy') || obj.includes('Already') ? '#2563eb' :
                  obj.includes('Wrong') ? '#d97706' :
                  obj.includes('rejection') || obj.includes('DNC') ? '#ef4444' :
                  obj.includes('budget') ? '#dc2626' :
                  '#6b7280'
                } />
              )) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No objection data for this period</div>}
            </div>
          </div>

          {/* ===== ROW 4: HOOK & ICEBREAKER PERFORMANCE ===== */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Hook performance — dual metric */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1.2, minWidth: 380 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>Hook Performance</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 14 }}>Conversation = call 1m+. Conv→Mtg = meetings / conversations.</div>
              {hookStats.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Hook</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Calls</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Convos (1m+)</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Meetings</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Conv→Mtg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hookStats.map(([cat, d], i) => {
                      const convMtgRate = d.conversations ? Math.round(d.meetings / d.conversations * 100) : 0;
                      return (
                        <tr key={cat} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f8f9fa' : 'white' }}>
                          <td style={{ padding: '8px 0', color: '#374151', fontWeight: 500, fontSize: 11, maxWidth: 220 }}>{cat}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: '#6b7280' }}>{d.total}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{d.conversations}</td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: d.meetings > 0 ? '#16a34a' : '#d1d5db' }}>{d.meetings}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: convMtgRate >= 15 ? '#16a34a' : convMtgRate > 0 ? '#d97706' : '#d1d5db', background: convMtgRate >= 15 ? '#dcfce710' : 'transparent' }}>{convMtgRate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No hook data for this period</div>}
            </div>

            {/* Icebreaker elements */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1, minWidth: 320 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>Icebreaker Elements</div>

              {/* Warm vs Cold split */}
              {(ibStats.warmTotal > 0 || ibStats.coldTotal > 0) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 6, padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>WARM (follow-ups)</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{ibStats.warmTotal > 0 ? Math.round(ibStats.warmPassed / ibStats.warmTotal * 100) : 0}%</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{ibStats.warmTotal} calls · {ibStats.warmMeetings} mtgs</div>
                  </div>
                  <div style={{ flex: 1, background: '#eff6ff', borderRadius: 6, padding: '8px 10px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>COLD (first contact)</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{ibStats.coldTotal > 0 ? Math.round(ibStats.coldPassed / ibStats.coldTotal * 100) : 0}%</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{ibStats.coldTotal} calls · {ibStats.coldMeetings} mtgs</div>
                  </div>
                </div>
              )}

              {/* Cold call elements only */}
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Cold call elements (what improves pass rate?)</div>
              {ibStats.coldElements.length > 0 ? ibStats.coldElements.map(el => {
                const passRate = el.total ? Math.round(el.passed / el.total * 100) : 0;
                return (
                  <div key={el.key} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>{el.label}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#ef4444', whiteSpace: 'nowrap' }}>
                        {passRate}% pass · {el.total} calls · {el.meetings} mtgs
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginBottom: 3 }}>{el.example}</div>
                    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3 }}>
                      <div style={{ width: `${passRate}%`, height: '100%', background: passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#ef4444', borderRadius: 3, opacity: 0.7 }} />
                    </div>
                  </div>
                );
              }) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No cold call data for this period</div>}
            </div>
          </div>

          {/* ===== ROW 5: DAILY TREND CHARTS ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { key: 'realConvoRate', color: '#059669', title: 'Real Conversation Rate', avg: daily.length ? (daily.reduce((a, d) => a + d.realConvoRate, 0) / daily.length) : 0 },
              { key: 'wrongNumberRate', color: '#ef4444', title: 'Wrong Number Rate', avg: daily.length ? (daily.reduce((a, d) => a + d.wrongNumberRate, 0) / daily.length) : 0 },
              { key: 'meetingRate', color: '#16a34a', title: 'Meeting Rate', avg: daily.length ? (daily.reduce((a, d) => a + d.meetingRate, 0) / daily.length) : 0 },
              { key: 'convoRate', color: '#2563eb', title: 'Conversation Rate (1m+ calls)', avg: daily.length ? (daily.reduce((a, d) => a + (d.convoRate || 0), 0) / daily.length) : 0 },
            ].map(chart => (
              <div key={chart.key} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{chart.title}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: chart.color }}>{chart.avg.toFixed(1)}%</span>
                </div>
                <MiniChart data={daily} dataKey={chart.key} color={chart.color} />
              </div>
            ))}
          </div>

          {/* ===== BEST TIME TO CALL ===== */}
          {hourlyStats.totalAll > 0 && (
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ background: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>Best Time to Call</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#eff6ff', borderBottom: '2px solid #dbeafe' }}>
                    {['Hour', 'Connects', '% of Total', 'Convos (1m+)', 'Convo Rate', 'Meetings', 'Wrong #', 'Wrong %'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: '#1f2937' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }, (_, i) => i + 7).map((h, i) => {
                    const d = hourlyStats.hours[h] || { total: 0, convos: 0, meetings: 0, wrong: 0 };
                    if (d.total === 0) return null;
                    const pctTotal = hourlyStats.totalAll ? (d.total / hourlyStats.totalAll * 100) : 0;
                    const convoRate = d.total ? (d.convos / d.total * 100) : 0;
                    const wrongRate = d.total ? (d.wrong / d.total * 100) : 0;
                    const label = h > 12 ? `${h - 12}:00 PM` : h === 12 ? '12:00 PM' : `${h}:00 AM`;
                    return (
                      <tr key={h} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f8f9fa' : 'white' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: '#374151' }}>{label}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{d.total}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: '#f3f4f6', borderRadius: 3 }}>
                              <div style={{ width: `${pctTotal}%`, height: '100%', background: '#4f46e5', borderRadius: 3, opacity: 0.6 }} />
                            </div>
                            {pctTotal.toFixed(0)}%
                          </div>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2563eb', fontWeight: 600 }}>{d.convos}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: convoRate >= 45 ? '#16a34a' : convoRate >= 35 ? '#d97706' : '#ef4444' }}>{convoRate.toFixed(0)}%</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: d.meetings > 0 ? '#16a34a' : '#d1d5db' }}>{d.meetings}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{d.wrong}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: wrongRate >= 60 ? '#ef4444' : wrongRate >= 50 ? '#d97706' : '#374151', fontWeight: wrongRate >= 50 ? 600 : 400 }}>{wrongRate.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== ROW 6: MEETINGS LIST ===== */}
          {meetingCalls.length > 0 && (
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ background: '#16a34a', color: 'white', padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>Meetings Booked ({meetingCalls.length})</div>
              {meetingCalls.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', padding: '10px 16px', borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f8f9fa' : 'white', fontSize: 12, alignItems: 'center', gap: 16 }}>
                  <span style={{ color: '#9ca3af', width: 60, flexShrink: 0 }}>{new Date(c.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span style={{ fontWeight: 600, color: '#1f2937', width: 160, flexShrink: 0 }}>{c.contactName || 'Unknown'}</span>
                  <span style={{ color: '#6b7280', width: 180, flexShrink: 0 }}>{c.title || ''}</span>
                  <span style={{ color: '#6b7280', flex: 1 }}>{c.vertical || ''}</span>
                  <span style={{ color: '#4f46e5', width: 100, flexShrink: 0 }}>{c.rep.split(' ')[0]}</span>
                  {c.recordingUrl && <a href={c.recordingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, fontSize: 11 }}>▶ Listen</a>}
                </div>
              ))}
            </div>
          )}

          {/* ===== NOTES & CHANGES ===== */}
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>Notes & Changes</div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', fontSize: 12 }} />
              <input value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNote()} placeholder="What changed? e.g. 'Brandon reduced to 2 parallel dials + daily number rotation'" style={{ flex: 1, minWidth: 250, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12 }} />
              <button onClick={saveNote} style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
            </div>
            {notes.length === 0 && <div style={{ padding: '20px 16px', color: '#9ca3af', fontSize: 12 }}>No changes logged yet. Add notes about strategy changes to track their impact.</div>}
            {notes.map(note => {
              const { before, after } = getBeforeAfter(note.date);
              const analysis = noteAnalysis[note.id];
              return (
                <div key={note.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 8 }}>{new Date(note.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{note.text}</span>
                    </div>
                    <button onClick={() => deleteNote(note.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                  {/* Before / After metrics */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 6, padding: '8px 10px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>BEFORE (7 days)</div>
                      <div>{before.total} connects · {before.convos} convos · {before.mtgs} mtgs</div>
                      <div style={{ color: '#6b7280' }}>Conv rate: {before.convoRate}% · Wrong#: {before.wrongRate}% · Conv→Mtg: {before.mtgRate}%</div>
                    </div>
                    <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 6, padding: '8px 10px', fontSize: 11, border: '1px solid #bbf7d0' }}>
                      <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>AFTER ({after.days} days)</div>
                      <div>{after.total} connects · {after.convos} convos · {after.mtgs} mtgs</div>
                      <div style={{ color: '#6b7280' }}>Conv rate: {after.convoRate}% · Wrong#: {after.wrongRate}% · Conv→Mtg: {after.mtgRate}%</div>
                    </div>
                  </div>
                  {/* AI Analysis */}
                  <div style={{ marginTop: 8 }}>
                    {!analysis && apiKey && <button onClick={() => analyzeNote(note)} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#374151' }}>Ask AI to analyze this change</button>}
                    {!analysis && !apiKey && <span style={{ fontSize: 10, color: '#d1d5db' }}>Set API key to enable AI analysis</span>}
                    {analysis?.loading && <span style={{ fontSize: 11, color: '#6b7280' }}>Analyzing...</span>}
                    {analysis?.text && !analysis.loading && (
                      <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#374151', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: '#92400e' }}>AI Analysis: </span>{analysis.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
