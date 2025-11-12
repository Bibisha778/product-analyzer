import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { load } from 'cheerio';
import { fetchHTML, hostnameFrom, absUrl } from '../../lib/html';
import { firstMoneyUniversal } from '../../lib/money';
import { findScraper } from '../../scrapers/index';

// --- simple TTL cache (no external deps) ---
type CacheEntry = { value: any; expires: number };
const cache = new Map<string, CacheEntry>();
function cacheGet<T = any>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) { cache.delete(key); return undefined; }
  return hit.value as T;
}
function cacheSet(key: string, value: any, ttlMs = 10 * 60 * 1000) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

// --- gentle per-host rate limit ---
const MIN_GAP_MS = 600;
const lastCallByHost = new Map<string, number>();
async function limitByHost<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const last = lastCallByHost.get(host) ?? 0;
  const wait = Math.max(0, MIN_GAP_MS - (now - last));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const res = await fn();
  lastCallByHost.set(host, Date.now());
  return res;
}

// --- helper for BookOutlet fallback by ISBN (via readable proxy) ---
async function googleBookOutletPriceByISBN(isbn: string): Promise<number | undefined> {
  try {
    const q = `site:bookoutlet.ca ${isbn}`;
    const url = `https://r.jina.ai/http/www.google.com/search?q=${encodeURIComponent(q)}`;
    const html = await axios.get(url, { timeout: 12000 }).then(r => r.data as string);
    const $ = load(html);
    let best: number | undefined;
    $('body *').each((_, el) => {
      const n = firstMoneyUniversal($(el).text());
      if (Number.isFinite(n)) best = best === undefined || (n as number) < best! ? n : best;
    });
    return best;
  } catch {
    return undefined;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, manualPrice } = (req.body || {}) as {
    url?: string;
    manualPrice?: number | string;
  };
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const host = hostnameFrom(url) || '';
  const cacheKey = `v2|${url}|${manualPrice ?? ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const avoidJina = /bookoutlet\.ca$/i.test(host);
    const html = await limitByHost(host, () => fetchHTML(url, avoidJina));

    const scraper = findScraper(url);
    const result = scraper.scrape(html, url);

    let { title, image, priceNum, isbn, source } = result as {
      title?: string;
      image?: string;
      priceNum?: number;
      isbn?: string;
      source?: string;
    };

    if (image && !/^https?:\/\//i.test(image)) image = absUrl(url, image);

    if (/bookoutlet\.ca$/i.test(host) && !Number.isFinite(priceNum as number) && isbn) {
      const g = await googleBookOutletPriceByISBN(isbn);
      if (Number.isFinite(g as number)) priceNum = g;
    }

    const manualNum =
      typeof manualPrice === 'number'
        ? manualPrice
        : firstMoneyUniversal(String(manualPrice ?? ''));
    if (!Number.isFinite(priceNum as number) && Number.isFinite(manualNum)) priceNum = Number(manualNum);

    const payload = {
      title: title || 'No title found',
      price: Number.isFinite(priceNum as number) ? `$${Number(priceNum).toFixed(2)}` : 'N/A',
      priceNum: Number.isFinite(priceNum as number) ? Number(priceNum) : undefined,
      profitScore: undefined,
      score: undefined,
      netProfit: undefined,
      marginPct: undefined,
      image,
      site: host,
      isbn,
      source: source || 'generic',
      originalUrl: url,
    };

    cacheSet(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('scrape error:', err?.message || err);
    return res.status(500).json({ error: 'Parse failed', detail: err?.message || String(err) });
  }
}
