import axios from 'axios';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';

function hostnameOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; }
}

// Some domains hide price in JS; Jina reader often exposes text better.
function preferJinaFirst(host: string) {
  return /^(walmart\.com|walmart\.ca|indigo\.ca|newegg\.com|ebay\.)/i.test(host);
}

async function tryDirect(url: string) {
  const r = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  return r.data as string;
}

async function tryAllOrigins(url: string) {
  const r = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { timeout: 15000, validateStatus: () => true });
  if (r.status >= 400) throw new Error(`AO ${r.status}`);
  return r.data as string;
}

async function tryJina(url: string) {
  const proxied = `https://r.jina.ai/http/${url.replace(/^https?:\/\//,'')}`;
  const r = await axios.get(proxied, { timeout: 15000, validateStatus: () => true });
  if (r.status >= 400) throw new Error(`JINA ${r.status}`);
  return r.data as string;
}

async function withRetry<T>(fn: ()=>Promise<T>, attempts=2, pauseMs=400): Promise<T> {
  let lastErr: any;
  for (let i=0;i<attempts;i++){
    try { return await fn(); } catch (e) { lastErr = e; if (i<attempts-1) await new Promise(r=>setTimeout(r,pauseMs)); }
  }
  throw lastErr;
}

export async function fetchHTML(url: string, avoidJina=false) {
  const host = hostnameOf(url);
  const useJinaFirst = !avoidJina && preferJinaFirst(host);

  // Strategy order: (Jina first for heavy sites) else Direct → AllOrigins → Jina
  const strategies: Array<() => Promise<string>> = useJinaFirst
    ? [() => withRetry(()=>tryJina(url)), () => withRetry(()=>tryDirect(url)), () => withRetry(()=>tryAllOrigins(url))]
    : [() => withRetry(()=>tryDirect(url)), () => withRetry(()=>tryAllOrigins(url)), () => (!avoidJina ? withRetry(()=>tryJina(url)) : Promise.reject('skip jina'))];

  let lastErr: any;
  for (const s of strategies) {
    try { return await s(); } catch(e) { lastErr = e; }
  }
  throw lastErr ?? new Error('All fetch strategies failed');
}

export function hostnameFrom(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return undefined; }
}

export function absUrl(base: string, maybeRel?: string) {
  try { if (!maybeRel) return undefined; return new URL(maybeRel, new URL(base)).toString(); } catch { return undefined; }
}
