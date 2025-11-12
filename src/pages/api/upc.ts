import type { NextApiRequest, NextApiResponse } from 'next';
import { firstMoneyUniversal, collectAllMoneyUniversal } from '../../lib/money';
import axios from 'axios';

function isUPCish(code: string) {
  return /^[0-9Xx\-]{8,14}$/.test(code.replace(/\s+/g, ''));
}

async function fetchText(url: string) {
  const r = await axios.get(url, { timeout: 15000, validateStatus: () => true });
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  return String(r.data || '');
}

async function googlePricesFor(code: string): Promise<number[]> {
  const q = `site:walmart.ca OR site:walmart.com OR site:indigo.ca OR site:ebay.ca OR site:ebay.com "${code}"`;
  const url = `https://r.jina.ai/http/www.google.com/search?q=${encodeURIComponent(q)}`;
  const text = await fetchText(url);
  const nums = collectAllMoneyUniversal(text).filter(n => n >= 0.5 && n <= 50000);
  return nums;
}

async function walmartSearch(code: string): Promise<number[]> {
  const url = `https://r.jina.ai/http/www.walmart.ca/search?q=${encodeURIComponent(code)}`;
  const text = await fetchText(url);
  return collectAllMoneyUniversal(text).filter(n => n >= 0.5 && n <= 50000);
}

async function ebaySearch(code: string): Promise<number[]> {
  const url = `https://r.jina.ai/http/www.ebay.ca/sch/i.html?_nkw=${encodeURIComponent(code)}`;
  const text = await fetchText(url);
  return collectAllMoneyUniversal(text).filter(n => n >= 0.5 && n <= 50000);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code } = (req.body || {}) as { code?: string };

  if (!code || !isUPCish(code)) return res.status(400).json({ error: 'Invalid or missing barcode' });

  try {
    const batches: number[][] = await Promise.allSettled([
      googlePricesFor(code),
      walmartSearch(code),
      ebaySearch(code),
    ]).then(all =>
      all.map(r => (r.status === 'fulfilled' ? r.value : []) as number[])
    );

    const all = batches.flat().sort((a, b) => a - b);
    const best = all[0];
    res.status(200).json({
      code,
      bestPrice: Number.isFinite(best) ? best : undefined,
      samplePrices: all.slice(0, 10),
      note: 'Heuristic prices from public pages; for reliable Amazon/eBay fees use official APIs.',
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Lookup failed', detail: e?.message || String(e) });
  }
}
