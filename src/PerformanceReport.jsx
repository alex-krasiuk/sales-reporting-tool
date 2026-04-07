import { useState, useEffect, useMemo, useCallback } from 'react';

// --- Disposition classification ---
const CONNECTED_GUIDS = new Set([
  'f240bbac-87c9-4f6e-bf70-924b57d47db7',
  'a12225bd-f90c-43bb-aa10-4b7875a05937',
  '91fd5005-2ed7-45dd-b8ec-f22511b5ece2',
  'f76aed06-41e0-4b55-8f96-361bfd09bf0c',
  '9d9162e7-6cf3-4944-bf63-4dff82258764',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff',
]);
const MEETING_GUID = '81180310-0202-4b44-8417-168bd57e399a';
const VOICEMAIL_GUID = 'b2cf5968-551e-4856-9783-52b3da59a7d0';
const NO_ANSWER_GUIDS = new Set([
  '73a0d17f-1163-4015-bdd5-ec830791da20',
  '17b47fee-58de-441e-a44c-c6300d46f273',
]);

function classifyDisposition(guid) {
  if (guid === MEETING_GUID) return 'Meeting Booked';
  if (CONNECTED_GUIDS.has(guid)) return 'Connected';
  if (guid === VOICEMAIL_GUID) return 'Voicemail';
  if (NO_ANSWER_GUIDS.has(guid)) return 'No Answer';
  return 'Other';
}

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
  const d = new Date(dateStr);
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

// --- API fetch helpers ---
async function fetchAllCalls(token, sinceMs, beforeMs) {
  const allResults = [];
  let after = undefined;
  while (true) {
    const filters = [
      { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
      { propertyName: 'hs_createdate', operator: 'GTE', value: String(sinceMs) },
    ];
    if (beforeMs) {
      filters.push({ propertyName: 'hs_createdate', operator: 'LT', value: String(beforeMs) });
    }
    const body = {
      filterGroups: [{ filters }],
      properties: ['hs_call_disposition', 'hs_createdate', 'hubspot_owner_id'],
      sorts: [{ propertyName: 'hs_createdate', direction: 'DESCENDING' }],
      limit: 200,
    };
    if (after) body.after = after;
    const res = await fetch('/hubspot-api/crm/v3/objects/calls/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HubSpot calls API: ${res.status}`);
    const data = await res.json();
    allResults.push(...(data.results || []));
    if (data.paging?.next?.after) { after = data.paging.next.after; }
    else break;
    if (allResults.length >= 5000) break;
  }
  return allResults;
}

async function fetchOwners(token) {
  const res = await fetch('/hubspot-api/crm/v1/owners', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Owners API: ${res.status}`);
  const data = await res.json();
  const map = {};
  data.forEach(o => { map[String(o.ownerId)] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || `Owner ${o.ownerId}`; });
  return map;
}

async function batchAssociations(token, callIds) {
  const map = {};
  for (let i = 0; i < callIds.length; i += 100) {
    const batch = callIds.slice(i, i + 100);
    const res = await fetch('/hubspot-api/crm/v4/associations/calls/contacts/batch/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
    });
    if (!res.ok) continue;
    const data = await res.json();
    (data.results || []).forEach(r => {
      const callId = String(r.from?.id);
      const tos = r.to || [];
      if (tos.length > 0) map[callId] = String(tos[0].toObjectId);
    });
  }
  return map;
}

async function batchContacts(token, contactIds) {
  const map = {};
  const unique = [...new Set(contactIds)];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const res = await fetch('/hubspot-api/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inputs: batch.map(id => ({ id })), properties: ['buyer_persona', 'seniority_level', 'associatedcompanyid', 'firstname', 'lastname', 'jobtitle'] }),
    });
    if (!res.ok) continue;
    const data = await res.json();
    (data.results || []).forEach(c => { map[String(c.id)] = c.properties; });
  }
  return map;
}

async function batchCompanies(token, companyIds) {
  const map = {};
  const unique = [...new Set(companyIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const res = await fetch('/hubspot-api/crm/v3/objects/companies/batch/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inputs: batch.map(id => ({ id })), properties: ['vertical', 'name'] }),
    });
    if (!res.ok) continue;
    const data = await res.json();
    (data.results || []).forEach(c => { map[String(c.id)] = c.properties; });
  }
  return map;
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

// --- Main component ---
export default function PerformanceReport({ hsToken }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [progress, setProgress] = useState('');

  const loadReport = useCallback(async () => {
    if (!hsToken) { setError('Set HubSpot token to load report'); return; }
    setLoading(true); setError(''); setProgress('Fetching owners...');

    try {
      // Dates
      const now = new Date();
      const thisMonday = getMonday(now);
      const lastMonday = new Date(thisMonday); lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
      const thisMondayMs = thisMonday.getTime();
      const lastMondayMs = lastMonday.getTime();

      // Step 1: Owners
      const owners = await fetchOwners(hsToken);
      setProgress(`Fetching this week's calls...`);

      // Step 2: This week's calls
      const thisWeekCalls = await fetchAllCalls(hsToken, thisMondayMs, null);
      setProgress(`Got ${thisWeekCalls.length} calls. Fetching last week...`);

      // Step 8: Last week's calls
      const lastWeekCalls = await fetchAllCalls(hsToken, lastMondayMs, thisMondayMs);
      setProgress(`Fetching contact associations for ${thisWeekCalls.length} calls...`);

      // Step 4: Contact associations
      const callIds = thisWeekCalls.map(c => String(c.id));
      const callToContact = await batchAssociations(hsToken, callIds);
      setProgress(`Fetching ${Object.keys(callToContact).length} contacts...`);

      const contactIds = Object.values(callToContact);
      const contacts = await batchContacts(hsToken, contactIds);
      setProgress('Fetching companies...');

      const companyIds = Object.values(contacts).map(c => c.associatedcompanyid).filter(Boolean);
      const companies = await batchCompanies(hsToken, companyIds);
      setProgress('Building report...');

      // --- Process this week ---
      const enriched = thisWeekCalls.map(call => {
        const p = call.properties;
        const callId = String(call.id);
        const disposition = classifyDisposition(p.hs_call_disposition || '');
        const rep = owners[p.hubspot_owner_id] || 'Unknown';
        const date = new Date(p.hs_createdate);
        const dateStr = date.toISOString().slice(0, 10);
        const dayOfWeek = DAYS[date.getUTCDay()];

        const contactId = callToContact[callId];
        const contact = contactId ? contacts[contactId] : null;
        const companyId = contact?.associatedcompanyid;
        const company = companyId ? companies[companyId] : null;
        const vertical = consolidateVertical(company?.vertical);
        const companyName = company?.name || '';
        const contactName = contact ? `${contact.firstname || ''} ${contact.lastname || ''}`.trim() : '';
        const jobtitle = contact?.jobtitle || '';
        const persona = contact?.buyer_persona || 'Unclassified';

        return { callId, disposition, rep, dateStr, dayOfWeek, vertical, companyName, companyId, contactName, jobtitle, persona };
      });

      // --- Process last week ---
      const lastWeekDials = lastWeekCalls.length;
      const lastWeekConnections = lastWeekCalls.filter(c => {
        const g = c.properties.hs_call_disposition;
        return CONNECTED_GUIDS.has(g) || g === MEETING_GUID;
      }).length;
      const lastWeekMeetings = lastWeekCalls.filter(c => c.properties.hs_call_disposition === MEETING_GUID).length;

      // --- Aggregate ---
      const totalDials = enriched.length;
      const connections = enriched.filter(c => c.disposition === 'Connected' || c.disposition === 'Meeting Booked').length;
      const meetings = enriched.filter(c => c.disposition === 'Meeting Booked').length;
      const uniqueDates = new Set(enriched.map(c => c.dateStr));
      const uniqueCompanies = new Set(enriched.map(c => c.companyId).filter(Boolean));
      const dialsPerDay = uniqueDates.size ? Math.round(totalDials / uniqueDates.size) : 0;

      // Disposition counts
      const dispositionCounts = {};
      enriched.forEach(c => { dispositionCounts[c.disposition] = (dispositionCounts[c.disposition] || 0) + 1; });

      // By day of week
      const byDay = {};
      enriched.forEach(c => {
        if (!byDay[c.dayOfWeek]) byDay[c.dayOfWeek] = { dials: 0, connections: 0, meetings: 0 };
        byDay[c.dayOfWeek].dials++;
        if (c.disposition === 'Connected' || c.disposition === 'Meeting Booked') byDay[c.dayOfWeek].connections++;
        if (c.disposition === 'Meeting Booked') byDay[c.dayOfWeek].meetings++;
      });

      // By rep
      const byRep = {};
      enriched.forEach(c => {
        if (!byRep[c.rep]) byRep[c.rep] = { dials: 0, connections: 0, meetings: 0, dates: new Set() };
        byRep[c.rep].dials++;
        byRep[c.rep].dates.add(c.dateStr);
        if (c.disposition === 'Connected' || c.disposition === 'Meeting Booked') byRep[c.rep].connections++;
        if (c.disposition === 'Meeting Booked') byRep[c.rep].meetings++;
      });

      // By vertical
      const byVertical = {};
      enriched.forEach(c => {
        if (!byVertical[c.vertical]) byVertical[c.vertical] = { dials: 0, connections: 0, meetings: 0 };
        byVertical[c.vertical].dials++;
        if (c.disposition === 'Connected' || c.disposition === 'Meeting Booked') byVertical[c.vertical].connections++;
        if (c.disposition === 'Meeting Booked') byVertical[c.vertical].meetings++;
      });

      // Meetings list
      const meetingsList = enriched.filter(c => c.disposition === 'Meeting Booked')
        .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
        .map(c => ({ date: fmtDate(c.dateStr), contact: c.contactName, title: c.jobtitle, company: c.companyName, vertical: c.vertical, rep: c.rep }));

      // Deltas vs last week
      const dialsDelta = totalDials - lastWeekDials;
      const connDelta = connections - lastWeekConnections;
      const meetDelta = meetings - lastWeekMeetings;
      const lastConnRate = lastWeekDials ? (lastWeekConnections / lastWeekDials * 100) : 0;
      const thisConnRate = totalDials ? (connections / totalDials * 100) : 0;
      const connRateDelta = thisConnRate - lastConnRate;

      setReport({
        periodLabel: `Week of ${fmtDate(thisMonday.toISOString())} (WTD)`,
        totalDials, connections, meetings, dialsPerDay, uniqueCompanies: uniqueCompanies.size,
        dispositionCounts, byDay, byRep, byVertical, meetingsList,
        dialsDelta, connDelta, meetDelta, connRateDelta,
        connectRate: thisConnRate,
      });
      setProgress('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hsToken]);

  useEffect(() => { if (hsToken) loadReport(); }, [hsToken, loadReport]);

  if (!hsToken) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>Set your HubSpot token in the top bar to load the report.</div>;
  }
  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 14, color: '#6b7280' }}>{progress || 'Loading...'}</div>
      <div style={{ width: 200, height: 4, background: '#e5e7eb', borderRadius: 2 }}><div style={{ height: '100%', background: '#4f46e5', borderRadius: 2, width: '60%', animation: 'pulse 1.5s infinite' }} /></div>
    </div>;
  }
  if (error) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#dc2626', fontSize: 14 }}>{error}</div>
      <button onClick={loadReport} style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Retry</button>
    </div>;
  }
  if (!report) return null;

  const r = report;
  const delta = (n) => n > 0 ? `↑ +${n} vs last wk` : n < 0 ? `↓ ${n} vs last wk` : '— same as last wk';
  const deltaPp = (n) => n > 0 ? `↑ +${n.toFixed(1)}pp vs last wk` : n < 0 ? `↓ ${n.toFixed(1)}pp vs last wk` : '— same as last wk';

  const W = { name: 200, num: 90, pct: 120 };
  const vertCols = ['Vertical', 'Dials', 'Connections', 'Connect Rate', 'Meetings'];
  const vertWidths = [200, 90, 90, 120, 90];
  const repCols = ['Rep', 'Dials', 'Dials/Day', 'Connections', 'Connect Rate', 'Meetings', 'Meeting Rate'];
  const repWidths = [180, 80, 80, 90, 110, 80, 100];
  const mtgCols = ['Date', 'Contact', 'Title', 'Company', 'Vertical', 'Rep'];
  const mtgWidths = [80, 160, 160, 160, 140, 120];
  const outcomeCols = ['Outcome', 'Count', '% of Dials'];
  const outcomeWidths = [200, 90, 120];
  const dayCols = ['Day', 'Dials', 'Connections', 'Connect Rate', 'Meetings'];
  const dayWidths = [140, 90, 90, 120, 90];

  const sortedVerts = Object.entries(r.byVertical).filter(([, v]) => v.dials > 0)
    .sort((a, b) => b[1].meetings - a[1].meetings || b[1].dials - a[1].dials);

  const sortedReps = Object.entries(r.byRep)
    .sort((a, b) => b[1].dials - a[1].dials);

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sortedDays = dayOrder.filter(d => r.byDay[d]);

  const outcomeOrder = ['Connected', 'Meeting Booked', 'Voicemail', 'No Answer', 'Other'];
  const sortedOutcomes = outcomeOrder.filter(o => r.dispositionCounts[o]);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '0 24px 40px' }}>
      {/* Title */}
      <div style={{ background: S.headerBg, color: S.headerText, padding: '16px 20px', borderRadius: 8, marginTop: 16, fontSize: 15, fontWeight: 700 }}>
        Runbook — Nooks Call Performance | {r.periodLabel}
        <button onClick={loadReport} style={{ float: 'right', background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* ========== SECTION 1: OVERVIEW ========== */}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <KPICard label="Total Dials" value={r.totalDials} sub={`${r.dialsPerDay}/day  ${delta(r.dialsDelta)}`} bg="#DBEAFE" />
        <KPICard label="Connect Rate" value={pct(r.connections, r.totalDials)} sub={`${r.connections} connected  ${deltaPp(r.connRateDelta)}`} bg={r.connectRate >= 5 ? '#E6F9F1' : '#FFF3D6'} />
        <KPICard label="Meetings Booked" value={r.meetings} sub={`${pct(r.meetings, r.totalDials)} of dials  ${delta(r.meetDelta)}`} bg={r.meetings > 0 ? '#E6F9F1' : '#F3F4F6'} />
        <KPICard label="Unique Companies" value={r.uniqueCompanies} sub="contacted this period" bg="#DBEAFE" />
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
      <SectionHeader>BEST DAY TO CALL — CONNECT RATE</SectionHeader>
      <ColHeader cols={dayCols} widths={dayWidths} />
      {sortedDays.map((day, i) => {
        const d = r.byDay[day];
        const cr = pctNum(d.connections, d.dials);
        return <DataRow key={day} alt={i % 2 === 1} widths={dayWidths} cells={[
          day, d.dials, d.connections,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          d.meetings,
        ]} />;
      })}

      {/* By Rep (overview) */}
      <SectionHeader>BY REP</SectionHeader>
      <ColHeader cols={repCols} widths={repWidths} />
      {sortedReps.map(([rep, d], i) => {
        const cr = pctNum(d.connections, d.dials);
        const dialsDay = d.dates.size ? Math.round(d.dials / d.dates.size) : 0;
        return <DataRow key={rep} alt={i % 2 === 1} widths={repWidths} cells={[
          { value: rep, style: { fontWeight: 700 } },
          d.dials, dialsDay, d.connections,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          d.meetings, pct(d.meetings, d.dials),
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

      {/* ========== SECTION 2: BY VERTICAL ========== */}

      <SectionHeader>BY VERTICAL</SectionHeader>
      {/* Grand total row */}
      <div style={{ display: 'flex', background: S.headerBg, color: S.headerText, fontWeight: 700, fontSize: 12 }}>
        {[['ALL VERTICALS', vertWidths[0]], [r.totalDials, vertWidths[1]], [r.connections, vertWidths[2]], [pct(r.connections, r.totalDials), vertWidths[3]], [r.meetings, vertWidths[4]]].map(([v, w], i) => (
          <div key={i} style={{ width: w, padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right' }}>{v}</div>
        ))}
      </div>
      <ColHeader cols={vertCols} widths={vertWidths} />
      {sortedVerts.map(([vert, d], i) => {
        const cr = pctNum(d.connections, d.dials);
        return <DataRow key={vert} alt={i % 2 === 1} widths={vertWidths} cells={[
          vert, d.dials, d.connections,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          { value: d.meetings, style: d.meetings > 0 ? { background: S.green, fontWeight: 700 } : {} },
        ]} />;
      })}

      {/* ========== SECTION 3: BY REP ========== */}

      <SectionHeader>BY REP — DETAILED</SectionHeader>
      <ColHeader cols={repCols} widths={repWidths} />
      {sortedReps.map(([rep, d], i) => {
        const cr = pctNum(d.connections, d.dials);
        const dialsDay = d.dates.size ? Math.round(d.dials / d.dates.size) : 0;
        return <DataRow key={rep} alt={i % 2 === 1} widths={repWidths} cells={[
          { value: rep, style: { fontWeight: 700 } },
          d.dials, dialsDay, d.connections,
          { value: pct(d.connections, d.dials), style: { background: rateColor(cr), fontWeight: 600 } },
          d.meetings, pct(d.meetings, d.dials),
        ]} />;
      })}

      {/* Meetings under rep section */}
      <SectionHeader>MEETINGS BOOKED — ALL REPS</SectionHeader>
      {r.meetingsList.length > 0 ? (
        <>
          <ColHeader cols={mtgCols} widths={mtgWidths} />
          {r.meetingsList.map((m, i) => (
            <DataRow key={`rep-mtg-${i}`} alt={i % 2 === 1} widths={mtgWidths} cells={[
              { value: m.date, style: { color: '#9ca3af' } },
              m.contact, m.title, m.company, m.vertical, m.rep,
            ]} />
          ))}
        </>
      ) : (
        <div style={{ padding: '20px 16px', color: '#9ca3af', fontSize: 13, background: 'white' }}>No meetings booked this period.</div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
