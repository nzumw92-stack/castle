// Vote weeks run Sunday 19:00 to Sunday 19:00, Berlin time (handles summer/winter time).
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function berlinParts(ms) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}
const offset = ms => { const p = berlinParts(ms); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };
export function berlinToUTC(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offset(guess);
  t = guess - offset(t);
  return t;
}
export const berlinDay = ms => { const p = berlinParts(ms); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
// Next Sunday 19:00 Berlin strictly after ms.
export function nextBoundary(ms) {
  const p = berlinParts(ms);
  for (let k = 0; k <= 7; k++) {
    const c = berlinToUTC(p.y, p.m, p.d - p.wd + k * 7, 19, 0);
    if (c > ms) return c;
  }
}
