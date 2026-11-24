// Append-only event log, one JSON object per line, one file per month (month of recording).
import { readdirSync, readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const keyOf = e => e.type + '|' + (e.cid || e.ref || e.t);

export function loadLedger(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort())
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n'))
      if (line.trim()) out.push(JSON.parse(line));
  return out;
}

export function appendEvents(dir, events, now = new Date()) {
  if (!events.length) return null;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, now.toISOString().slice(0, 7) + '.jsonl');
  appendFileSync(file, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  return file;
}
