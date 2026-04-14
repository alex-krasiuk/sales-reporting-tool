const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || '';

const BRANDON_OWNER_ID = '163308867';

const DISP_MAP = {
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  'a12225bd-f90c-43bb-aa10-4b7875a05937': 'Not Interested',
  '91fd5005-2ed7-45dd-b8ec-f22511b5ece2': 'Wrong Contact',
  'f76aed06-41e0-4b55-8f96-361bfd09bf0c': 'Follow up - interested',
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

// Nooks definition: these are NOT connects
const NOT_CONNECT = new Set([
  'b2cf5968-551e-4856-9783-52b3da59a7d0', // Voicemail
  '73a0d17f-1163-4015-bdd5-ec830791da20', // No answer
  '17b47fee-58de-441e-a44c-c6300d46f273', // Wrong number
]);

async function hsFetch(path, body) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HUBSPOT_TOKEN}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Get last workday (skip weekends)
function lastWorkdayMs(fromMs) {
  const d = new Date(fromMs);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  const dayStr = d.toISOString().slice(0, 10);
  return {
    fromMs: new Date(dayStr + 'T07:00:00Z').getTime(),
    toMs: new Date(dayStr + 'T07:00:00Z').getTime() + 24 * 60 * 60 * 1000,
    label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

async function fetchCalls(fromMs, toMs) {
  const all = [];
  let after;
  while (true) {
    const data = await hsFetch('/crm/v3/objects/calls/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
        { propertyName: 'hs_timestamp', operator: 'GTE', value: String(fromMs) },
        { propertyName: 'hs_timestamp', operator: 'LT', value: String(toMs) },
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: BRANDON_OWNER_ID },
      ]}],
      properties: ['hs_call_disposition', 'hs_timestamp', 'hubspot_owner_id', 'hs_call_duration', 'hs_call_recording_url'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
      limit: 200,
      ...(after ? { after } : {}),
    });
    all.push(...(data.results || []));
    if (data.paging?.next?.after) after = data.paging.next.after;
    else break;
    if (all.length >= 2000) break;
  }
  return all;
}

function processCalls(calls) {
  const dials = calls.length;
  const connects = calls.filter(c => !NOT_CONNECT.has(c.properties.hs_call_disposition));
  const convos = calls.filter(c => !NOT_CONNECT.has(c.properties.hs_call_disposition) && parseInt(c.properties.hs_call_duration || '0') >= 60000);
  const meetings = calls.filter(c => c.properties.hs_call_disposition === '81180310-0202-4b44-8417-168bd57e399a');
  const followUps = connects.filter(c => c.properties.hs_call_disposition === 'f76aed06-41e0-4b55-8f96-361bfd09bf0c').length;
  const notInterested = connects.filter(c => c.properties.hs_call_disposition === 'a12225bd-f90c-43bb-aa10-4b7875a05937').length;
  const busy = connects.filter(c => c.properties.hs_call_disposition === '9d9162e7-6cf3-4944-bf63-4dff82258764').length;
  const wrongNum = calls.filter(c => c.properties.hs_call_disposition === '17b47fee-58de-441e-a44c-c6300d46f273').length;
  const cr = dials ? (connects.length / dials * 100).toFixed(1) : '0';
  return { dials, connects: connects.length, convos: convos.length, meetings: meetings.length, followUps, notInterested, busy, wrongNum, cr, convoList: convos, meetingList: meetings };
}

export default async function handler(req, res) {
  try {
    const now = new Date();
    const pacific = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const todayStr = pacific.toISOString().slice(0, 10);
    const todayLabel = pacific.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const fromMs = new Date(todayStr + 'T07:00:00Z').getTime();
    const toMs = fromMs + 24 * 60 * 60 * 1000;

    // Last workday for comparison
    const prev = lastWorkdayMs(fromMs);

    // Fetch Brandon's calls — today + last workday
    const todayCalls = await fetchCalls(fromMs, toMs);
    const prevCalls = await fetchCalls(prev.fromMs, prev.toMs);

    const t = processCalls(todayCalls);
    const p = processCalls(prevCalls);

    // Enrich conversations with contact info
    const convoIds = t.convoList.map(c => String(c.id));
    const meetingIds = t.meetingList.map(c => String(c.id));
    const enrichIds = [...new Set([...convoIds, ...meetingIds])];

    const callToContact = {};
    for (let i = 0; i < enrichIds.length; i += 100) {
      try {
        const data = await hsFetch('/crm/v4/associations/calls/contacts/batch/read', { inputs: enrichIds.slice(i, i + 100).map(id => ({ id })) });
        (data.results || []).forEach(r => { if (r.to?.[0]) callToContact[String(r.from?.id)] = String(r.to[0].toObjectId); });
      } catch {}
    }

    const contactIds = [...new Set(Object.values(callToContact))];
    const contacts = {};
    for (let i = 0; i < contactIds.length; i += 100) {
      try {
        const data = await hsFetch('/crm/v3/objects/contacts/batch/read', { inputs: contactIds.slice(i, i + 100).map(id => ({ id })), properties: ['firstname', 'lastname', 'jobtitle', 'associatedcompanyid'] });
        (data.results || []).forEach(c => { contacts[String(c.id)] = c.properties; });
      } catch {}
    }

    const companyIds = [...new Set(Object.values(contacts).map(c => c.associatedcompanyid).filter(Boolean))];
    const companies = {};
    for (let i = 0; i < companyIds.length; i += 100) {
      try {
        const data = await hsFetch('/crm/v3/objects/companies/batch/read', { inputs: companyIds.slice(i, i + 100).map(id => ({ id })), properties: ['name'] });
        (data.results || []).forEach(c => { companies[String(c.id)] = c.properties; });
      } catch {}
    }

    function enrichCall(call) {
      const contactId = callToContact[String(call.id)];
      const contact = contactId ? contacts[contactId] : null;
      const company = contact?.associatedcompanyid ? companies[contact.associatedcompanyid] : null;
      const name = contact ? `${contact.firstname || ''} ${contact.lastname || ''}`.trim() : 'Unknown';
      const title = contact?.jobtitle || '';
      const companyName = company?.name || '';
      const dur = parseInt(call.properties.hs_call_duration || '0');
      const mins = Math.floor(dur / 60000);
      const secs = Math.floor((dur % 60000) / 1000);
      const disp = DISP_MAP[call.properties.hs_call_disposition] || 'Other';
      const recording = call.properties.hs_call_recording_url || '';
      const hsUrl = `https://app.hubspot.com/calls/244248253/review/${call.id}`;
      return { name, title, companyName, disp, duration: `${mins}:${String(secs).padStart(2, '0')}`, recording, hsUrl };
    }

    const arrow = (curr, prev) => curr > prev ? '↑' : curr < prev ? '↓' : '→';

    // Build message
    let msg = `📞 *Runbook — Daily Call Report*\n${todayLabel}\n`;
    msg += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `👤 *Brandon Liao*\n`;
    msg += `Dials: *${t.dials}* → Connects: *${t.connects}* (${t.cr}%) → Convos (>1m): *${t.convos}* → Meetings: *${t.meetings}*\n`;
    msg += `Interested: ${t.followUps} | Not Interested: ${t.notInterested} | Busy: ${t.busy} | Wrong #: ${t.wrongNum}\n\n`;

    msg += `📈 _vs ${prev.label}:_\n`;
    msg += `_• Dials: ${p.dials} ${arrow(t.dials, p.dials)}`;
    msg += ` | Connect rate: ${p.cr}% ${arrow(parseFloat(t.cr), parseFloat(p.cr))}`;
    msg += ` | Convos: ${p.convos} ${arrow(t.convos, p.convos)}`;
    msg += ` | Meetings: ${p.meetings} ${arrow(t.meetings, p.meetings)}_\n`;

    if (t.convoList.length > 0) {
      msg += `\n📝 *Conversations:*\n`;
      t.convoList.forEach(call => {
        const c = enrichCall(call);
        msg += `• ${c.name} — ${c.title}${c.companyName ? ', ' + c.companyName : ''} (${c.disp}, ${c.duration})\n`;
        const links = [];
        if (c.recording) links.push(`<${c.recording}|🎧 Listen>`);
        links.push(`<${c.hsUrl}|📋 HubSpot>`);
        msg += `  ${links.join(' | ')}\n`;
      });
    }

    if (t.meetingList.length > 0) {
      msg += `\n🏆 *Meetings Booked:*\n`;
      t.meetingList.forEach(call => {
        const c = enrichCall(call);
        msg += `• ${c.name} — ${c.title}${c.companyName ? ', ' + c.companyName : ''}\n`;
        const links = [];
        if (c.recording) links.push(`<${c.recording}|🎧 Listen>`);
        links.push(`<${c.hsUrl}|📋 HubSpot>`);
        msg += `  ${links.join(' | ')}\n`;
      });
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;

    // Post to Slack
    const slackRes = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg }),
    });

    if (slackRes.ok) {
      res.status(200).json({ ok: true, dials: t.dials, connects: t.connects, convos: t.convos, meetings: t.meetings });
    } else {
      const err = await slackRes.text();
      res.status(500).json({ ok: false, error: `Slack error: ${err}` });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
