// Anonymous residents, jobs and houses. Pure and deterministic.
import { rngFor } from './seed.mjs';

const SURNAME = { smith: 'Smith', baker: 'Baker', brewster: 'Brewster', miller: 'Miller', carpenter: 'Carpenter', mason: 'Mason', cook: 'Cook', fisher: 'Fisher', carter: 'Carter', tanner: 'Tanner', chapman: 'Chapman', hayward: 'Hayward', priest: 'Priest', groom: 'Groom', porter: 'Porter', ploughman: 'Plowman' };

export function anonName(seed, i, job, names) {
  const r = rngFor(seed, 'anon' + i);
  const female = r() < 0.5;
  const list = female ? names.female : names.male;
  // top names are much more common (William ~14 %), so skew the pick toward the start of the list
  const first = list[Math.floor(Math.pow(r(), 1.8) * list.length)];
  if (SURNAME[job]) return { name: `${first} ${SURNAME[job]}`, sex: female ? 'f' : 'm' };
  const k = r();
  const sur = k < 0.4 ? `atte ${names.places[Math.floor(r() * names.places.length)]}`
    : k < 0.7 ? `${female ? 'daughter' : 'son'} of ${names.male[Math.floor(r() * 10)]}`
    : names.occupational[Math.floor(r() * names.occupational.length)];
  return { name: `${first} ${sur}`, sex: female ? 'f' : 'm' };
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
