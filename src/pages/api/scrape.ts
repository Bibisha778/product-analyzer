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

/** Fetch HTML with tiered strategy. For BookOutlet we avoid Jina unless last resort. */
async function fetchHTML(url: string, avoidJina = false) {
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 15000 });
    return r.data as string;
  } catch {}
  try {
    const r2 = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    return r2.data as string;
  } catch {}
  if (!avoidJina) {
    const proxied = `https://r.jina.ai/http://${url.replace(/^https?:\/\//,'')}`;
    const r3 = await axios.get(proxied, { timeout: 15000 });
    return r3.data as string;
  }
  throw new Error('All fetch strategies failed');
}

/** -------- Universal money parsing (supports £, $, €, USD, CAD, GBP, EUR) -------- */
function parseNumberLike(s: string): number {
  // remove currency symbols/letters, keep digits , .
  const cleaned = (s || '').replace(/[^\d.,-]/g, '');
  // if both , and . exist, assume comma is thousands and dot is decimal
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  // if only comma exists and looks like decimal (e.g., 12,34)
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) {
      return parseFloat(cleaned.replace(',', '.'));
    }
    // otherwise treat comma as thousands sep
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  return parseFloat(cleaned);
}

function firstMoneyUniversal(text: string) {
  // match symbol or currency code optionally, capture the numeric chunk
  const re = /(USD|CAD|GBP|EUR|\$|£|€)?\s*([0-9][0-9.,-]{0,10})/i;
  const m = (text || '').match(re);
  if (!m) return NaN;
  return parseNumberLike(m[2]);
}

function collectAllMoneyUniversal(text: string): number[] {
  const out: number[] = [];
  const re = /(USD|CAD|GBP|EUR|\$|£|€)?\s*([0-9][0-9.,-]{0,10})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || '')) !== null) {
    const val = parseNumberLike(m[2] || '');
    if (Number.isFinite(val)) out.push(val);
  }
  return out;
}
/** ------------------------------------------------------------------------------- */

function findISBNInText(text: string) {
  const t = (text || '').replace(/\s+/g, ' ');
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
            const num = firstMoneyUniversal(p);
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
    const n = parseNumberLike(c);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function bestGuessPriceFromPage($: CheerioAPI): number | undefined {
  // Common price containers (incl. BooksToScrape & Newegg)
  const priceish = $([
    '.price_color',                   // BooksToScrape (e.g., £51.77)
    '.price-current',                 // Newegg container
    '.price-current *',               // include <strong> and <sup>
    '.product-price',
    '.current-price',
    '.sale-price',
    '.our-price',
    '.price',
    'div:contains("Price")',
    'div:contains("List price")',
  ].join(',')).first().text().trim();

  const quick = firstMoneyUniversal(priceish);
  if (Number.isFinite(quick)) return quick;

  // Fallback: scan entire page text and pick lowest plausible (discounted sites)
  const all = collectAllMoneyUniversal($.text());
  const plausible = all.filter(n => n >= 0.5 && n <= 50000).sort((a,b)=>a-b); // wide bounds
  return plausible[0];
}

/** ---------- BookOutlet extract (kept) ---------- */
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
/** ---------------------------------------------- */

/** Optional: Google fallback for BookOutlet by ISBN (kept) */
import type {} from 'next' // keep TS happy if treeshakes
async function googleBookOutletPriceByISBN(isbn: string): Promise<number | undefined> {
  try {
    const q = `site:bookoutlet.ca ${isbn}`;
    const url = `https://r.jina.ai/http/www.google.com/search?q=${encodeURIComponent(q)}`;
    const html = await axios.get(url, { timeout: 12000 }).then(r => r.data as string);
    const $ = load(html);
    let best: number | undefined;
    $('body *').each((_, el) => {
      const t = $(el).text();
      const n = firstMoneyUniversal(t);
      if (Number.isFinite(n)) {
        if (best === undefined || (n as number) < best) best = n;
      }
    });
    return best;
  } catch {
    return undefined;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url, cost = 0, feesPct = 0, shipping = 0, other = 0, manualPrice } =
      (req.body || {}) as { url?: string; cost?: number; feesPct?: number; shipping?: number; other?: number; manualPrice?: number };

    if (!url) return res.status(400).json({ error: 'Missing URL' });

    const host = hostnameFrom(url) || '';
    const avoidJina = /bookoutlet\.ca$/i.test(host);

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
      title = out.title; image = out.image; priceNum = out.priceNum; isbn = out.isbn;
      if (!Number.isFinite(priceNum as number) && isbn) {
        const g = await googleBookOutletPriceByISBN(isbn);
        if (Number.isFinite(g as number)) priceNum = g;
      }
    } else {
      // ---------- Generic extraction (improved for Newegg & BooksToScrape) ----------
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

      // Try meta/JSON-LD first
      priceNum =
        metaPrice($) ??
        readJSONLDPrice($);

      // Newegg often splits price (e.g., <strong>149</strong><sup>.99</sup>)
      if (!Number.isFinite(priceNum as number)) {
        const neText = $('.price-current, .price-current *').first().text().trim();
        const neNum = firstMoneyUniversal(neText);
        if (Number.isFinite(neNum)) priceNum = neNum;
      }

      // BooksToScrape
      if (!Number.isFinite(priceNum as number)) {
        const btsText = $('.price_color').first().text().trim(); // e.g., "£51.77"
        const btsNum = firstMoneyUniversal(btsText);
        if (Number.isFinite(btsNum)) priceNum = btsNum;
      }

      // Generic last resort
      if (!Number.isFinite(priceNum as number)) {
        priceNum = bestGuessPriceFromPage($);
      }

      // ISBN fallback for any other book site
      isbn = findISBNInText($.text());
    }

    // Manual override
    const manualNum = typeof manualPrice === 'number'
      ? manualPrice
      : firstMoneyUniversal(String(manualPrice || ''));
    if (!Number.isFinite(priceNum as number) && Number.isFinite(manualNum)) priceNum = manualNum;

    const displayPrice = Number.isFinite(priceNum as number)
      ? `$${(priceNum as number).toFixed(2)}`
      : 'N/A';

    // Profit math (unchanged)
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
    });
  } catch (err: any) {
    console.error('API error:', err?.message || err);
    return res.status(500).json({ error: 'Parse failed', detail: err?.message || String(err) });
  }
}