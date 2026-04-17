#!/usr/bin/env node
/**
 * Sync all HubSpot call data locally.
 *
 * Usage:
 *   HUBSPOT_TOKEN=pat-xxx node scripts/sync-hubspot.js
 *
 * Or set token in .env file:
 *   HUBSPOT_TOKEN=pat-xxx
 *
 * Pulls ALL outbound calls (dials, connects, meetings — everything)
 * and writes them to src/callData.js so the app loads instantly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env if it exists
try {
  const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
} catch {}

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) { console.error('Missing HUBSPOT_TOKEN'); process.exit(1); }

// --- Config ---
const OWNER_MAP = { '163308867': 'Brandon Liao', '162266623': 'Chuck Gartland' };

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

const MEETING_GUID = '81180310-0202-4b44-8417-168bd57e399a';

// --- HubSpot API helpers ---
async function hsFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.hubapi.com${path}`, opts);
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${path}`);
  return res.json();
}

async function searchCalls(sinceMs, beforeMs) {
  const all = [];
  let after;
  while (true) {
    const filters = [
      { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
      { propertyName: 'hs_timestamp', operator: 'GTE', value: String(sinceMs) },
    ];
    if (beforeMs) filters.push({ propertyName: 'hs_timestamp', operator: 'LT', value: String(beforeMs) });
    const body = {
      filterGroups: [{ filters }],
      properties: ['hs_call_disposition', 'hs_timestamp', 'hubspot_owner_id', 'hs_call_duration',
                    'hs_call_body', 'hs_call_recording_url', 'hs_call_title', 'hs_call_has_transcript'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
      limit: 200,
    };
    if (after) body.after = after;
    const data = await hsFetch('/crm/v3/objects/calls/search', 'POST', body);
    all.push(...(data.results || []));
    if (data.paging?.next?.after) { after = data.paging.next.after; }
    else break;
    if (all.length >= 20000) break;
  }
  return all;
}

async function batchAssociations(callIds) {
  const map = {};
  for (let i = 0; i < callIds.length; i += 100) {
    const batch = callIds.slice(i, i + 100);
    try {
      const data = await hsFetch('/crm/v4/associations/calls/contacts/batch/read', 'POST',
        { inputs: batch.map(id => ({ id })) });
      (data.results || []).forEach(r => {
        const callId = String(r.from?.id);
        const tos = r.to || [];
        if (tos.length > 0) map[callId] = String(tos[0].toObjectId);
      });
    } catch (e) { console.warn(`  associations batch error: ${e.message}`); }
    if (i > 0 && i % 500 === 0) console.log(`  associations: ${i}/${callIds.length}`);
  }
  return map;
}

async function batchContacts(contactIds) {
  const map = {};
  const unique = [...new Set(contactIds)];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    try {
      const data = await hsFetch('/crm/v3/objects/contacts/batch/read', 'POST', {
        inputs: batch.map(id => ({ id })),
        properties: ['buyer_persona', 'jobtitle', 'firstname', 'lastname', 'associatedcompanyid'],
      });
      (data.results || []).forEach(c => { map[String(c.id)] = c.properties; });
    } catch (e) { console.warn(`  contacts batch error: ${e.message}`); }
  }
  return map;
}

async function batchCompanies(companyIds) {
  const map = {};
  const unique = [...new Set(companyIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    try {
      const data = await hsFetch('/crm/v3/objects/companies/batch/read', 'POST', {
        inputs: batch.map(id => ({ id })),
        properties: ['name', 'industry', 'industry_detail', 'field_type'],
      });
      (data.results || []).forEach(c => { map[String(c.id)] = c.properties; });
    } catch (e) { console.warn(`  companies batch error: ${e.message}`); }
  }
  return map;
}

// --- AI classification via OpenAI ---
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function classifyWithAI(transcript) {
  if (!OPENAI_KEY || !transcript || transcript.length < 100) return null;
  const prompt = `You are classifying a sales cold call transcript. Read it and return JSON ONLY, no prose.

Classify:
1. "offer" — What the rep pitched. One of: "AI Agents Platform", "Automate Manual Coordination", "AI for Logistics", "Other", "Not reached", "Follow-up call". Use "Not reached" if no real pitch happened. Use "Follow-up call" if rep references a prior conversation. If "Other", also fill "offer_detail" with 3-5 word description of what was pitched.
2. "objection" — Prospect's main pushback. One of: "Building in-house / have solution", "Too busy / bad timing", "Send info / email first", "Other", "None", "N/A". Use "N/A" for wrong contact, wrong number, meeting booked, or no real objection phase. Use "None" if prospect engaged positively with no pushback. If "Other", also fill "objection_detail" with 3-7 word neutral summary (third person, like "On another call" or "We are all set").
3. "is_followup" — Boolean. True if rep references previous conversation.

Return ONLY valid JSON: {"offer":"...","offer_detail":"","objection":"...","objection_detail":"","is_followup":false}

Transcript:
${transcript.slice(0, 4000)}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: 200,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`  AI classify error: ${res.status} ${err.slice(0, 100)}`);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (e) {
    console.warn(`  AI classify error: ${e.message}`);
    return null;
  }
}

// --- Persona label ---
function personaLabel(persona) {
  const m = {
    'technology': 'IT / Technology', 'logistics': 'Ops / Logistics',
    'operations': 'Ops / Logistics', 'ai_data': 'AI / Data', 'ai': 'AI / Data',
    'strategy': 'Strategy / Innovation', 'executive': 'Executive',
    'finance': 'Finance',
  };
  return m[persona] || (persona && persona !== 'none' ? persona : '');
}

// --- Transcript analysis (extract icebreaker, hook, objection) ---
function analyzeTranscript(transcript) {
  if (!transcript || transcript.length < 50) return { iceBreaker: { text: '', success: false }, hook: { text: '', success: false }, objection: { text: 'None', success: 'NONE' } };

  const lines = transcript.split('\n').filter(l => l.trim());
  const repLines = lines.filter(l => /\(Rep\):/.test(l)).map(l => l.replace(/^.*?\(Rep\):\s*/, '').trim());
  const prospectLines = lines.filter(l => /\(Prospect\):/.test(l)).map(l => l.replace(/^.*?\(Prospect\):\s*/, '').trim());

  if (repLines.length === 0) return { iceBreaker: { text: '', success: false }, hook: { text: '', success: false }, objection: { text: 'None', success: 'NONE' } };

  // Icebreaker = first substantive rep line
  let ibText = '';
  for (const line of repLines) {
    if (line.length > 15) { ibText = line; break; }
  }
  // IB success = prospect engaged (gave a substantive response, not just "who?")
  const firstProspectResponse = prospectLines.length > 0 ? prospectLines[0].toLowerCase() : '';
  const ibSuccess = firstProspectResponse.length > 5 &&
    !(/who|what|sorry|wrong|no|not interested/.test(firstProspectResponse));

  // Hook = first long pitch (>40 words)
  let hookText = '';
  for (const line of repLines) {
    if (line.split(' ').length > 40) { hookText = line; break; }
  }
  const hookSuccess = hookText.length > 0 && prospectLines.some(l =>
    l.length > 20 && !(/no|not interested|not right now|don't|remove|take me off/.test(l.toLowerCase()))
  );

  // Objection = first negative prospect response after pitch
  let objText = 'None';
  let objSuccess = 'NONE';
  const pitchIdx = repLines.indexOf(hookText);
  if (pitchIdx >= 0) {
    for (const line of prospectLines) {
      const lower = line.toLowerCase();
      if (lower.length > 10 && (/no|not interested|not right now|already|in-house|don't|busy|not looking|we have|we.re good|not a good|happy with|current|budget/.test(lower))) {
        objText = line;
        // Did rep recover after objection?
        const objIdx = lines.findIndex(l => l.includes(line));
        const afterLines = repLines.filter((_, i) => {
          const repIdx = lines.findIndex(l => l.includes(repLines[i]));
          return repIdx > objIdx;
        });
        objSuccess = afterLines.length >= 2;
        break;
      }
    }
  }

  return {
    iceBreaker: { text: ibText ? `"${ibText.slice(0, 150)}"` : '', success: ibSuccess },
    hook: { text: hookText ? hookText.slice(0, 200) : 'Never reached hook', success: hookSuccess },
    objection: { text: objText, success: objSuccess },
  };
}

// --- Pacific time helper ---
function toPacific(isoStr) {
  const d = new Date(isoStr);
  const pacific = new Date(d.getTime() - 7 * 60 * 60 * 1000);
  return {
    date: pacific.toISOString().slice(0, 10),
    time: pacific.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  // Pull from Feb 1 to now
  const since = new Date('2026-02-01T00:00:00Z').getTime();
  const now = Date.now();

  console.log('1/5  Fetching all outbound calls...');
  const rawCalls = await searchCalls(since, now);
  console.log(`     ${rawCalls.length} calls fetched`);

  // Only process calls from our reps
  const ourCalls = rawCalls.filter(c => {
    const owner = c.properties?.hubspot_owner_id;
    return OWNER_MAP[owner];
  });
  console.log(`     ${ourCalls.length} calls from our reps`);

  // Get connected call IDs for enrichment (skip no-answer/voicemail for speed)
  const connectedCallIds = ourCalls
    .filter(c => !NOT_CONNECT.has(c.properties?.hs_call_disposition))
    .map(c => String(c.id));
  console.log(`     ${connectedCallIds.length} connected calls to enrich`);

  console.log('2/5  Fetching contact associations...');
  const callToContact = await batchAssociations(connectedCallIds);
  console.log(`     ${Object.keys(callToContact).length} call-contact links`);

  console.log('3/5  Fetching contacts...');
  const contactIds = Object.values(callToContact);
  const contacts = await batchContacts(contactIds);
  console.log(`     ${Object.keys(contacts).length} contacts enriched`);

  console.log('4/5  Fetching companies...');
  const companyIds = Object.values(contacts).map(c => c.associatedcompanyid).filter(Boolean);
  const companies = await batchCompanies(companyIds);
  console.log(`     ${Object.keys(companies).length} companies enriched`);

  console.log('5/5  Building call data...');

  const calls = ourCalls.map(c => {
    const p = c.properties;
    const callId = String(c.id);
    const dispGuid = p.hs_call_disposition || '';
    const outcome = DISP_MAP[dispGuid] || 'Other';
    const durationMs = parseInt(p.hs_call_duration) || 0;
    const { date, time } = toPacific(p.hs_timestamp);
    const rep = OWNER_MAP[p.hubspot_owner_id] || 'Unknown';

    // Contact enrichment
    const contactId = callToContact[callId];
    const contact = contactId ? contacts[contactId] : null;
    const companyId = contact?.associatedcompanyid;
    const company = companyId ? companies[companyId] : null;

    const contactName = contact
      ? `${contact.firstname || ''} ${contact.lastname || ''}`.trim()
      : '';

    // Classification (Nooks style)
    const isConnect = !NOT_CONNECT.has(dispGuid);
    const isConversation = isConnect && durationMs >= 60000;
    const isMeeting = dispGuid === MEETING_GUID;

    // Analyze transcript for icebreaker/hook/objection
    const hasDialogue = /\(Rep\):/.test(p.hs_call_body || '') && /\(Prospect\):/.test(p.hs_call_body || '');
    const analysis = hasDialogue ? analyzeTranscript(p.hs_call_body) : {
      iceBreaker: { text: '', success: false },
      hook: { text: '', success: false },
      objection: { text: 'None', success: 'NONE' },
    };

    return {
      id: callId,
      date,
      time,
      timestamp: p.hs_timestamp,
      rep,
      outcome,
      dispGuid,

      // Contact
      contactName,
      title: contact?.jobtitle || '',
      persona: personaLabel(contact?.buyer_persona),

      // Company
      company: company?.name || '',
      industry: company?.industry || '',
      vertical: company?.industry_detail || company?.industry || '',

      // Call data
      durationMs,
      transcript: p.hs_call_body || '',
      recordingUrl: p.hs_call_recording_url || '',
      hsUrl: `https://app.hubspot.com/calls/244248253/review/${callId}`,

      // Funnel flags
      isConnect,
      isConversation,
      isMeeting,

      // Call analysis
      iceBreaker: analysis.iceBreaker,
      hook: analysis.hook,
      objection: analysis.objection,
    };
  });

  // Sort newest first
  calls.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // AI classify conversations (>60s) using OpenAI
  if (OPENAI_KEY) {
    const toClassify = calls.filter(c => c.isConversation && c.transcript && c.transcript.length > 100);
    console.log(`\n  AI-classifying ${toClassify.length} conversations...`);
    let done = 0, ok = 0;
    const CONCURRENCY = 8;
    for (let i = 0; i < toClassify.length; i += CONCURRENCY) {
      const batch = toClassify.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (call) => {
        const result = await classifyWithAI(call.transcript);
        done++;
        if (result) {
          ok++;
          call.aiOffer = result.offer || null;
          call.aiOfferDetail = result.offer_detail || '';
          call.aiObjection = result.objection || null;
          call.aiObjectionDetail = result.objection_detail || '';
          call.aiIsFollowup = !!result.is_followup;
        }
      }));
      if (done % 50 === 0 || done === toClassify.length) {
        console.log(`     ${done}/${toClassify.length} classified (${ok} OK)`);
      }
    }
    console.log(`  AI classification done: ${ok}/${toClassify.length} succeeded`);
  } else {
    console.log('\n  Skipping AI classification (no OPENAI_API_KEY)');
  }

  // Compute summary stats
  const totalDials = calls.length;
  const totalConnects = calls.filter(c => c.isConnect).length;
  const totalConvos = calls.filter(c => c.isConversation).length;
  const totalMeetings = calls.filter(c => c.isMeeting).length;
  const dateRange = calls.length
    ? { from: calls[calls.length - 1].date, to: calls[0].date }
    : { from: '', to: '' };

  console.log(`\n  Summary:`);
  console.log(`  Dials:         ${totalDials}`);
  console.log(`  Connects:      ${totalConnects}`);
  console.log(`  Conversations: ${totalConvos}`);
  console.log(`  Meetings:      ${totalMeetings}`);
  console.log(`  Date range:    ${dateRange.from} to ${dateRange.to}`);

  // Write to src/allCallData.js (separate from the existing callData.js)
  const outPath = path.join(ROOT, 'src', 'allCallData.js');
  const syncTime = new Date().toISOString();

  const output = `// Auto-synced from HubSpot — ${syncTime}
// ${totalDials} dials | ${totalConnects} connects | ${totalConvos} conversations | ${totalMeetings} meetings
// Date range: ${dateRange.from} to ${dateRange.to}

export const SYNC_META = {
  syncedAt: "${syncTime}",
  totalDials: ${totalDials},
  totalConnects: ${totalConnects},
  totalConversations: ${totalConvos},
  totalMeetings: ${totalMeetings},
  dateRange: ${JSON.stringify(dateRange)},
};

export const ALL_CALLS = ${JSON.stringify(calls, null, 2)};
`;

  fs.writeFileSync(outPath, output, 'utf8');
  console.log(`\n  Written to ${outPath} (${(output.length / 1024).toFixed(0)} KB)`);
  console.log('  Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
