// Diagnose: does a given commenter show up via the channel-wide query or per video? Prints only counts and yes/no.
const KEY = process.env.YT_API_KEY, CH = 'UCADrxi5hgPgvbiYQM_nCAIA', WHO = (process.env.WHO || '').toLowerCase();
const get = async (p, q) => { const u = new URL('https://www.googleapis.com/youtube/v3/' + p); for (const [k, v] of Object.entries({ ...q, key: KEY })) u.searchParams.set(k, v); const j = await (await fetch(u)).json(); if (j.error) throw new Error(p + ': ' + j.error.message); return j; };
const isWho = c => (c.snippet.authorDisplayName || '').toLowerCase().replace(/^@/, '') === WHO;

const all = await get('commentThreads', { part: 'snippet', allThreadsRelatedToChannelId: CH, maxResults: 100, order: 'time' });
const newest = all.items.map(t => t.snippet.topLevelComment.snippet.publishedAt).sort().pop();
console.log('channel-wide threads:', all.items.length, 'newest:', newest, 'test account found:', all.items.some(t => isWho(t.snippet.topLevelComment)));

const up = await get('playlistItems', { part: 'contentDetails', playlistId: 'UU' + CH.slice(2), maxResults: 50 });
let total = 0, found = 0, disabled = 0;
for (const it of up.items) {
  try {
    const j = await get('commentThreads', { part: 'snippet', videoId: it.contentDetails.videoId, maxResults: 100 });
    total += j.items.length;
    if (j.items.some(t => isWho(t.snippet.topLevelComment))) found++;
  } catch { disabled++; }
}
console.log('per-video: videos', up.items.length, 'threads', total, 'videos with test comment', found, 'videos with comments off', disabled);
