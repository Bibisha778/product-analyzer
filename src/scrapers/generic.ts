import { load, CheerioAPI } from 'cheerio';
import { firstMoneyUniversal, collectAllMoneyUniversal } from '../lib/money';

export function match() { return true; }

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
    const n = firstMoneyUniversal(c);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function bestGuessPriceFromPage($: CheerioAPI): number | undefined {
  const priceish = $([
    '.price_color','.price-current','.product-price','.current-price','.sale-price','.our-price','.price',
    'div:contains("Price")','div:contains("List price")'
  ].join(',')).first().text().trim();

  const quick = firstMoneyUniversal(priceish);
  if (Number.isFinite(quick)) return quick;

  const all = collectAllMoneyUniversal($.text());
  const plausible = all.filter(n => n >= 0.5 && n <= 50000).sort((a,b)=>a-b);
  return plausible[0];
}

export function scrape(html: string, _url: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim() || 'No title found';

  const image =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    $('img[src]').first().attr('src') || undefined;

  const priceNum = metaPrice($) ?? readJSONLDPrice($) ?? bestGuessPriceFromPage($);

  const text = $.text().replace(/\s+/g,' ');
  const m13 = text.match(/\b97[89]\d{10}\b/);
  const m10 = text.match(/\b\d{9}[\dX]\b/);
  const isbn = m13 ? m13[0] : (m10 ? m10[0] : undefined);

  return { title, image, priceNum, isbn, source: 'generic' };
}
