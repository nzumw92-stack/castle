// YouTube Data API v3 with a plain API key: subscriber count and all comments on the channel.
const API = 'https://www.googleapis.com/youtube/v3/';

async function get(path, params, key) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries({ ...params, key })) u.searchParams.set(k, v);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`YouTube ${path}: ${r.status} ${j.error?.message || ''}`.trim());
  return j;
}

const pick = (c, parentId) => ({
  id: c.id,
  author: c.snippet.authorChannelId?.value || null,
  text: c.snippet.textOriginal ?? c.snippet.textDisplay ?? '',
  t: c.snippet.publishedAt,
  parentId,
});

export async function fetchYouTube({ key, channelId, maxPages = 10 }) {
  const ch = await get('channels', { part: 'statistics', id: channelId }, key);
  const st = ch.items?.[0]?.statistics;
  if (!st) throw new Error('YouTube channel not found');
  const subs = st.hiddenSubscriberCount ? null : Number(st.subscriberCount);

  const comments = [];
  let pageToken = '';
  for (let p = 0; p < maxPages; p++) {
    const j = await get('commentThreads', { part: 'snippet,replies', allThreadsRelatedToChannelId: channelId, maxResults: 100, order: 'time', textFormat: 'plainText', ...(pageToken && { pageToken }) }, key);
    for (const th of j.items || []) {
      const top = th.snippet.topLevelComment;
      comments.push(pick(top, null));
      const inline = th.replies?.comments || [];
      if (th.snippet.totalReplyCount > inline.length) {
        let rt = '';
        do {
          const r = await get('comments', { part: 'snippet', parentId: top.id, maxResults: 100, textFormat: 'plainText', ...(rt && { pageToken: rt }) }, key);
          for (const c of r.items || []) comments.push(pick(c, top.id));
          rt = r.nextPageToken || '';
        } while (rt);
      } else for (const c of inline) comments.push(pick(c, top.id));
    }
    pageToken = j.nextPageToken || '';
    if (!pageToken) break;
  }
  // the channel's own comments never count
  return { subs, comments: comments.filter(c => c.author && c.author !== channelId) };
}
