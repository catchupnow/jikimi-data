// 개인정보 유출 뉴스 피드 생성기 (GitHub Actions에서 4시간마다 실행)
// 구글 뉴스 RSS에서 최근 14일 국내 유출·해킹 기사 제목과 링크만 모아 docs/news.json 으로 저장해요.
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const QUERIES = ['개인정보 유출', '해킹 고객정보 유출', '개인정보 유출 보상', '개인정보 유출 과징금'];
const KEEP = /(유출|해킹|침해|털려|털린|랜섬웨어)/;
const DROP = /(\[사설\]|\[칼럼\]|\[기고\]|\[포토\]|\[오피니언\]|광고|이벤트)/;
const MAX_ITEMS = 40;

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

function parse(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const get = (tag) => decode((m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || '');
    const source = get('source');
    let title = get('title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(` - ${source}`).length);
    const d = new Date(get('pubDate'));
    return { t: title, s: source, d: isNaN(d) ? null : d, u: get('link') };
  });
}

async function fetchQuery(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:14d`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (jikimi-news-bot)' } });
  if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
  return parse(await res.text());
}

const norm = (t) => t.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 22);
const kst = (d) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const all = [];
for (const q of QUERIES) {
  try { all.push(...(await fetchQuery(q))); } catch (e) { console.warn('skip', e.message); }
}
const seen = new Set();
const items = all
  .filter((x) => x.d && x.t && KEEP.test(x.t) && !DROP.test(x.t))
  .sort((a, b) => b.d - a.d)
  .filter((x) => { const k = norm(x.t); if (seen.has(k)) return false; seen.add(k); return true; })
  .slice(0, MAX_ITEMS)
  .map((x) => ({ t: x.t, s: x.s, d: kst(x.d), u: x.u }));

if (items.length < 3) {
  console.error('too few items, keep previous file', items.length);
  process.exit(0);
}

await mkdir('docs', { recursive: true });
const out = { updated: new Date().toISOString(), count: items.length, items };
let prev = '';
try { prev = await readFile('docs/news.json', 'utf8'); } catch (e) { /* first run */ }
const prevItems = prev ? JSON.stringify(JSON.parse(prev).items) : '';
if (prevItems === JSON.stringify(items)) { console.log('no change'); process.exit(0); }
await writeFile('docs/news.json', JSON.stringify(out, null, 1));
await writeFile('docs/index.html', '<!doctype html><meta charset="utf-8"><title>jikimi data</title><p>내정보 지킴이 뉴스 피드: <a href="news.json">news.json</a></p>');
console.log('wrote', items.length, 'items');
