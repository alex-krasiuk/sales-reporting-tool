import { useState, useMemo } from 'react';
import { ALL_CALLS, SYNC_META } from './allCallData.js';

// --- Vertical consolidation ---
const VERTICAL_MAP = {
  'Transportation & Carriers': 'Logistics & Freight', 'Carrier': 'Logistics & Freight',
  'Parcel & Last Mile': 'Logistics & Freight', 'Freight Brokerage & Forwarding': 'Logistics & Freight',
  'Freight Forwarder': 'Logistics & Freight', 'Freight Brokerage': 'Logistics & Freight',
  'Warehousing & 3PL': 'Logistics & Freight', 'Warehouse & Distribution': 'Logistics & Freight',
  'Private Fleet / Enterprise Shipper': 'Logistics & Freight', 'Logistics': 'Logistics & Freight',
  'Fleet Management': 'Logistics & Freight',
  'Field Service Management': 'Field Service Trades', 'Field Services & Trades': 'Field Service Trades',
  'Manufacturing & Industrial': 'Industrial Production', 'Manufacturing': 'Industrial Production',
  'Chemical Manufacturing': 'Industrial Production',
  'Wholesale': 'Consumer Operations', 'Wholesale Distribution': 'Consumer Operations',
  'Wholesale Motor Vehicles': 'Consumer Operations', 'CPG & Retail': 'Consumer Operations',
  'Retail': 'Consumer Operations', 'Food & Beverage': 'Consumer Operations',
  'Construction & Engineering': 'Infrastructure', 'Construction & Contracting': 'Infrastructure',
  'Construction': 'Infrastructure', 'Utilities': 'Infrastructure',
  'Electric Power Generation': 'Infrastructure', 'Oil, Gas & Energy': 'Infrastructure',
  'Mining & Natural Resources': 'Infrastructure', 'Mining': 'Infrastructure',
  'Engineering Services': 'Infrastructure', 'Engineering': 'Infrastructure',
  'Telecommunications': 'Infrastructure', 'Energy Data & Analytics': 'Infrastructure',
  'Urban Transit': 'Out of Scope', 'Business & Workforce Services': 'Out of Scope',
  'Staffing': 'Out of Scope', 'Staffing and Recruiting': 'Out of Scope',
  'Software': 'Out of Scope', 'Technology': 'Out of Scope',
  'Financial Services': 'Out of Scope', 'Private Equity': 'Out of Scope',
  'Real Estate': 'Out of Scope', 'Healthcare': 'Out of Scope', 'Health Care': 'Out of Scope',
  'Healthcare IT Services': 'Out of Scope', 'Healthcare Analytics': 'Out of Scope',
  'Health Care Services': 'Out of Scope', 'Healthcare Services': 'Out of Scope',
  'Revenue Cycle Management': 'Out of Scope', 'Airlines': 'Out of Scope',
  'Data Infrastructure and Analytics': 'Out of Scope',
  'Facility Services': 'Asset & Facility Services', 'Rental & Leasing': 'Asset & Facility Services',
  'Equipment Rental': 'Asset & Facility Services', 'Equipment Rental / Services': 'Asset & Facility Services',
  'Facilities & Property Services': 'Asset & Facility Services',
  'Waste Management': 'Asset & Facility Services', 'Waste & Environmental': 'Asset & Facility Services',
};

function consolidateVertical(v) {
  if (!v) return 'Unknown';
  return VERTICAL_MAP[v] || v;
}

// --- Date helpers ---
function getMonday(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pct(n, d) { return d ? `${(n / d * 100).toFixed(1)}%` : '0%'; }
function pctNum(n, d) { return d ? (n / d * 100) : 0; }

// --- Styles ---
const S = {
  navy: '#1F2937',
  headerBg: '#1F2937',
  headerText: '#FFFFFF',
  colHeaderBg: '#EFF6FF',
  colHeaderText: '#1F2937',
  rowAlt: '#F8F9FA',
  green: '#E6F9F1',
  amber: '#FFF3D6',
  red: '#FDE8E8',
  lightBlue: '#DBEAFE',
};

function rateColor(rate) {
  if (rate >= 10) return S.green;
  if (rate >= 5) return S.amber;
  if (rate > 0) return S.red;
  return 'transparent';
}

// --- Subcomponents ---
function SectionHeader({ children }) {
  return <div style={{ background: S.headerBg, color: S.headerText, fontWeight: 700, fontSize: 13, padding: '10px 16px', marginTop: 16, borderRadius: '6px 6px 0 0' }}>{children}</div>;
}

function ColHeader({ cols, widths }) {
  return (
    <div style={{ display: 'flex', background: S.colHeaderBg, fontWeight: 700, fontSize: 11, color: S.colHeaderText, borderBottom: '1px solid #dbeafe' }}>
      {cols.map((c, i) => <div key={i} style={{ width: widths[i], padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right' }}>{c}</div>)}
    </div>
  );
}

function DataRow({ cells, widths, alt, highlight }) {
  return (
    <div style={{ display: 'flex', background: highlight || (alt ? S.rowAlt : 'white'), fontSize: 12, borderBottom: '1px solid #f3f4f6' }}>
      {cells.map((c, i) => <div key={i} style={{ width: widths[i], padding: '7px 12px', textAlign: i === 0 ? 'left' : 'right', ...(c.style || {}) }}>{c.value ?? c}</div>)}
    </div>
  );
}

function KPICard({ label, value, sub, bg }) {
  return (
    <div style={{ flex: 1, minWidth: 180, background: bg || '#F0F9FF', borderRadius: 8, padding: '14px 18px', border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: S.navy, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// --- Build report from local data (instant, no API) ---
function buildReport(dateFrom, dateTo) {
  // Filter calls in date range
  const thisPeriod = ALL_CALLS.filter(c => c.date >= dateFrom && c.date <= dateTo);

  // Previous period of same length for comparison
  const fromD = new Date(dateFrom + 'T12:00:00');
  const toD = new Date(dateTo + 'T12:00:00');
  const periodDays = Math.round((toD - fromD) / 86400000) + 1;
  const prevTo = new Date(fromD);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - periodDays + 1);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  const prevToStr = prevTo.toISOString().slice(0, 10);
  const prevPeriod = ALL_CALLS.filter(c => c.date >= prevFromStr && c.date <= prevToStr);

  // Enrich each call
  const enriched = thisPeriod.map(c => {
    const dayOfWeek = DAYS[new Date(c.date + 'T12:00:00').getUTCDay()];
    const vertical = consolidateVertical(c.vertical || c.industry);
    const disposition = c.isConnect ? (c.isMeeting ? 'Meeting Booked' : 'Connected') : c.outcome;
    return { ...c, dayOfWeek, vertical, disposition };
  });

  // Previous period stats
  const lastWeekDials = prevPeriod.length;
  const lastWeekConnections = prevPeriod.filter(c => c.isConnect).length;
  const lastWeekMeetings = prevPeriod.filter(c => c.isMeeting).length;

  // Aggregate
  const totalDials = enriched.length;
  const connections = enriched.filter(c => c.isConnect).length;
  const conversations = enriched.filter(c => c.isConversation).length;
  const meetings = enriched.filter(c => c.isMeeting).length;
  const uniqueDates = new Set(enriched.map(c => c.date));
  const uniqueCompanies = new Set(enriched.map(c => c.company).filter(Boolean));
  const dialsPerDay = uniqueDates.size ? Math.round(totalDials / uniqueDates.size) : 0;

  // Disposition counts (use original outcome for granularity)
  const dispositionCounts = {};
  enriched.forEach(c => {
    const label = c.outcome || 'Other';
    dispositionCounts[label] = (dispositionCounts[label] || 0) + 1;
  });

  // By day of week
  const byDay = {};
  enriched.forEach(c => {
    if (!byDay[c.dayOfWeek]) byDay[c.dayOfWeek] = { dials: 0, connections: 0, conversations: 0, meetings: 0 };
    byDay[c.dayOfWeek].dials++;
    if (c.isConnect) byDay[c.dayOfWeek].connections++;
    if (c.isConversation) byDay[c.dayOfWeek].conversations++;
    if (c.isMeeting) byDay[c.dayOfWeek].meetings++;
  });

  // By rep
  const byRep = {};
  enriched.forEach(c => {
    if (!byRep[c.rep]) byRep[c.rep] = { dials: 0, connections: 0, conversations: 0, meetings: 0, dates: new Set() };
    byRep[c.rep].dials++;
    byRep[c.rep].dates.add(c.date);
    if (c.isConnect) byRep[c.rep].connections++;
    if (c.isConversation) byRep[c.rep].conversations++;
    if (c.isMeeting) byRep[c.rep].meetings++;
  });

  // By vertical
  const byVertical = {};
  enriched.forEach(c => {
    if (!byVertical[c.vertical]) byVertical[c.vertical] = { dials: 0, connections: 0, conversations: 0, meetings: 0 };
    byVertical[c.vertical].dials++;
    if (c.isConnect) byVertical[c.vertical].connections++;
    if (c.isConversation) byVertical[c.vertical].conversations++;
    if (c.isMeeting) byVertical[c.vertical].meetings++;
  });

  // Meetings list
  const meetingsList = enriched.filter(c => c.isMeeting)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(c => ({ date: fmtDate(c.date), contact: c.contactName, title: c.title, company: c.company, vertical: c.vertical, rep: c.rep, recordingUrl: c.recordingUrl, hsUrl: c.hsUrl }));

  // Deltas
  const dialsDelta = totalDials - lastWeekDials;
  const connDelta = connections - lastWeekConnections;
  const meetDelta = meetings - lastWeekMeetings;
  const lastConnRate = lastWeekDials ? (lastWeekConnections / lastWeekDials * 100) : 0;
  const thisConnRate = totalDials ? (connections / totalDials * 100) : 0;
  const connRateDelta = thisConnRate - lastConnRate;

  return {
    periodLabel: dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`,
    totalDials, connections, conversations, meetings, dialsPerDay, uniqueCompanies: uniqueCompanies.size,
    dispositionCounts, byDay,
    byRep: Object.fromEntries(Object.entries(byRep).map(([k, v]) => [k, { ...v, dates: [...v.dates] }])),
    byVertical, meetingsList,
    dialsDelta, connDelta, meetDelta, connRateDelta,
    connectRate: thisConnRate,
  };
}

// --- Main component ---
export default function PerformanceReport() {
  const [dateFrom, setDateFrom] = useState(() => {
    const m = getMonday(new Date()); return m.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const todayStr = new Date().toISOString().slice(0, 10);
  const mondayStr = (() => { const m = getMonday(new Date()); return m.toISOString().slice(0, 10); })();

  // Instant — computed from local data, no loading
  const r = useMemo(() => buildReport(dateFrom, dateTo), [dateFrom, dateTo]);

  const syncAge = SYNC_META?.syncedAt
    ? `Last synced: ${new Date(SYNC_META.syncedAt).toLocaleString()}`
    : '';

  const delta = (n) => n > 0 ? `+${n} vs prev` : n < 0 ? `${n} vs prev` : '— same';
  const deltaPp = (n) => n > 0 ? `+${n.toFixed(1)}pp vs prev` : n < 0 ? `${n.toFixed(1)}pp vs prev` : '— same';

  const vertCols = ['Vertical', 'Dials', 'Connects', 'Convos (>1m)', 'Connect Rate', 'Meetings'];
  const vertWidths = [200, 80, 80, 90, 100, 80];
  const repCols = ['Rep', 'Dials', 'Dials/Day', 'Connects', 'Convos (>1m)', 'Connect Rate', 'Meetings'];
  const repWidths = [160, 70, 70, 80, 90, 100, 80];
  const mtgCols = ['Date', 'Contact', 'Title', 'Company', 'Vertical', 'Rep'];
  const mtgWidths = [80, 160, 160, 160, 140, 120];
  const outcomeCols = ['Outcome', 'Count', '% of Dials'];
  const outcomeWidths = [200, 90, 120];
  const dayCols = ['Day', 'Dials', 'Connects', 'Convos (>1m)', 'Connect Rate', 'Meetings'];
  const dayWidths = [130, 70, 80, 90, 100, 80];

  const sortedVerts = Object.entries(r.byVertical).filter(([, v]) => v.dials > 0)
    .sort((a, b) => b[1].meetings - a[1].meetings || b[1].dials - a[1].dials);

  const sortedReps = Object.entries(r.byRep).sort((a, b) => b[1].dials - a[1].dials);

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sortedDays = dayOrder.filter(d => r.byDay[d]);

  const outcomeOrder = ['Connected', 'Meeting Booked', 'Follow up - interested', 'Not Interested', 'Busy', 'Wrong number', 'No answer', 'Voicemail', 'Wrong Contact', 'Wrong contact - referral', 'Account to Pursue', 'No longer at company', 'Left live message', 'Other'];
  const sortedOutcomes = outcomeOrder.filter(o => r.dispositionCounts[o]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', background: 'white', borderBottom: '1px solid #e5e7eb', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Period:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
        <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
        {[
          ['Today', todayStr, todayStr],
          ['This Week', mondayStr, todayStr],
          ['Yesterday', (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })(), (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })()],
          ['Last 7 Days', (() => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })(), todayStr],
          ['Last 30 Days', (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); })(), todayStr],
          ['All Time', SYNC_META?.dateRange?.from || '2026-02-01', todayStr],
        ].map(([label, from, to]) => (
          <button key={label} onClick={() => { setDateFrom(from); setDateTo(to); }} style={{ background: dateFrom === from && dateTo === to ? '#eef2ff' : '#f3f4f6', border: `1px solid ${dateFrom === from && dateTo === to ? '#c7d2fe' : '#e5e7eb'}`, borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#374151', fontWeight: dateFrom === from && dateTo === to ? 700 : 400 }}>{label}</button>
        ))}
        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>{syncAge}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 40px' }}>
      {/* Title */}
      <div style={{ background: S.headerBg, color: S.headerText, padding: '16px 20px', borderRadius: 8, marginTop: 16, fontSize: 15, fontWeight: 700 }}>
        Runbook — Nooks Call Performance | {r.periodLabel}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <KPICard label="Dials" value={r.totalDials} sub={`${r.dialsPerDay}/day  ${delta(r.dialsDelta)}`} bg="#DBEAFE" />
        <KPICard label="Connects" value={r.connections} sub={`${pct(r.connections, r.totalDials)} connect rate  ${delta(r.connDelta)}`} bg={r.connectRate >= 5 ? '#E6F9F1' : '#FFF3D6'} />
        <KPICard label="Conversations (>1m)" value={r.conversations} sub={`${pct(r.conversations, r.connections)} of connects`} bg="#DBEAFE" />
        <KPICard label="Meetings Booked" value={r.meetings} sub={`${pct(r.meetings, r.totalDials)} of dials  ${delta(r.meetDelta)}`} bg={r.meetings > 0 ? '#E6F9F1' : '#F3F4F6'} />
      </div>

      {/* Call Outcomes */}
      <SectionHeader>CALL OUTCOMES</SectionHeader>
      <ColHeader cols={outcomeCols} widths={outcomeWidths} />
      {sortedOutcomes.map((o, i) => (
        <DataRow key={o} alt={i % 2 === 1} widths={outcomeWidths} cells={[
          o, r.dispositionCounts[o], pct(r.dispositionCounts[o], r.totalDials),
        ]} />
      ))}

      {/* Best Day */}
      <SectionHeader>BY DAY OF WEEK</SectionHeader>
      <ColHeader cols={dayCols} widths={dayWidths} />
      {sortedDays.map((day, i) => {
        const d = r.byDay[day];
        const cr = pctNum(d.connections, d.dials);
        return <DataRow key={day} alt={i % 2 === 1} widths={dayWidths} cells={[
          day, d.dials, d.connections, d.conversations,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          d.meetings,
        ]} />;
      })}

      {/* By Rep */}
      <SectionHeader>BY REP</SectionHeader>
      <ColHeader cols={repCols} widths={repWidths} />
      {sortedReps.map(([rep, d], i) => {
        const cr = pctNum(d.connections, d.dials);
        const dialsDay = d.dates?.length ? Math.round(d.dials / d.dates.length) : 0;
        return <DataRow key={rep} alt={i % 2 === 1} widths={repWidths} cells={[
          { value: rep, style: { fontWeight: 700 } },
          d.dials, dialsDay, d.connections, d.conversations,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          d.meetings,
        ]} />;
      })}

      {/* Meetings Booked */}
      <SectionHeader>MEETINGS BOOKED</SectionHeader>
      {r.meetingsList.length > 0 ? (
        <>
          <ColHeader cols={mtgCols} widths={mtgWidths} />
          {r.meetingsList.map((m, i) => (
            <DataRow key={i} alt={i % 2 === 1} widths={mtgWidths} cells={[
              { value: m.date, style: { color: '#9ca3af' } },
              m.contact, m.title, m.company, m.vertical, m.rep,
            ]} />
          ))}
        </>
      ) : (
        <div style={{ padding: '20px 16px', color: '#9ca3af', fontSize: 13, background: 'white' }}>No meetings booked this period.</div>
      )}

      {/* By Vertical */}
      <SectionHeader>BY VERTICAL</SectionHeader>
      <div style={{ display: 'flex', background: S.headerBg, color: S.headerText, fontWeight: 700, fontSize: 12 }}>
        {[['ALL', vertWidths[0]], [r.totalDials, vertWidths[1]], [r.connections, vertWidths[2]], [r.conversations, vertWidths[3]], [pct(r.connections, r.totalDials), vertWidths[4]], [r.meetings, vertWidths[5]]].map(([v, w], i) => (
          <div key={i} style={{ width: w, padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right' }}>{v}</div>
        ))}
      </div>
      <ColHeader cols={vertCols} widths={vertWidths} />
      {sortedVerts.map(([vert, d], i) => {
        const cr = pctNum(d.connections, d.dials);
        return <DataRow key={vert} alt={i % 2 === 1} widths={vertWidths} cells={[
          vert, d.dials, d.connections, d.conversations,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          { value: d.meetings, style: d.meetings > 0 ? { background: S.green, fontWeight: 700 } : {} },
        ]} />;
      })}

      <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
