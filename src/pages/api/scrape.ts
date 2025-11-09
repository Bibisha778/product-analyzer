import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { load, CheerioAPI } from 'cheerio'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';

function hostnameFrom(url: string) {
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return undefined; }
}
function absUrl(base: string, maybeRel?: string) {
  try { if (!maybeRel) return undefined; return new URL(maybeRel, new URL(base)).toString(); } catch { return undefined; }
}

async function fetchHTML(url: string, avoidJina = false) {
  // direct
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 15000 });
    return r.data as string;
  } catch {}
  // allorigins
  try {
    const r2 = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    return r2.data as string;
  } catch {}
  // jina reader (skip for bookoutlet if requested)
  if (!avoidJina) {
    const proxied = `https://r.jina.ai/http://${url.replace(/^https?:\/\//,'')}`;
    const r3 = await axios.get(proxied, { timeout: 15000 });
    return r3.data as string;
  }
  throw new Error('All fetch strategies failed');
}

function firstMoney(text: string) {
  const m = (text || '').match(/(?:CAD|\$)\s*([0-9]{1,4}(?:[.,][0-9]{2})?)/i);
  if (!m) return NaN;
  return parseFloat(m[1].replace(',', '.'));
}
function collectAllMoney(text: string): number[] {
  const out: number[] = [];
  const re = /(?:CAD|\$)\s*([0-9]{1,4}(?:[.,][0-9]{2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const val = parseFloat((m[1] || '').replace(',', '.'));
    if (Number.isFinite(val)) out.push(val);
  }
  return out;
}
function findISBNInText(text: string) {
  const t = text.replace(/\s+/g, ' ');
  const m13 = t.match(/\b97[89]\d{10}\b/); if (m13) return m13[0];
  const m10 = t.match(/\b\d{9}[\dX]\b/);   if (m10) return m10[0];
  return undefined;
}
function readJSONLDPrice($: CheerioAPI): number | undefined {
  try {
    const scripts = Array.from($('script[type="application/ld+json"]')).map(s => $(s).text());
    for (const raw of scripts) {
      try {
        const json = JSON.parse(raw);
        const arr = Array.isArray(json) ? json : [json];
        for (const n of arr) {
          const offers = n?.offers || (Array.isArray(n?.offers) ? n.offers[0] : undefined);
          const p = offers?.price ?? offers?.lowPrice ?? n?.price;
          if (typeof p === 'number') return p;
          if (typeof p === 'string') {
            const num = firstMoney(p);
            if (Number.isFinite(num)) return num;
          }
        }
      } catch {}
    }
  } catch {}
  return undefined;
}
function metaPrice($: CheerioAPI): number | undefined {
  const candidates = [
    $('meta[property="product:price:amount"]').attr('content'),
    $('meta[property="og:price:amount"]').attr('content'),
    $('meta[itemprop="price"]').attr('content'),
    $('[itemprop="price"]').attr('content'),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const n = parseFloat(c.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function bestGuessPriceFromPage($: CheerioAPI): number | undefined {
  const priceish = $([
    '*[class*=price]',
    '.price',
    '.product-price',
    '.price-current',
    '.product__price',
    '.current-price',
    '.sale-price',
    '.our-price',
    'div:contains("Our Price")',
    'div:contains("Price")',
    'div:contains("List price")',
  ].join(',')).first().text().trim();
  const quick = firstMoney(priceish);
  if (Number.isFinite(quick)) return quick;
  const all = collectAllMoney($.text());
  const plausible = all.filter(n => n >= 1 && n <= 1000).sort((a,b)=>a-b);
  return plausible[0];
}

/** NEW: Google fallback for BookOutlet using ISBN and r.jina.ai (free) */
async function googleBookOutletPriceByISBN(isbn: string): Promise<number | undefined> {
  try {
    const q = `site:bookoutlet.ca ${isbn}`;
    const url = `https://r.jina.ai/http/www.google.com/search?q=${encodeURIComponent(q)}`;
    const html = await axios.get(url, { timeout: 12000 }).then(r => r.data as string);
    const $ = load(html);
    // Look through snippets around result cards
    let best: number | undefined;
    $('body *').each((_, el) => {
      const t = $(el).text();
      const n = firstMoney(t);
      if (Number.isFinite(n)) {
        if (best === undefined || (n as number) < best) best = n;
      }
    });
    return best;
  } catch {
    return undefined;
  }
}

function bookOutletExtract($: CheerioAPI, url: string) {
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().trim() ||
    'No title found';
  const rawImg =
    $('meta[property="og:image"]').attr('content') ||
    $('img[src]').first().attr('src') || undefined;
  const image = absUrl(url, rawImg);

  let priceNum =
    metaPrice($) ??
    readJSONLDPrice($) ??
    bestGuessPriceFromPage($);

  let isbn =
    $('*').filter((_, el) => /ISBN/i.test($(el).text())).first().text()
      .replace(/.*ISBN[:\s]*/i, '').trim() || undefined;
  if (!isbn) isbn = findISBNInText($.text());

  return { title, image, priceNum, isbn };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url, cost = 0, feesPct = 0, shipping = 0, other = 0, manualPrice } =
      (req.body || {}) as { url?: string; cost?: number; feesPct?: number; shipping?: number; other?: number; manualPrice?: number };

    if (!url) return res.status(400).json({ error: 'Missing URL' });

    const host = hostnameFrom(url) || '';
    const avoidJina = /bookoutlet\.ca$/i.test(host); // keep scripts/ld+json

    const html = await fetchHTML(url, avoidJina);
    if (!html || typeof html !== 'string') {
      return res.status(502).json({ error: 'Empty response from target (or proxy)' });
    }

    const $ = load(html);

    let title = '';
    let image: string | undefined;
    let priceNum: number | undefined;
    let isbn: string | undefined;

    if (/bookoutlet\.ca$/i.test(host)) {
      const out = bookOutletExtract($, url);
      title = out.title;
      image = out.image;
      priceNum = out.priceNum;
      isbn = out.isbn;

      // 🔁 NEW: If price missing but we have ISBN, try Google snippet fallback
      if (!Number.isFinite(priceNum as number) && isbn) {
        const g = await googleBookOutletPriceByISBN(isbn);
        if (Number.isFinite(g as number)) priceNum = g;
      }
    } else {
      // generic
      title =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('meta[name="twitter:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim() ||
        $('title').text().trim() || 'No title found';

      const rawImg =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('img[src]').first().attr('src') || undefined;
      image = absUrl(url, rawImg);

      priceNum =
        metaPrice($) ??
        readJSONLDPrice($) ??
        firstMoney(
          $('.price_color').first().text() ||
          $('.price-current').first().text() ||
          $('span.price, .price, [data-testid=price], .price-current strong').first().text()
        ) ??
        bestGuessPriceFromPage($);

      isbn = findISBNInText($.text());
    }

    // Manual override
    const manualNum = typeof manualPrice === 'number' ? manualPrice : firstMoney(String(manualPrice || ''));
    if (!Number.isFinite(priceNum as number) && Number.isFinite(manualNum)) priceNum = manualNum;

    const displayPrice = Number.isFinite(priceNum as number) ? `$${(priceNum as number).toFixed(2)}` : 'N/A';

    // Profit math
    let netProfit: number | undefined;
    let marginPct: number | undefined;
    let score = 0;
    if (Number.isFinite(priceNum as number) && (priceNum as number) > 0) {
      const feesDollar = (Number(feesPct) / 100) * (priceNum as number);
      netProfit = (priceNum as number) - (Number(cost) + feesDollar + Number(shipping) + Number(other));
      marginPct = (netProfit / (priceNum as number)) * 100;
      score = Math.max(0, Math.min(100, Math.round(marginPct)));
    }

    return res.status(200).json({
      title, price: displayPrice, score, netProfit, marginPct,
      image, site: host, isbn,
      usedManualPrice: !Number.isFinite(priceNum as number) && Number.isFinite(manualNum) ? true : undefined,
      sourceHint: /bookoutlet\.ca$/i.test(host) ? (Number.isFinite(priceNum as number) ? 'bookoutlet-page' : (isbn ? 'google-fallback' : 'unknown')) : 'generic'
    });
  } catch (err: any) {
    console.error('API error:', err?.message || err);
    return res.status(500).json({ error: 'Parse failed', detail: err?.message || String(err) });
  }
}