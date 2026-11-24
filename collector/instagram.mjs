// Instagram via the Graph API with a system-user token (business portfolio "Hardly Dark Ages").
const G = 'https://graph.facebook.com/v21.0/';

async function get(url, token) {
  const u = new URL(url.startsWith('http') ? url : G + url);
  u.searchParams.set('access_token', token);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error(`Instagram: ${r.status} ${j.error?.message || ''}`.trim()); e.code = j.error?.code; throw e; }
  return j;
}
async function* pages(first, token, max = 10) {
  let url = first;
  for (let i = 0; url && i < max; i++) { const j = await get(url, token); yield j.data || []; url = j.paging?.next; }
}

const FIELDS = 'id,text,timestamp,username,from{id,username}';
const pick = (c, parentId) => ({ id: c.id, author: c.from?.id || c.username, username: c.from?.username || c.username, text: c.text || '', t: c.timestamp, parentId });

// full=false: only posts from the last 30 days (the API budget scales with impressions, so we stay frugal)
export async function fetchInstagram({ token, userId, username, full = false, now = new Date() }) {
  const me = await get(`${userId}?fields=followers_count,username`, token);
  const comments = [];
  for await (const media of pages(`${userId}/media?fields=id,timestamp,comments_count&limit=50`, token, 4)) {
    for (const m of media) {
      if (!m.comments_count) continue;
      if (!full && now - Date.parse(m.timestamp) > 30 * 864e5) continue;
      for await (const list of pages(`${m.id}/comments?fields=${FIELDS},replies{${FIELDS}}&limit=50`, token)) {
        for (const c of list) {
          comments.push(pick(c, null));
          for (const r of c.replies?.data || []) comments.push(pick(r, c.id));
        }
      }
    }
  }
  const own = (username || me.username || '').toLowerCase();
  return { followers: me.followers_count, comments: comments.filter(c => c.author && (c.username || '').toLowerCase() !== own) };
}

// Is this comment still there? (A deleted !join comment removes the name.)
export async function commentExists(token, id) {
  try { await get(`${id}?fields=id`, token); return true; }
  catch (e) { if (e.code === 100) return false; throw e; }
}
