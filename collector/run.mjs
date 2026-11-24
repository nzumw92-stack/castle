// One collector run: fetch both platforms -> append new ledger events -> recompute docs/state.json.
// Exit code 0 = all fine, 2 = one platform failed (state is still written with the last known values).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchYouTube } from './youtube.mjs';
import { fetchInstagram, commentExists } from './instagram.mjs';
import { parseCommand, longEnough, nameAllowed } from './commands.mjs';
import { loadLedger, appendEvents, keyOf } from './ledger.mjs';
import { makeHasher } from './hash.mjs';
import { computeState } from '../engine/rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const LEDGER = join(ROOT, 'data/ledger');
const STATE = join(ROOT, 'docs/state.json');
const STATUS = join(ROOT, 'data/status.json');

const config = read('data/config.json');
const buildings = read('data/buildings.json');
const names = read('data/names.json');
const blocked = read('data/blocked.json');
const now = new Date();
const nowIso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
const hash = makeHasher(process.env.HASH_SALT);

const ledger = loadLedger(LEDGER);
const seen = new Set(ledger.map(keyOf));
const fresh = [];
const add = e => { const k = keyOf(e); if (!seen.has(k)) { seen.add(k); fresh.push(e); } };

let lastYt = null, lastIg = null;
for (const e of ledger) if (e.type === 'followers') { if (e.yt != null) lastYt = e.yt; if (e.ig != null) lastIg = e.ig; }

function commentEvents(p, c) {
  const who = hash(p, c.author), cid = hash(p, c.id);
  const cmd = parseCommand(c.text);
  add({ t: c.t, type: 'comment', p, who, cid, ok: longEnough(c.text), ...(cmd && cmd) });
  if (p !== 'ig' || !cmd) return;
  if (cmd.cmd === 'join' && nameAllowed(c.username, blocked)) add({ t: c.t, type: 'join', p, who, name: c.username, cid, ref: c.id });
  if (cmd.cmd === 'leave') add({ t: c.t, type: 'leave', p, who, cid });
}

const errors = {};
const dailyRun = now.getUTCHours() === 3 && now.getUTCMinutes() < 30;

if (process.env.YT_API_KEY) {
  try {
    const y = await fetchYouTube({ key: process.env.YT_API_KEY, channelId: config.youtube.channelId });
    if (y.subs != null) lastYt = y.subs;
    for (const c of y.comments) commentEvents('yt', c);
    console.log(`youtube: ${y.subs} subscribers, ${y.comments.length} comments`);
  } catch (e) { errors.yt = e.message; }
} else errors.yt = 'YT_API_KEY missing';

if (process.env.IG_TOKEN) {
  try {
    const tok = process.env.IG_TOKEN;
    const g = await fetchInstagram({ token: tok, userId: config.instagram.userId, username: config.instagram.username, full: dailyRun || !ledger.length, now });
    lastIg = g.followers;
    for (const c of g.comments) commentEvents('ig', c);
    console.log(`instagram: ${g.followers} followers, ${g.comments.length} comments`);
    if (dailyRun) {   // deleted !join comment -> name goes away
      const active = new Map();
      for (const e of [...ledger, ...fresh]) {
        if (e.type === 'join') active.set(e.who, e);
        if (e.type === 'leave' || e.type === 'gone') active.delete(e.who);
      }
      for (const j of active.values())
        if (j.ref && !(await commentExists(tok, j.ref))) add({ t: nowIso, type: 'gone', p: 'ig', who: j.who, ref: j.ref });
    }
  } catch (e) { errors.ig = e.message; }
} else errors.ig = 'IG_TOKEN missing';

// followers: one event only when a number changed
const prev = [...ledger].reverse().find(e => e.type === 'followers');
if (!prev || prev.yt !== lastYt || prev.ig !== lastIg) add({ t: nowIso, type: 'followers', yt: lastYt, ig: lastIg });

appendEvents(LEDGER, fresh, now);
console.log(`ledger: ${fresh.length} new events`);

// status: when did a platform start failing? (only written when that changes, to avoid needless commits)
const status = existsSync(STATUS) ? JSON.parse(readFileSync(STATUS, 'utf8')) : {};
const nextStatus = {};
for (const p of ['yt', 'ig']) if (errors[p]) nextStatus[p] = { since: status[p]?.since || nowIso, error: errors[p].slice(0, 200) };
if (JSON.stringify(nextStatus) !== JSON.stringify(status)) writeFileSync(STATUS, JSON.stringify(nextStatus, null, 2) + '\n');

const state = computeState([...ledger, ...fresh], { config, buildings, names, now });
state.stale = Object.fromEntries(Object.entries(nextStatus).map(([p, s]) => [p, s.since]));
const old = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
const strip = s => { if (!s) return ''; const { updated, ...rest } = s; return JSON.stringify(rest); };
if (strip(old) !== strip(state)) {
  writeFileSync(STATE, JSON.stringify({ updated: nowIso, ...state }) + '\n');
  console.log('state.json updated');
} else console.log('state.json unchanged');

for (const [p, m] of Object.entries(errors)) console.error(`ERROR ${p}: ${m}`);
process.exitCode = Object.keys(errors).length ? 2 : 0;
