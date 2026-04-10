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

// --- Icebreaker categorization ---
function categorizeIceBreaker(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/follow.up|spoke.*last|talked.*before|called.*earlier|callback|we chatted/.test(t)) return 'Follow-up ("we spoke last week, wanted to continue")';
  if (/i see your|i noticed|i understand.*you|your.*role|leading.*team|working on/.test(t)) return 'Personalized ("I see you\'re leading IT at X, thought relevant")';
  if (/borrow.*(30|thirty)|out of the blue|cold call|bit out of/.test(t)) return '"Borrow 30 seconds" ("calling out of the blue, can I borrow 30s?")';
  if (/do you mind|can i|is it okay|okay if/.test(t)) return 'Permission ask ("do you mind if I explain why I called?")';
  return 'Name + company only ("Hey, this is Brandon with RunBook, how are you?")';
}

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

  const filtered = useMemo(() => CALL_DATA.filter(d => d.date && d.date >= dateFrom && d.date <= dateTo), [dateFrom, dateTo]);

  // --- Core metrics ---
  const total = filtered.length;
  const wrongNumber = filtered.filter(d => d.outcome === 'Wrong number').length;
  const wrongContact = filtered.filter(d => d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number').length;
  const realConvos = filtered.filter(d => !d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number').length;
  const meetings = filtered.filter(d => d.outcome === 'Meeting Booked').length;
  const followUp = filtered.filter(d => d.outcome === 'Follow up - interested').length;
  const notInterested = filtered.filter(d => d.outcome === 'Not Interested').length;
  const accountPursue = filtered.filter(d => d.outcome === 'Account to Pursue').length;
  const positive = meetings + followUp + accountPursue;

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
      if (!byDate[d.date]) byDate[d.date] = { connects: 0, meetings: 0, wrongNumber: 0, interest: 0, notInterested: 0, realConvos: 0 };
      byDate[d.date].connects++;
      if (d.outcome === 'Meeting Booked') byDate[d.date].meetings++;
      if (d.outcome === 'Wrong number') byDate[d.date].wrongNumber++;
      if (d.outcome === 'Follow up - interested' || d.outcome === 'Account to Pursue') byDate[d.date].interest++;
      if (d.outcome === 'Not Interested') byDate[d.date].notInterested++;
      if (!d.outcome.startsWith('Wrong') && d.outcome !== 'Wrong number') byDate[d.date].realConvos++;
    });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
      date, label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      meetingRate: d.connects ? (d.meetings / d.connects * 100) : 0,
      wrongNumberRate: d.connects ? (d.wrongNumber / d.connects * 100) : 0,
      interestRate: d.connects ? (d.interest / d.connects * 100) : 0,
      realConvoRate: d.connects ? (d.realConvos / d.connects * 100) : 0,
      ...d,
    }));
  }, [filtered]);

  // --- Hook & Icebreaker analytics ---
  const meetingCalls = filtered.filter(d => d.outcome === 'Meeting Booked').sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const hookStats = useMemo(() => {
    const cats = {};
    filtered.forEach(d => {
      const cat = categorizeHook(d.hook?.text);
      if (!cat) return;
      if (!cats[cat]) cats[cat] = { total: 0, meetings: 0, followUp: 0, positive: 0 };
      cats[cat].total++;
      if (d.outcome === 'Meeting Booked') { cats[cat].meetings++; cats[cat].positive++; }
      if (d.outcome === 'Follow up - interested' || d.outcome === 'Account to Pursue') { cats[cat].followUp++; cats[cat].positive++; }
    });
    return Object.entries(cats).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  const ibStats = useMemo(() => {
    const cats = {};
    filtered.forEach(d => {
      const cat = categorizeIceBreaker(d.iceBreaker?.text);
      if (!cat) return;
      if (!cats[cat]) cats[cat] = { total: 0, passed: 0 };
      cats[cat].total++;
      if (d.iceBreaker?.success) cats[cat].passed++;
    });
    return Object.entries(cats).sort((a, b) => b[1].total - a[1].total);
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
            <MetricCard label="Follow Up + Pursue" value={positive - meetings} sub={`${total ? Math.round((positive - meetings) / total * 100) : 0}% of connects`} color="#2563eb" big />
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
            {/* Hook performance */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1, minWidth: 320 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>Hook Performance</div>
              {hookStats.length > 0 ? hookStats.map(([cat, d]) => {
                const positiveRate = d.total ? Math.round(d.positive / d.total * 100) : 0;
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{cat}</span>
                      <span style={{ fontWeight: 700, color: positiveRate >= 20 ? '#16a34a' : positiveRate >= 10 ? '#d97706' : '#6b7280' }}>
                        {d.total} calls · {positiveRate}% positive
                        <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>({d.meetings}mtg {d.followUp}fu)</span>
                      </span>
                    </div>
                    <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                      <div style={{ width: `${positiveRate}%`, height: '100%', background: positiveRate >= 20 ? '#16a34a' : positiveRate >= 10 ? '#d97706' : '#9ca3af', borderRadius: 4, opacity: 0.7, minWidth: d.positive > 0 ? 2 : 0 }} />
                    </div>
                  </div>
                );
              }) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No hook data for this period</div>}
            </div>

            {/* Icebreaker performance */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1, minWidth: 320 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>Icebreaker Performance</div>
              {ibStats.length > 0 ? ibStats.map(([cat, d]) => {
                const passRate = d.total ? Math.round(d.passed / d.total * 100) : 0;
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{cat}</span>
                      <span style={{ fontWeight: 700, color: passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#ef4444' }}>
                        {d.total} calls · {passRate}% passed
                      </span>
                    </div>
                    <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                      <div style={{ width: `${passRate}%`, height: '100%', background: passRate >= 75 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#ef4444', borderRadius: 4, opacity: 0.7 }} />
                    </div>
                  </div>
                );
              }) : <div style={{ color: '#9ca3af', fontSize: 12 }}>No icebreaker data for this period</div>}
            </div>
          </div>

          {/* ===== ROW 5: DAILY TREND CHARTS ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { key: 'realConvoRate', color: '#059669', title: 'Real Conversation Rate', avg: daily.length ? (daily.reduce((a, d) => a + d.realConvoRate, 0) / daily.length) : 0 },
              { key: 'wrongNumberRate', color: '#ef4444', title: 'Wrong Number Rate', avg: daily.length ? (daily.reduce((a, d) => a + d.wrongNumberRate, 0) / daily.length) : 0 },
              { key: 'meetingRate', color: '#16a34a', title: 'Meeting Rate', avg: daily.length ? (daily.reduce((a, d) => a + d.meetingRate, 0) / daily.length) : 0 },
              { key: 'interestRate', color: '#2563eb', title: 'Interest Rate (Follow Up + Pursue)', avg: daily.length ? (daily.reduce((a, d) => a + d.interestRate, 0) / daily.length) : 0 },
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

        </div>
      </div>
    </div>
  );
}
