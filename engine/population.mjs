// Anonymous residents, jobs and houses. Pure and deterministic.
import { rngFor } from './seed.mjs';

// German job bynames (Socin, Upper Rhine 12th-13th c.). Women take -in: Weber -> Weberin.
const SURNAME = { smith: 'Schmid', baker: 'Becker', brewster: 'Brauer', miller: 'Müller', carpenter: 'Zimmermann', mason: 'Maurer', cook: 'Koch', fisher: 'Fischer', carter: 'Wagner', tanner: 'Gerber', chapman: 'Krämer', 'market reeve': 'Vogt', 'tithe-taker': 'Zehntner', gatekeeper: 'Torwart', 'parish priest': null, chaplain: null, 'hospital brother': null, 'hospital sister': null };
const fem = s => (s.endsWith('er') ? s + 'in' : s.endsWith('e') ? s + 'rin' : s + 'in');

export function anonName(seed, i, job, names) {
  const r = rngFor(seed, 'anon' + i);
  const female = job === 'hospital sister' || job === 'brewster' || job === 'grut-mistress' ? true : job === 'hospital brother' || job === 'parish priest' || job === 'chaplain' ? false : r() < 0.5;
  const list = female ? names.female : names.male;
  // top names are much more common (Heinrich, Konrad...), so skew the pick toward the start of the list
  const first = list[Math.floor(Math.pow(r(), 1.8) * list.length)];
  let sur = SURNAME[job];
  if (sur === null) return { name: first, sex: female ? 'f' : 'm' };   // clergy: given name only
  if (!sur) {
    const k = r();
    if (k < 0.55) return { name: `${first} ${names.places[Math.floor(r() * names.places.length)]}`, sex: female ? 'f' : 'm' };
    sur = names.occupational[Math.floor(r() * names.occupational.length)];
  }
  return { name: `${first} ${female ? fem(sur) : sur}`, sex: female ? 'f' : 'm' };
}

// Building jobs are filled first (one person per listed job), everyone else works the fields.
export function assignJobs(count, builtIds, buildings) {
  const slots = [];
  for (const id of builtIds) for (const j of buildings[id]?.jobs || []) slots.push(j);
  const jobs = [];
  for (let i = 0; i < count; i++) jobs.push(i < slots.length ? slots[i] : (i % 4 === 3 ? 'cottar' : 'peasant'));
  return jobs;
}
export const houseOf = i => 'h' + (Math.floor(i / 5) + 1);
