// Finds castle commands in a comment. The first command in the text wins.
const RE = /(?:^|[^\w!])!(join|leave|vote|[abc])(?![\w])(?:[ \t]+([a-z][\w-]{1,30}))?/i;

// All command words in a comment (so "!A !join" both votes and moves in).
export function commandSet(text) {
  const re = new RegExp(RE.source, 'gi'), out = new Set(); let m;
  while ((m = re.exec(String(text || '')))) out.add(m[1].toLowerCase());
  return out;
}

export function parseCommand(text) {
  const m = RE.exec(String(text || ''));
  if (!m) return null;
  const c = m[1].toLowerCase();
  if (c === 'a' || c === 'b' || c === 'c') return { cmd: 'vote', arg: c.toUpperCase() };
  if (c === 'vote') return m[2] ? { cmd: 'vote', arg: m[2].toLowerCase() } : null;
  return { cmd: c };
}

// Comments shorter than 3 visible characters do not count as stones.
export const longEnough = text => [...String(text || '').replace(/\s+/g, '')].length >= 3;

export function nameAllowed(username, blocked) {
  const u = String(username || '').toLowerCase();
  if (!u || blocked.users.map(x => x.toLowerCase()).includes(u)) return false;
  return !blocked.words.some(w => u.includes(w));
}
