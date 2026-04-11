const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || '';

const DISP_MAP = {
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  'a12225bd-f90c-43bb-aa10-4b7875a05937': 'Not Interested',
  '91fd5005-2ed7-45dd-b8ec-f22511b5ece2': 'Wrong Contact',
  'f76aed06-41e0-4b55-8f96-361bfd09bf0c': 'Follow up',
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'Busy',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff': 'Left live message',
  '81180310-0202-4b44-8417-168bd57e399a': 'Meeting Booked',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'Voicemail',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'No answer',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'Wrong number',
  '72a50c73-0b12-4595-9c31-5f197913be05': 'Wrong contact - referral',
  'e9a4df2f-3fcd-4f8a-bbd8-7634e48ca97c': 'No longer at company',
  '95d90a61-32bf-4d8d-9445-010e6ce6a055': 'Account to Pursue',
  'fa4b685a-eb2a-4a5f-ac74-a8e8dde76558': 'Call me later',
};
const OWNER_MAP = { '163308867': 'Brandon Liao', '162266623': 'Chuck Gartland' };
// Match Nooks connect definition — exclude Voicemail, No answer, Busy, Left live message, No longer at company
const EXCLUDED_FROM_CONNECT = new Set([
  'b2cf5968-551e-4856-9783-52b3da59a7d0', // Voicemail
  '73a0d17f-1163-4015-bdd5-ec830791da20', // No answer
  '9d9162e7-6cf3-4944-bf63-4dff82258764', // Busy
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff', // Left live message
  'e9a4df2f-3fcd-4f8a-bbd8-7634e48ca97c', // No longer at company
]);
const CONNECTED_DISPS = new Set(Object.keys(DISP_MAP).filter(k => !EXCLUDED_FROM_CONNECT.has(k)));

async function hsFetch(path, body) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async function handler(req, res) {
  try {
    // Today's boundaries in Pacific (UTC-7)
    const now = new Date();
    const pacific = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const todayStr = pacific.toISOString().slice(0, 10);
    const todayLabel = pacific.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const timeLabel = pacific.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const fromMs = new Date(todayStr + 'T07:00:00Z').getTime(); // midnight Pacific
    const toMs = fromMs + 24 * 60 * 60 * 1000;

    // Yesterday boundaries
    const yesterdayFromMs = fromMs - 24 * 60 * 60 * 1000;

    // Fetch today's calls (all outbound)
    const allCalls = [];
    let after = undefined;
    while (true) {
      const data = await hsFetch('/crm/v3/objects/calls/search', {
        filterGroups: [{ filters: [
          { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
          { propertyName: 'hs_timestamp', operator: 'GTE', value: String(fromMs) },
          { propertyName: 'hs_timestamp', operator: 'LT', value: String(toMs) },
        ]}],
        properties: ['hs_call_disposition', 'hs_timestamp', 'hubspot_owner_id', 'hs_call_duration', 'hs_call_recording_url', 'hs_call_body', 'hs_call_summary'],
        sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
        limit: 200,
        ...(after ? { after } : {}),
      });
      allCalls.push(...(data.results || []));
      if (data.paging?.next?.after) after = data.paging.next.after;
      else break;
      if (allCalls.length >= 2000) break;
    }

    // Fetch yesterday's calls for comparison
    const yesterdayData = await hsFetch('/crm/v3/objects/calls/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
        { propertyName: 'hs_timestamp', operator: 'GTE', value: String(yesterdayFromMs) },
        { propertyName: 'hs_timestamp', operator: 'LT', value: String(fromMs) },
      ]}],
      properties: ['hs_call_disposition', 'hubspot_owner_id', 'hs_call_duration'],
      limit: 1,
    });
    const yesterdayDials = yesterdayData.total || 0;

    // Process today's calls
    const totalDials = allCalls.length;
    const connects = allCalls.filter(c => CONNECTED_DISPS.has(c.properties.hs_call_disposition));
    const totalConnects = connects.length;

    // Get contact info for connected calls
    const callIds = connects.map(c => String(c.id));
    const callToContact = {};
    for (let i = 0; i < callIds.length; i += 100) {
      const batch = callIds.slice(i, i + 100);
      try {
        const assocData = await hsFetch('/crm/v4/associations/calls/contacts/batch/read', { inputs: batch.map(id => ({ id })) });
        (assocData.results || []).forEach(r => { if (r.to?.[0]) callToContact[String(r.from?.id)] = String(r.to[0].toObjectId); });
      } catch {}
    }

    const contactIds = [...new Set(Object.values(callToContact))];
    const contacts = {};
    for (let i = 0; i < contactIds.length; i += 100) {
      try {
        const cData = await hsFetch('/crm/v3/objects/contacts/batch/read', { inputs: contactIds.slice(i, i + 100).map(id => ({ id })), properties: ['firstname', 'lastname', 'jobtitle', 'associatedcompanyid'] });
        (cData.results || []).forEach(c => { contacts[String(c.id)] = c.properties; });
      } catch {}
    }

    const companyIds = [...new Set(Object.values(contacts).map(c => c.associatedcompanyid).filter(Boolean))];
    const companies = {};
    for (let i = 0; i < companyIds.length; i += 100) {
      try {
        const coData = await hsFetch('/crm/v3/objects/companies/batch/read', { inputs: companyIds.slice(i, i + 100).map(id => ({ id })), properties: ['vertical', 'name'] });
        (coData.results || []).forEach(c => { companies[String(c.id)] = c.properties; });
      } catch {}
    }

    // Enrich calls
    const enriched = connects.map(call => {
      const p = call.properties;
      const disp = DISP_MAP[p.hs_call_disposition] || 'Other';
      const rep = OWNER_MAP[p.hubspot_owner_id] || 'Unknown';
      const dur = parseInt(p.hs_call_duration || '0', 10);
      const contactId = callToContact[String(call.id)];
      const contact = contactId ? contacts[contactId] : null;
      const companyId = contact?.associatedcompanyid;
      const company = companyId ? companies[companyId] : null;
      const name = contact ? `${contact.firstname || ''} ${contact.lastname || ''}`.trim() : 'Unknown';
      const title = contact?.jobtitle || '';
      const vertical = company?.vertical || '';
      const recording = p.hs_call_recording_url || '';
      const hsUrl = `https://app.hubspot.com/calls/244248253/review/${call.id}`;
      return { id: call.id, disp, rep, dur, name, title, vertical, recording, hsUrl };
    });

    // Metrics
    const wrongNum = enriched.filter(c => c.disp === 'Wrong number').length;
    const wrongContact = enriched.filter(c => c.disp.startsWith('Wrong') && c.disp !== 'Wrong number').length;
    const meetings = enriched.filter(c => c.disp === 'Meeting Booked');
    const convos = enriched.filter(c => c.dur >= 60000);
    const connectRate = totalDials ? (totalConnects / totalDials * 100).toFixed(1) : '0';
    const wrongRate = totalConnects ? Math.round(wrongNum / totalConnects * 100) : 0;

    // Yesterday comparison
    let yesterdayConnects = 0;
    if (yesterdayDials > 0) {
      const ydFull = await hsFetch('/crm/v3/objects/calls/search', {
        filterGroups: [{ filters: [
          { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
          { propertyName: 'hs_timestamp', operator: 'GTE', value: String(yesterdayFromMs) },
          { propertyName: 'hs_timestamp', operator: 'LT', value: String(fromMs) },
        ]}],
        properties: ['hs_call_disposition', 'hs_call_duration'],
        limit: 200,
      });
      yesterdayConnects = (ydFull.results || []).filter(c => CONNECTED_DISPS.has(c.properties.hs_call_disposition)).length;
    }
    const ydConnectRate = yesterdayDials ? (yesterdayConnects / yesterdayDials * 100).toFixed(1) : '0';
    const ydWrongNum = yesterdayDials > 0 ? (await hsFetch('/crm/v3/objects/calls/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
        { propertyName: 'hs_timestamp', operator: 'GTE', value: String(yesterdayFromMs) },
        { propertyName: 'hs_timestamp', operator: 'LT', value: String(fromMs) },
        { propertyName: 'hs_call_disposition', operator: 'EQ', value: '17b47fee-58de-441e-a44c-c6300d46f273' },
      ]}], limit: 1,
    })).total || 0 : 0;
    const ydWrongRate = yesterdayConnects ? Math.round(ydWrongNum / yesterdayConnects * 100) : 0;
    const ydConvos = yesterdayDials > 0 ? (await hsFetch('/crm/v3/objects/calls/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
        { propertyName: 'hs_timestamp', operator: 'GTE', value: String(yesterdayFromMs) },
        { propertyName: 'hs_timestamp', operator: 'LT', value: String(fromMs) },
        { propertyName: 'hs_call_duration', operator: 'GTE', value: '60000' },
      ]}], limit: 1,
    })).total || 0 : 0;

    // Per rep — count dials from ALL calls, not just connects
    const reps = {};
    allCalls.forEach(c => {
      const rep = OWNER_MAP[c.properties.hubspot_owner_id] || 'Unknown';
      if (!reps[rep]) reps[rep] = { dials: 0, pickups: 0, convos: 0, meetings: 0, wrongNum: 0, calls: [] };
      reps[rep].dials++;
    });
    enriched.forEach(c => {
      if (!reps[c.rep]) reps[c.rep] = { dials: 0, pickups: 0, convos: 0, meetings: 0, wrongNum: 0, calls: [] };
      reps[c.rep].pickups++;
      if (c.dur >= 60000) { reps[c.rep].convos++; reps[c.rep].calls.push(c); }
      if (c.disp === 'Meeting Booked') reps[c.rep].meetings++;
      if (c.disp === 'Wrong number') reps[c.rep].wrongNum++;
    });

    // Objection counts
    const objections = {};
    enriched.forEach(c => {
      if (c.disp === 'Not Interested') objections['Not Interested'] = (objections['Not Interested'] || 0) + 1;
      if (c.disp === 'Wrong number') objections['Wrong Number'] = (objections['Wrong Number'] || 0) + 1;
      if (c.disp.startsWith('Wrong') && c.disp !== 'Wrong number') objections['Wrong Contact'] = (objections['Wrong Contact'] || 0) + 1;
      if (c.disp === 'Follow up') objections['Follow Up'] = (objections['Follow Up'] || 0) + 1;
      if (c.disp === 'Busy') objections['Busy'] = (objections['Busy'] || 0) + 1;
      if (c.disp === 'Account to Pursue') objections['Account to Pursue'] = (objections['Account to Pursue'] || 0) + 1;
    });
    const topObjs = Object.entries(objections).sort((a, b) => b[1] - a[1]);

    // Build Slack message
    const arrow = (curr, prev) => curr > prev ? '↑' : curr < prev ? '↓' : '→';

    let msg = `📞 *Runbook — Daily Call Report*\n${todayLabel} | ${timeLabel} Pacific\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📊 *TODAY'S NUMBERS*\n`;
    msg += `Dials: *${totalDials}* → Connects: *${totalConnects}* (${connectRate}%) → Conversations: *${convos.length}* → Meetings: *${meetings.length}*\n`;
    msg += `Wrong #: ${wrongNum} (${wrongRate}% of connects)\n\n`;

    // Per rep sections
    for (const [rep, r] of Object.entries(reps).sort((a, b) => b[1].dials - a[1].dials)) {
      const repConnectRate = r.dials ? (r.pickups / r.dials * 100).toFixed(1) : '0';
      const wnRate = r.pickups ? Math.round(r.wrongNum / r.pickups * 100) : 0;
      msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `👤 *${rep.toUpperCase()}*\n`;
      msg += `Dials: *${r.dials}* → Connects: *${r.pickups}* (${repConnectRate}%) → Convos: *${r.convos}* → Meetings: *${r.meetings}*\n`;
      msg += `Wrong #: ${r.wrongNum} (${wnRate}%)\n`;
      if (r.calls.length > 0) {
        msg += `• Conversations:\n`;
        r.calls.forEach(c => {
          msg += `  - ${c.name} — ${c.title}${c.vertical ? `, ${c.vertical}` : ''} (${c.disp})\n`;
          const links = [];
          if (c.recording) links.push(`<${c.recording}|🎧 Listen>`);
          links.push(`<${c.hsUrl}|📋 HubSpot>`);
          msg += `    ${links.join(' | ')}\n`;
        });
      }
      msg += `\n`;
    }

    // Meetings
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🏆 *MEETINGS BOOKED TODAY*\n`;
    if (meetings.length > 0) {
      meetings.forEach(m => {
        msg += `• ${m.name} — ${m.title}${m.vertical ? `, ${m.vertical}` : ''} (${m.rep.split(' ')[0]})\n`;
        const links = [];
        if (m.recording) links.push(`<${m.recording}|🎧 Listen>`);
        links.push(`<${m.hsUrl}|📋 HubSpot>`);
        msg += `  ${links.join(' | ')}\n`;
      });
    } else {
      msg += `(none today)\n`;
    }

    // Objections
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `❌ *TOP DISPOSITIONS*\n`;
    topObjs.forEach(([obj, count]) => { msg += `• ${obj}: ${count}\n`; });

    // Trends
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📈 *TRENDS (vs yesterday)*\n`;
    msg += `• Connect rate: ${connectRate}% (yesterday: ${ydConnectRate}%) ${arrow(parseFloat(connectRate), parseFloat(ydConnectRate))}\n`;
    msg += `• Wrong # rate: ${wrongRate}% (yesterday: ${ydWrongRate}%) ${arrow(ydWrongRate, wrongRate)}\n`;
    msg += `• Conversations: ${convos.length} (yesterday: ${ydConvos}) ${arrow(convos.length, ydConvos)}\n`;
    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔗 <https://call-analytics-app-eta.vercel.app|Full dashboard>`;

    // Post to Slack
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg }),
    });

    if (slackRes.ok) {
      res.status(200).json({ ok: true, message: 'Report sent to Slack', dials: totalDials, connects: totalConnects, convos: convos.length, meetings: meetings.length });
    } else {
      const err = await slackRes.text();
      res.status(500).json({ ok: false, error: `Slack error: ${err}` });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
