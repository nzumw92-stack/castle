// The castle rules: ledger + config -> state. Pure and deterministic, so the whole castle
// (every vote, every coin toss) can be recomputed and checked from the public ledger.
import { rngFor, shuffle } from './seed.mjs';
import { nextBoundary, berlinDay } from './time.mjs';
import { anonName, assignJobs, houseOf } from './population.mjs';

const DAY = 864e5;
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function computeState(events, { config, buildings: BD, names, now }) {
  const B = BD.buildings, seed = config.seed;
  const start = Date.parse(config.start), nowMs = +now;
  const minBuild = (config.minBuildDays ?? 2) * DAY;
  const perDay = config.stonesPerDay ?? 3;

  const evs = events
    .map((e, i) => ({ ...e, ms: Date.parse(e.t), i }))
    .filter(e => !Number.isNaN(e.ms) && e.ms <= nowMs)
    .sort((a, b) => a.ms - b.ms || a.i - b.i);

  let yt = 0, ig = 0;
  const named = new Map();          // who -> {name, p, since, ref}
  const stoneDay = new Map();       // day|who -> stones counted that day
  const built = [], queue = [], chronicle = [], history = [];
  let current = null, stock = 0, totalStones = 0, weekStones = 0;
  let vote = null, voteN = 0, castleName = null, started = false;

  const pop = () => Math.max(yt + ig, named.size);
  const have = () => new Set([...built.map(b => b.id), ...(current ? [current.id] : []), ...queue]);
  const say = (t, text) => chronicle.push({ t: iso(t), week: voteN, text });

  function startNext(t) {
    if (current || !queue.length) return;
    const id = queue.shift();
    const base = BD.stonesByPhase[B[id].phase];
    const need = Math.round(base * (1 + pop() / 500));
    const take = Math.min(stock, need);
    stock -= take;
    current = { id, startedAt: t, need, stones: take, reachedAt: take >= need ? t : null, week: voteN };
  }
  function addStone(t) {
    totalStones++; weekStones++;
    if (current && current.stones < current.need) {
      current.stones++;
      if (current.stones >= current.need) current.reachedAt = t;
    } else stock++;
  }
  const doneAt = () => current && current.reachedAt != null ? Math.max(current.reachedAt, current.startedAt + minBuild) : Infinity;
  function complete(t) {
    built.push({ id: current.id, started: iso(current.startedAt), done: iso(t), week: current.week, stones: current.need });
    say(t, `The ${current.id} is finished.`);
    current = null;
    startNext(t);
  }

  function available() {
    const h = have(), p = pop();
    return Object.keys(B)
      .filter(id => !h.has(id) && B[id].pop <= p && B[id].needs.every(n => h.has(n)))
      .sort((a, b) => B[a].pop - B[b].pop || a.localeCompare(b));
  }
  function openVote(t) {
    voteN++;
    weekStones = 0;
    const closes = nextBoundary(t);
    let opts = available();
    while (opts.length === 1) {   // one choice is no choice: just build it
      queue.push(opts[0]);
      say(t, `Only one thing could be built, so work begins on the ${opts[0]}.`);
      startNext(t);
      opts = available();
    }
    const pick = shuffle(opts.slice(0, 5), rngFor(seed, 'options' + voteN)).slice(0, 3);
    vote = { n: voteN, kind: pick.length ? 'build' : 'none', opens: t, closes, options: pick.map(id => ({ id })), ballots: new Map() };
  }
  function tally() {
    const c = vote.options.map(() => 0);
    for (const k of vote.ballots.values()) c[k]++;
    return c;
  }
  function closeVote(t) {
    if (vote.options.length) {
      const c = tally(), max = Math.max(...c), total = c.reduce((a, b) => a + b, 0);
      const top = c.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0);
      const r = rngFor(seed, 'close' + vote.n);
      const w = top[Math.floor(r() * top.length)];
      const win = vote.options[w].id;
      const how = total === 0 ? 'Nobody voted. Sir Hardly chose.' : top.length > 1 ? 'A tie. Sir Hardly tossed a coin.' : `${max} of ${total} votes.`;
      history.push({ week: vote.n, kind: vote.kind, closed: iso(t), winner: win, options: vote.options.map((o, i) => ({ key: 'ABC'[i], id: o.id, votes: c[i] })) });
      if (vote.kind === 'name') {
        castleName = win;
        say(t, `The castle shall be called ${win}. ${how}`);
      } else {
        queue.push(win);
        say(t, `Next to build: the ${win}. ${how}`);
        startNext(t);
      }
    }
    openVote(t);
  }
  function begin() {
    started = true;
    voteN = 1;
    let closes = nextBoundary(start);
    if (closes - start < 3 * DAY) closes = nextBoundary(closes);
    vote = { n: 1, kind: 'name', opens: start, closes, options: config.nameVote.map(id => ({ id })), ballots: new Map() };
    queue.push(...config.firstBuildings);
    say(start, `Sir Hardly plants his banner. Work begins on the ${config.firstBuildings[0]}.`);
    startNext(start);
  }
  // Run the clock forward to t: finish buildings and close votes in time order.
  function advance(t) {
    if (!started) { if (t < start) return; begin(); }
    for (let guard = 0; guard < 10000; guard++) {
      const d = doneAt(), c = vote ? vote.closes : Infinity;
      const next = Math.min(d, c);
      if (next > t) return;
      if (d <= c) complete(d); else closeVote(c);
    }
  }
  function ballot(e) {
    if (!vote || !vote.options.length || e.ms < vote.opens) return;
    const a = String(e.arg || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let k = ['a', 'b', 'c'].indexOf(a);
    if (k >= vote.options.length) k = -1;
    if (k < 0) k = vote.options.findIndex(o => o.id.toLowerCase().replace(/[^a-z0-9]/g, '') === a);
    if (k >= 0) vote.ballots.set(`${e.p}:${e.who}`, k);
  }

  for (const e of evs) {
    advance(e.ms);
    if (e.type === 'followers') { if (e.yt != null) yt = e.yt; if (e.ig != null) ig = e.ig; continue; }
    if (e.type === 'join') { if (!named.has(e.who)) named.set(e.who, { name: e.name, p: e.p, since: e.t, ref: e.ref }); continue; }
    if (e.type === 'leave' || e.type === 'gone') { named.delete(e.who); continue; }
    if (e.type !== 'comment' || e.ms < start) continue;
    if (e.ok) {
      const key = berlinDay(e.ms) + '|' + e.p + ':' + e.who;
      const n = stoneDay.get(key) || 0;
      if (n < perDay) { stoneDay.set(key, n + 1); addStone(e.ms); }
    }
    if (e.cmd === 'vote') ballot(e);
  }
  advance(nowMs);

  // ---- output ----
  const total = pop();
  const phase = BD.phases.filter(p => p.from <= total).reduce((a, p) => Math.max(a, p.n), 1);
  const builtIds = built.map(b => b.id);
  const jobs = assignJobs(total, builtIds, B);
  const people = [...named.entries()].sort((a, b) => a[1].since.localeCompare(b[1].since));
  const residents = [];
  for (let i = 0; i < total; i++) {
    if (i < people.length) {
      const [who, r] = people[i];
      residents.push({ id: 'n' + who.slice(2, 10), name: r.name, p: r.p, job: jobs[i], home: houseOf(i), since: r.since.slice(0, 10) });
    } else {
      const j = i - people.length, a = anonName(seed, j, jobs[i], names);
      residents.push({ id: 'a' + j, name: null, anon: a.name, sex: a.sex, job: jobs[i], home: houseOf(i) });
    }
  }
  const buildingsOut = [
    ...built.map(b => ({ ...b, state: 'built' })),
    ...(current ? [{ id: current.id, state: 'building', started: iso(current.startedAt), week: current.week, stones: current.stones, need: current.need,
      progress: Math.round(Math.min(current.stones / current.need, (nowMs - current.startedAt) / minBuild, 1) * 100) / 100,
      readyAt: current.reachedAt != null ? iso(doneAt()) : null }] : []),
    ...queue.map(id => ({ id, state: 'queued' })),
  ];
  const counts = vote ? tally() : [];
  return {
    version: 1,
    seed,
    started,
    start: iso(start),
    castle: { name: castleName, phase },
    population: { total, youtube: yt, instagram: ig, named: named.size },
    stones: { stock, thisWeek: weekStones, total: totalStones },
    buildings: buildingsOut,
    vote: vote && vote.options.length ? { id: 'w' + vote.n, kind: vote.kind, opens: iso(vote.opens), closes: iso(vote.closes),
      options: vote.options.map((o, i) => ({ key: 'ABC'[i], id: o.id, votes: counts[i] })) } : null,
    history,
    residents,
    chronicle: chronicle.slice(-30).reverse(),
  };
}
