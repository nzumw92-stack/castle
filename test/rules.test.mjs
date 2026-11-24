import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeState } from '../engine/rules.mjs';
import { nextBoundary, berlinParts } from '../engine/time.mjs';

const buildings = JSON.parse(readFileSync(new URL('../data/buildings.json', import.meta.url)));
const names = JSON.parse(readFileSync(new URL('../data/names.json', import.meta.url)));
// Monday 30 Nov 2026, 12:00 UTC. The first vote runs until Sunday 6 Dec 19:00 Berlin (18:00 UTC).
const config = { start: '2026-11-30T12:00:00Z', seed: 1066, firstBuildings: ['motte', 'bailey'], nameVote: ['Hardlington', 'Castle Nottoodark', 'Little Mudbury'], minBuildDays: 2, stonesPerDay: 3 };
const run = (events, now, cfg = config) => computeState(events, { config: cfg, buildings, names, now: new Date(now) });
const F = (t, yt, ig) => ({ t, type: 'followers', yt, ig });
let n = 0;
const C = (t, who, extra = {}) => ({ t, type: 'comment', p: 'yt', who, cid: 'c' + n++, ok: true, ...extra });

test('vote week ends Sunday 19:00 Berlin, winter and summer', () => {
  assert.equal(new Date(nextBoundary(Date.parse('2026-11-30T12:00:00Z'))).toISOString(), '2026-12-06T18:00:00.000Z');
  assert.equal(new Date(nextBoundary(Date.parse('2026-07-01T12:00:00Z'))).toISOString(), '2026-07-05T17:00:00.000Z');
  assert.equal(berlinParts(Date.parse('2026-12-06T18:00:00Z')).h, 19);
});

test('before the start nothing is built', () => {
  const s = run([F('2026-11-29T10:00:00Z', 15, 8)], '2026-11-29T12:00:00Z');
  assert.equal(s.started, false);
  assert.equal(s.population.total, 23);
  assert.equal(s.buildings.length, 0);
});

test('population = youtube + instagram, latest value, anonymous residents fill up', () => {
  const s = run([F('2026-11-30T10:00:00Z', 15, 8), F('2026-12-01T10:00:00Z', 16, 9)], '2026-12-01T12:00:00Z');
  assert.deepEqual(s.population, { total: 25, youtube: 16, instagram: 9, named: 0 });
  assert.equal(s.residents.length, 25);
  assert.ok(s.residents.every(r => r.anon && r.home));
});

test('first vote is the castle name; the last vote per account counts', () => {
  const ev = [F('2026-11-30T10:00:00Z', 15, 8),
    C('2026-12-01T10:00:00Z', 'u1', { cmd: 'vote', arg: 'A' }),
    C('2026-12-01T11:00:00Z', 'u2', { cmd: 'vote', arg: 'B' }),
    C('2026-12-01T12:00:00Z', 'u3', { cmd: 'vote', arg: 'B' }),
    C('2026-12-02T10:00:00Z', 'u3', { cmd: 'vote', arg: 'A' }),
    C('2026-12-02T11:00:00Z', 'u4', { cmd: 'vote', arg: 'littlemudbury' })];
  const open = run(ev, '2026-12-03T00:00:00Z');
  assert.equal(open.vote.kind, 'name');
  assert.deepEqual(open.vote.options.map(o => o.votes), [2, 1, 1]);
  const closed = run(ev, '2026-12-06T18:00:01Z');
  assert.equal(closed.castle.name, 'Hardlington');
  assert.equal(closed.history[0].winner, 'Hardlington');
});

test('votes before the vote opened or after it closed do not count', () => {
  const ev = [F('2026-11-30T10:00:00Z', 15, 8), C('2026-11-30T11:00:00Z', 'u1', { cmd: 'vote', arg: 'C' }), C('2026-12-06T18:30:00Z', 'u2', { cmd: 'vote', arg: 'C' })];
  const s = run(ev, '2026-12-06T19:00:00Z');
  assert.equal(s.history[0].options[2].votes, 0);
});

test('a tie or no votes is decided by the seed, the same way every time', () => {
  const ev = [F('2026-11-30T10:00:00Z', 15, 8), C('2026-12-01T10:00:00Z', 'u1', { cmd: 'vote', arg: 'A' }), C('2026-12-01T10:00:00Z', 'u2', { cmd: 'vote', arg: 'B' })];
  const a = run(ev, '2026-12-07T00:00:00Z'), b = run(ev, '2026-12-07T00:00:00Z');
  assert.ok(['Hardlington', 'Castle Nottoodark'].includes(a.castle.name));
  assert.equal(a.castle.name, b.castle.name);
  assert.match(a.chronicle.find(c => /called/.test(c.text)).text, /coin/);
  const none = run([F('2026-11-30T10:00:00Z', 15, 8)], '2026-12-07T00:00:00Z');
  assert.ok(none.castle.name);
  assert.match(none.chronicle.find(c => /called/.test(c.text)).text, /Nobody voted/);
});

test('max 3 stones per account per day, short comments give none', () => {
  const ev = [F('2026-11-30T10:00:00Z', 15, 8)];
  for (let i = 0; i < 6; i++) ev.push(C(`2026-12-01T1${i}:00:00Z`, 'spam'));
  ev.push(C('2026-12-01T10:30:00Z', 'u2', { ok: false }));
  ev.push(C('2026-12-02T10:00:00Z', 'spam'));
  assert.equal(run(ev, '2026-12-02T12:00:00Z').stones.total, 4);
});

test('comments before the start give no stones', () => {
  const s = run([F('2026-11-29T10:00:00Z', 15, 8), C('2026-11-29T11:00:00Z', 'u1')], '2026-12-01T00:00:00Z');
  assert.equal(s.stones.total, 0);
});

test('a building needs its stones and at least 2 days; surplus goes to the stock', () => {
  const ev = [F('2026-11-30T10:00:00Z', 15, 8)];
  // motte needs round(15 * (1 + 23/500)) = 16 stones
  for (let i = 0; i < 18; i++) ev.push(C('2026-11-30T13:00:00Z', 'u' + i));
  const early = run(ev, '2026-12-01T13:00:00Z');
  const m = early.buildings.find(b => b.id === 'motte');
  assert.equal(m.state, 'building');
  assert.equal(m.need, 16);
  assert.equal(m.readyAt, '2026-12-02T12:00:00Z');
  assert.equal(early.stones.stock, 2);
  const later = run(ev, '2026-12-02T12:00:01Z');
  assert.equal(later.buildings.find(b => b.id === 'motte').state, 'built');
});

test('during the name vote the bailey follows the motte without a vote', () => {
  const ev = [F('2026-11-30T10:00:00Z', 15, 8)];
  for (let i = 0; i < 16; i++) ev.push(C('2026-11-30T13:00:00Z', 'u' + i));
  const s = run(ev, '2026-12-03T00:00:00Z');
  const ids = s.buildings.map(b => b.id + ':' + b.state);
  assert.ok(ids.includes('motte:built'));
  assert.ok(ids.includes('bailey:building'));
});

test('!join gives a named resident; !leave and a deleted comment remove it', () => {
  const base = [F('2026-11-30T10:00:00Z', 15, 8)];
  const j = { t: '2026-12-01T10:00:00Z', type: 'join', p: 'ig', who: 'h:aaaaaaaa11', name: 'agnes_bakes', cid: 'x1', ref: '1' };
  const s1 = run([...base, j], '2026-12-01T12:00:00Z');
  assert.equal(s1.population.named, 1);
  assert.equal(s1.population.total, 23);
  assert.equal(s1.residents[0].name, 'agnes_bakes');
  const s2 = run([...base, j, { t: '2026-12-02T10:00:00Z', type: 'leave', p: 'ig', who: 'h:aaaaaaaa11', cid: 'x2' }], '2026-12-02T12:00:00Z');
  assert.equal(s2.population.named, 0);
  const s3 = run([...base, j, { t: '2026-12-02T10:00:00Z', type: 'gone', p: 'ig', who: 'h:aaaaaaaa11', ref: '1' }], '2026-12-02T12:00:00Z');
  assert.equal(s3.residents.some(r => r.name), false);
});

test('more named residents than followers: the total follows the named count', () => {
  const ev = [F('2026-11-30T10:00:00Z', 0, 1)];
  for (let i = 0; i < 3; i++) ev.push({ t: '2026-12-01T10:00:00Z', type: 'join', p: 'ig', who: 'h:0000000' + i, name: 'p' + i, cid: 'j' + i });
  assert.equal(run(ev, '2026-12-01T12:00:00Z').population.total, 3);
});

test('losing followers removes anonymous residents, named ones stay', () => {
  const j = { t: '2026-12-01T10:00:00Z', type: 'join', p: 'ig', who: 'h:bbbbbbbb22', name: 'walter', cid: 'j9' };
  const s = run([F('2026-11-30T10:00:00Z', 15, 8), j, F('2026-12-02T10:00:00Z', 10, 5)], '2026-12-02T12:00:00Z');
  assert.equal(s.population.total, 15);
  assert.equal(s.residents.filter(r => r.name).length, 1);
  assert.equal(s.residents.length, 15);
});

test('same ledger, same state, whatever order the lines are in', () => {
  const ev = [F('2026-11-30T10:00:00Z', 40, 30)];
  for (let i = 0; i < 200; i++) ev.push(C(new Date(Date.parse('2026-11-30T13:00:00Z') + i * 3600e3).toISOString(), 'u' + (i % 25), i % 7 === 0 ? { cmd: 'vote', arg: 'ABC'[i % 3] } : {}));
  const a = run(ev, '2027-01-15T00:00:00Z'), b = run(ev.slice().reverse(), '2027-01-15T00:00:00Z');
  assert.deepEqual(a, b);
  assert.ok(a.buildings.filter(x => x.state === 'built').length >= 3);
});
