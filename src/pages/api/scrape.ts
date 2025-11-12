import type { NextApiRequest, NextApiResponse } from 'next';
import LRU from 'lru-cache';
import axios from 'axios';
import { load } from 'cheerio';

import { fetchHTML, hostnameFrom, absUrl } from '../../lib/html';
import { firstMoneyUniversal } from '../../lib/money';
import { findScraper } from '../../scrapers/index';

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

const cache = new LRU<string, any>({ max: 200, ttl: 1000 * 60 * 10 });

async function googleBookOutletPriceByISBN(isbn: string): Promise<number | undefined> {
  try {
    const q = `site:bookoutlet.ca ${isbn}`;
    const url = `https://r.jina.ai/http/www.google.com/search?q=${encodeURIComponent(q)}`;
    const html = await axios.get(url, { timeout: 12000 }).then((r) => r.data as string);
    const $ = load(html);
    let best: number | undefined;
    $('body *').each((_, el) => {
      const n = firstMoneyUniversal($(el).text());
      if (Number.isFinite(n)) best = best === undefined || (n as number) < best ? n : best;
    });
    return best;
  } catch {
    return undefined;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, cost = 0, feesPct = 0, shipping = 0, other = 0, manualPrice } =
    (req.body || {}) as { url?: string; cost?: number; feesPct?: number; shipping?: number; other?: number; manualPrice?: number | string; };

  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const host = hostnameFrom(url) || '';
  const cacheKey = `${host}|${url}|c=${cost}|f=${feesPct}|s=${shipping}|o=${other}|m=${manualPrice ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const avoidJina = /bookoutlet\.ca$/i.test(host);
    const html = await limitByHost(host, () => fetchHTML(url, avoidJina));

    const scraper = findScraper(url);
    const result = scraper.scrape(html, url);
    let { title, image, priceNum, isbn, source } = result as {
      title?: string; image?: string; priceNum?: number; isbn?: string; source?: string;
    };

    if (image && !/^https?:\/\//i.test(image)) image = absUrl(url, image);

    if (/bookoutlet\.ca$/i.test(host) && !Number.isFinite(priceNum as number) && isbn) {
      const g = await googleBookOutletPriceByISBN(isbn);
      if (Number.isFinite(g as number)) priceNum = g;
    }

    const manualNum =
      typeof manualPrice === 'number' ? manualPrice : firstMoneyUniversal(String(manualPrice ?? ''));
    if (!Number.isFinite(priceNum as number) && Number.isFinite(manualNum)) priceNum = manualNum;

    const displayPrice = Number.isFinite(priceNum as number) ? `$${Number(priceNum).toFixed(2)}` : 'N/A';

    let netProfit: number | undefined;
    let marginPct: number | undefined;
    let score = 0;
    if (Number.isFinite(priceNum as number) && (priceNum as number) > 0) {
      const feesDollar = (Number(feesPct) / 100) * (priceNum as number);
      netProfit = (priceNum as number) - (Number(cost) + feesDollar + Number(shipping) + Number(other));
      marginPct = (netProfit / (priceNum as number)) * 100;
      score = Math.max(0, Math.min(100, Math.round(marginPct)));
    }

    const payload = {
      title: title || 'No title found',
      price: displayPrice,
      priceNum: Number.isFinite(priceNum as number) ? Number(priceNum) : undefined,
      profitScore: score,
      score,
      netProfit,
      marginPct,
      image,
      site: host,
      isbn,
      source: source || 'generic',
    };

    cache.set(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('scrape error:', err?.message || err);
    return res.status(500).json({ error: 'Parse failed', detail: err?.message || String(err) });
  }
}
