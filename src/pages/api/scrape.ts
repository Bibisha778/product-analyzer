import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { load } from 'cheerio'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

function hostnameFrom(url: string) {
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return undefined; }
}

async function fetchHTML(url: string) {
  // direct
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 });
    return r.data as string;
  } catch {}
  // AllOrigins
  try {
    const r2 = await axios.get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    return r2.data as string;
  } catch {}
  // Jina reader
  const proxied = `https://r.jina.ai/http://${url.replace(/^https?:\/\//,'')}`;
  const r3 = await axios.get(proxied, { timeout: 15000 });
  return r3.data as string;
}

function num(text: string) {
  const n = (text || '').replace(/[^0-9.]/g, '');
  return n ? parseFloat(n) : NaN;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url, cost = 0, feesPct = 0, shipping = 0, other = 0 } =
      (req.body || {}) as { url?: string; cost?: number; feesPct?: number; shipping?: number; other?: number };

    if (!url) return res.status(400).json({ error: 'Missing URL' });

    const html = await fetchHTML(url);
    if (!html || typeof html !== 'string') {
      return res.status(502).json({ error: 'Empty response from target (or proxy)' });
    }

    const $ = load(html);

    // Title
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('meta[name="twitter:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      'No title found';

    // Image
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('img').first().attr('src') ||
      undefined;

    // Price
    let priceText =
      $('meta[itemprop=price]').attr('content') ||
      $('[itemprop=price]').attr('content') ||
      $('span.price, .price, [data-testid=price], .price_color, .price-current').first().text() ||
      '';

    const priceNum = num(priceText);
    const displayPrice = Number.isFinite(priceNum) ? `$${priceNum.toFixed(2)}` : 'N/A';

    // Profit math
    let netProfit = 0;
    let marginPct = 0;
    let score = 0;

    if (Number.isFinite(priceNum) && priceNum > 0) {
      const feesDollar = (Number(feesPct) / 100) * priceNum;
      netProfit = priceNum - (Number(cost) + feesDollar + Number(shipping) + Number(other));
      marginPct = (netProfit / priceNum) * 100;
      score = Math.max(0, Math.min(100, Math.round(marginPct)));
    }

    return res.status(200).json({
      title,
      price: displayPrice,
      score,
      netProfit: Number.isFinite(netProfit) ? netProfit : undefined,
      marginPct: Number.isFinite(marginPct) ? marginPct : undefined,
      image,
      site: hostnameFrom(url),
    });
  } catch (err: any) {
    console.error('API error:', err?.message || err);
    return res.status(500).json({ error: 'Parse failed', detail: err?.message || String(err) });
  }
}
