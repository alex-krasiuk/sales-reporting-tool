const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || '';

const REPS = {
  '163308867': 'Brandon Liao',
  '164112986': 'Joe Ammirato',
};

const DISP_MAP = {
  '9d9162e7-6cf3-4944-bf63-4dff82258764': 'Busy',
  'f240bbac-87c9-4f6e-bf70-924b57d47db7': 'Connected',
  '348880cf-1981-4671-b4de-0645d5926dfa': 'Connected : Confirmed Meeting',
  'af0d4f3e-13fd-4917-8242-b32daaad5fd8': 'Connected : Demo Set',
  '79ce9f07-ff5f-4f17-ba9e-01d8d8838c75': 'Connected : No Longer With Company',
  '91fd5005-2ed7-45dd-b8ec-f22511b5ece2': 'Connected : Not Decision Maker',
  '63c120ab-9172-4cc9-92d5-73628674759a': 'Connected : Opt Out',
  '7b8d1d5e-9280-44c2-b201-3bd47709b716': 'Connected Negative - Competitor',
  'c8d1d5f1-fa74-4b16-8973-ef69bb98c3e5': 'Connected Negative - Homegrown',
  '38cfbd27-abc5-4e34-aa18-2f95d0446518': 'Connected Negative - Other',
  '5a19720c-f6a2-4d55-b260-d37f955f1316': 'Connected Negative - Timing',
  'c9d83dd7-08e6-4fa6-abf8-f00768c1a23e': 'Connected Positive : Add To Strat',
  '255a94e1-a80f-4799-b533-0d46e9e83732': 'Connected Positive : Call Later',
  '6e91ac09-47aa-4071-b418-837a389c9b18': 'Connected Positive : Follow-Up (PS)',
  'eeda19de-af72-47f6-820e-7a3348267d16': 'Hung Up',
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff': 'Left live message',
  'b2cf5968-551e-4856-9783-52b3da59a7d0': 'Left voicemail',
  '73a0d17f-1163-4015-bdd5-ec830791da20': 'No answer',
  '17b47fee-58de-441e-a44c-c6300d46f273': 'Wrong number',
};

// Not connects: aligned with Nooks (Hung Up counts as connect — person picked up)
const NOT_CONNECT = new Set([
  '9d9162e7-6cf3-4944-bf63-4dff82258764', // Busy
  'a4c4c377-d246-4b32-a13b-75a56a4cd0ff', // Left live message
  'b2cf5968-551e-4856-9783-52b3da59a7d0', // Left voicemail
  '73a0d17f-1163-4015-bdd5-ec830791da20', // No answer
  '17b47fee-58de-441e-a44c-c6300d46f273', // Wrong number
]);

const MEETING_GUIDS = new Set([
  'af0d4f3e-13fd-4917-8242-b32daaad5fd8', // Connected : Demo Set (new demos only)
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

async function fetchCalls(fromMs, toMs, ownerId) {
  const all = [];
  let after;
  while (true) {
    const data = await hsFetch('/crm/v3/objects/calls/search', {
      filterGroups: [{ filters: [
        { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
        { propertyName: 'hs_timestamp', operator: 'GTE', value: String(fromMs) },
        { propertyName: 'hs_timestamp', operator: 'LT', value: String(toMs) },
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
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
  const meetings = calls.filter(c => MEETING_GUIDS.has(c.properties.hs_call_disposition));
  const positive = connects.filter(c => (DISP_MAP[c.properties.hs_call_disposition] || '').startsWith('Connected Positive')).length;
  const negative = connects.filter(c => (DISP_MAP[c.properties.hs_call_disposition] || '').startsWith('Connected Negative')).length;
  const busy = calls.filter(c => c.properties.hs_call_disposition === '9d9162e7-6cf3-4944-bf63-4dff82258764').length;
  const wrongNum = calls.filter(c => c.properties.hs_call_disposition === '17b47fee-58de-441e-a44c-c6300d46f273').length;
  const cr = dials ? (connects.length / dials * 100).toFixed(1) : '0';
  return { dials, connects: connects.length, convos: convos.length, meetings: meetings.length, positive, negative, busy, wrongNum, cr, convoList: convos, meetingList: meetings };
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

    // Fetch calls for all reps — today + last workday
    const repIds = Object.keys(REPS);
    const allEnrichIds = [];
    const repData = {};

    for (const ownerId of repIds) {
      const todayCalls = await fetchCalls(fromMs, toMs, ownerId);
      const prevCalls = await fetchCalls(prev.fromMs, prev.toMs, ownerId);
      const t = processCalls(todayCalls);
      const p = processCalls(prevCalls);
      repData[ownerId] = { t, p };
      allEnrichIds.push(...t.convoList.map(c => String(c.id)), ...t.meetingList.map(c => String(c.id)));
    }

    // Enrich conversations with contact info (batch across all reps)
    const enrichIds = [...new Set(allEnrichIds)];

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

    for (const ownerId of repIds) {
      const { t, p } = repData[ownerId];
      if (t.dials < 30 || t.connects < 1) continue; // skip reps below threshold

      msg += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `👤 *${REPS[ownerId]}*\n`;
      msg += `Dials: *${t.dials}* → Connects: *${t.connects}* (${t.cr}%) → Convos (>1m): *${t.convos}* → Meetings: *${t.meetings}*\n`;
      msg += `Positive: ${t.positive} | Negative: ${t.negative} | Busy: ${t.busy} | Wrong #: ${t.wrongNum}\n\n`;

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
