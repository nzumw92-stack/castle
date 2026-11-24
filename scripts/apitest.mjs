// One-off check that both API keys work. Prints only counts and public IDs, never keys or comment text.
const YT = process.env.YT_API_KEY, IG = process.env.IG_TOKEN;
const out = (k, v) => console.log(k.padEnd(28), typeof v === 'string' ? v : JSON.stringify(v));
const get = async u => { const r = await fetch(u); const j = await r.json().catch(() => ({})); return j; };
const err = j => j.error ? 'ERROR ' + (j.error.message || JSON.stringify(j.error)).slice(0, 160) : null;

console.log('--- YouTube ---');
if (!YT) out('YT_API_KEY', 'missing');
else {
  const ch = await get(`https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&forHandle=@hardlydarkages&key=${YT}`);
  if (err(ch)) out('channels', err(ch));
  const c = ch.items?.[0];
  if (!c) out('channel', 'not found via @hardlydarkages');
  else {
    out('channel id', c.id); out('title', c.snippet.title);
    out('subscribers', c.statistics.subscriberCount ?? 'hidden'); out('videos', c.statistics.videoCount);
    const ct = await get(`https://www.googleapis.com/youtube/v3/commentThreads?part=id&allThreadsRelatedToChannelId=${c.id}&maxResults=100&key=${YT}`);
    out('comment threads (1st page)', err(ct) || String(ct.items?.length ?? 0));
  }
}

console.log('--- Instagram ---');
if (!IG) out('IG_TOKEN', 'missing');
else {
  const G = 'https://graph.facebook.com/v21.0';
  const me = await get(`${G}/me?fields=id,name&access_token=${IG}`);
  out('token owner', err(me) || me.name);
  let igId = null;
  const dbg = await get(`${G}/debug_token?input_token=${IG}&access_token=${IG}`);
  if (err(dbg)) out('debug_token', err(dbg));
  else { const d = dbg.data || {}; out('token type', d.type); out('expires', String(d.expires_at)); out('scopes', (d.scopes||[]).join(' '));
    for (const g of d.granular_scopes || []) { out('  ' + g.scope, (g.target_ids||['all']).join(',')); if (g.scope === 'instagram_basic' && g.target_ids) igId ||= g.target_ids[0]; } }
  const gi = await get(`https://graph.instagram.com/v21.0/me?fields=user_id,username,followers_count&access_token=${IG}`);
  out('graph.instagram.com/me', err(gi) || `${gi.username}:${gi.user_id} followers ${gi.followers_count}`);
  for (const [label, url] of [
    ['business instagram_accounts', `${G}/1499167815609601/instagram_accounts?fields=id,username&access_token=${IG}`],
    ['business owned_instagram', `${G}/1499167815609601/owned_instagram_accounts?fields=id,username&access_token=${IG}`],
    ['me/accounts (pages)', `${G}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${IG}`],
  ]) {
    const j = await get(url);
    if (err(j)) { out(label, err(j)); continue; }
    const list = (j.data || []).map(x => x.instagram_business_account || x).filter(x => x.id);
    out(label, list.map(x => `${x.username || '?'}:${x.id}`).join(', ') || 'empty');
    igId ||= list[0]?.id;
  }
  for (const id of [igId, '1419360504600633'].filter(Boolean)) {
    const u = await get(`${G}/${id}?fields=id,username,followers_count,media_count&access_token=${IG}`);
    if (err(u)) { out(`account ${id}`, err(u)); continue; }
    out('ig user id', u.id); out('username', u.username); out('followers', String(u.followers_count)); out('posts', String(u.media_count));
    const m = await get(`${G}/${u.id}/media?fields=id,comments_count&limit=50&access_token=${IG}`);
    if (err(m)) { out('media', err(m)); break; }
    out('recent posts', String(m.data.length));
    const withC = m.data.find(x => x.comments_count > 0);
    if (withC) { const c = await get(`${G}/${withC.id}/comments?fields=id,timestamp&access_token=${IG}`); out('comments readable', err(c) || `yes (${c.data.length} on one post)`); }
    else out('comments readable', 'no post with comments to test');
    break;
  }
}
