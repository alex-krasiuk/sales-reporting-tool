import { useState, useMemo } from 'react';
import { CALL_DATA } from './callData.js';

// --- Group calls by date and compute daily metrics ---
function computeDailyMetrics(data) {
  const byDate = {};
  data.forEach(d => {
    if (!d.date) return;
    if (!byDate[d.date]) byDate[d.date] = { dials: 0, connects: 0, meetings: 0, wrongNumber: 0, interest: 0, notInterested: 0 };
    byDate[d.date].dials++;
    byDate[d.date].connects++;
    if (d.outcome === 'Meeting Booked') byDate[d.date].meetings++;
    if (d.outcome === 'Wrong number') byDate[d.date].wrongNumber++;
    if (d.outcome === 'Follow up - interested' || d.outcome === 'Account to Pursue') byDate[d.date].interest++;
    if (d.outcome === 'Not Interested') byDate[d.date].notInterested++;
  });

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      meetingRate: d.connects ? (d.meetings / d.connects * 100) : 0,
      wrongNumberRate: d.connects ? (d.wrongNumber / d.connects * 100) : 0,
      interestRate: d.connects ? (d.interest / d.connects * 100) : 0,
      notInterestedRate: d.connects ? (d.notInterested / d.connects * 100) : 0,
      meetings: d.meetings,
      wrongNumbers: d.wrongNumber,
      interest: d.interest,
      connects: d.connects,
    }));
}

// --- SVG Line Chart ---
function LineChart({ data, dataKey, color, title, currentValue, unit, height = 180 }) {
  if (data.length === 0) return null;
  const W = 600, H = height, PAD = { top: 10, right: 20, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values = data.map(d => d[dataKey]);
  const maxVal = Math.max(...values, 1);
  const yMax = Math.ceil(maxVal / 10) * 10 || 10; // Round up to nearest 10

  const points = data.map((d, i) => ({
    x: PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    y: PAD.top + plotH - (d[dataKey] / yMax) * plotH,
    val: d[dataKey],
    label: d.label,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  // Area fill
  const areaD = pathD + ` L ${points[points.length - 1].x} ${PAD.top + plotH} L ${points[0].x} ${PAD.top + plotH} Z`;

  // Y axis ticks
  const yTicks = [0, yMax / 2, yMax];

  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1, minWidth: 280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{title}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{currentValue}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines */}
        {yTicks.map(tick => {
          const y = PAD.top + plotH - (tick / yMax) * plotH;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#9ca3af">{Math.round(tick)}{unit}</text>
            </g>
          );
        })}
        {/* Area fill */}
        <path d={areaD} fill={color} opacity={0.08} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="white" stroke={color} strokeWidth={2} />
            {/* Show value on hover area */}
            <title>{p.label}: {p.val.toFixed(1)}{unit}</title>
          </g>
        ))}
        {/* X axis labels */}
        {data.map((d, i) => {
          const x = PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
          // Show every label if < 10 points, otherwise every other
          if (data.length > 10 && i % 2 !== 0 && i !== data.length - 1) return null;
          return (
            <text key={i} x={x} y={H - 5} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.label}</text>
          );
        })}
      </svg>
    </div>
  );
}

// --- Main Component ---
export default function AnalyticsCharts() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); })();
  const [dateFrom, setDateFrom] = useState(twoWeeksAgo);
  const [dateTo, setDateTo] = useState(todayStr);

  const filteredData = useMemo(() => {
    return CALL_DATA.filter(d => d.date && d.date >= dateFrom && d.date <= dateTo);
  }, [dateFrom, dateTo]);

  const daily = useMemo(() => computeDailyMetrics(filteredData), [filteredData]);

  // Current averages for the period
  const avgMeetingRate = daily.length ? (daily.reduce((a, d) => a + d.meetingRate, 0) / daily.length) : 0;
  const avgWrongRate = daily.length ? (daily.reduce((a, d) => a + d.wrongNumberRate, 0) / daily.length) : 0;
  const avgInterestRate = daily.length ? (daily.reduce((a, d) => a + d.interestRate, 0) / daily.length) : 0;
  const avgNotIntRate = daily.length ? (daily.reduce((a, d) => a + d.notInterestedRate, 0) / daily.length) : 0;

  // Quick presets
  const mondayStr = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Period:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
        <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
        {[['Last 7d', (() => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })(), todayStr],
          ['Last 14d', twoWeeksAgo, todayStr],
          ['This Week', mondayStr, todayStr],
          ['Yesterday', yesterdayStr, yesterdayStr],
          ['All Time', '2026-02-01', todayStr],
        ].map(([label, from, to]) => (
          <button key={label} onClick={() => { setDateFrom(from); setDateTo(to); }} style={{
            background: dateFrom === from && dateTo === to ? '#eef2ff' : '#f3f4f6',
            border: `1px solid ${dateFrom === from && dateTo === to ? '#c7d2fe' : '#e5e7eb'}`,
            borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#374151',
            fontWeight: dateFrom === from && dateTo === to ? 700 : 400,
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{daily.length} days · {filteredData.length} connects</span>
      </div>

      {/* Charts */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 1200 }}>
          <LineChart
            data={daily} dataKey="meetingRate" color="#16a34a"
            title="Meeting Booked Rate" currentValue={avgMeetingRate.toFixed(1)} unit="%"
          />
          <LineChart
            data={daily} dataKey="wrongNumberRate" color="#ef4444"
            title="Wrong Number Rate" currentValue={avgWrongRate.toFixed(1)} unit="%"
          />
          <LineChart
            data={daily} dataKey="interestRate" color="#2563eb"
            title="Interest Rate (Follow Up + Account to Pursue)" currentValue={avgInterestRate.toFixed(1)} unit="%"
          />
          <LineChart
            data={daily} dataKey="notInterestedRate" color="#d97706"
            title="Not Interested Rate" currentValue={avgNotIntRate.toFixed(1)} unit="%"
          />
        </div>

        {/* Daily breakdown table */}
        <div style={{ marginTop: 24, background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', maxWidth: 1200 }}>
          <div style={{ background: '#1f2937', color: 'white', padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>Daily Breakdown</div>
          <div style={{ display: 'flex', background: '#eff6ff', fontWeight: 700, fontSize: 11, color: '#1f2937', borderBottom: '1px solid #dbeafe' }}>
            {['Date', 'Connects', 'Meetings', 'Mtg Rate', 'Wrong #', 'W# Rate', 'Interest', 'Int Rate', 'Not Int', 'NI Rate'].map((h, i) => (
              <div key={h} style={{ width: i === 0 ? 100 : 90, padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
            ))}
          </div>
          {daily.map((d, i) => (
            <div key={d.date} style={{ display: 'flex', fontSize: 12, borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f8f9fa' : 'white' }}>
              {[
                { v: d.label, w: 100, align: 'left' },
                { v: d.connects, w: 90 },
                { v: d.meetings, w: 90 },
                { v: `${d.meetingRate.toFixed(0)}%`, w: 90, color: d.meetingRate > 0 ? '#16a34a' : '#9ca3af' },
                { v: d.wrongNumbers, w: 90 },
                { v: `${d.wrongNumberRate.toFixed(0)}%`, w: 90, color: d.wrongNumberRate > 40 ? '#ef4444' : d.wrongNumberRate > 20 ? '#d97706' : '#374151' },
                { v: d.interest, w: 90 },
                { v: `${d.interestRate.toFixed(0)}%`, w: 90, color: d.interestRate > 0 ? '#2563eb' : '#9ca3af' },
                { v: filteredData.filter(r => r.date === d.date && r.outcome === 'Not Interested').length, w: 90 },
                { v: `${d.notInterestedRate.toFixed(0)}%`, w: 90, color: '#d97706' },
              ].map((cell, j) => (
                <div key={j} style={{ width: cell.w, padding: '6px 10px', textAlign: cell.align || 'right', color: cell.color || '#374151', fontWeight: cell.color ? 600 : 400 }}>{cell.v}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
