import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { load } from 'cheerio'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

async function tryUPCItemDB(upc: string) {
  // Free trial endpoint (rate/volume limited). You can remove this block if you don't want any external API.
  try {
    const r = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, { timeout: 12000 });
    if (r.data && r.data.code === 'OK' && Array.isArray(r.data.items) && r.data.items.length) {
      const it = r.data.items[0];
      // price fields may vary; pull min if available
      let lowestPrice: number | undefined;
      if (typeof it.lowest_recorded_price === 'number') lowestPrice = it.lowest_recorded_price;
      // some items include offers; skip here for simplicity
      return {
        title: it.title,
        brand: it.brand,
        lowestPrice,
        matches: [] as any[],
      };
    }
  } catch {}
  return null;
}

function num(text: string) {
  const n = (text || '').replace(/[^0-9.]/g, '');
  return n ? parseFloat(n) : NaN;
}

async function tryNeweggSearch(upc: string) {
  // Search Newegg with the UPC; parse first card
  try {
    const url = `https://www.newegg.com/p/pl?d=${encodeURIComponent(upc)}`;
    const html = (await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 })).data as string;
    const $ = load(html);
    let firstLink = $('a.item-title').first().attr('href');
    let priceText = $('.price-current').first().text().trim();
    let priceNum = num(priceText);
    const match = {
      source: 'Newegg',
      url: firstLink || url,
      price: Number.isFinite(priceNum) ? priceNum : undefined,
    };
    return match;
  } catch (e) {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { upc } = (req.body || {}) as { upc?: string };
    if (!upc) return res.status(400).json({ error: 'Missing UPC/EAN' });

    // 1) Try UPC database (trial)
    const upcDb = await tryUPCItemDB(upc);

    // 2) Try Newegg search scrape as a free fallback
    const ne = await tryNeweggSearch(upc);

    const matches: any[] = [];
    if (ne) matches.push(ne);

    const out = {
      title: upcDb?.title,
      brand: upcDb?.brand,
      lowestPrice: upcDb?.lowestPrice ?? (ne?.price ?? undefined),
      matches,
    };
    return res.status(200).json(out);
  } catch (err: any) {
    console.error('lookup error', err?.message || err);
    return res.status(500).json({ error: 'Lookup failed' });
  }
}
