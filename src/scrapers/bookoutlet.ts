import { load, CheerioAPI } from 'cheerio';
import { firstMoneyUniversal, collectAllMoneyUniversal } from '../lib/money';
import { absUrl } from '../lib/html';

export function match(url: string) {
  return /bookoutlet\.ca$/i.test(new URL(url).hostname.replace(/^www\./,''));
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
    const n = firstMoneyUniversal(c);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function bestGuessPriceFromPage($: CheerioAPI): number | undefined {
  const priceish = $([
    '.product__price','.current-price','.sale-price','.price','.price_color',
    'div:contains("Our Price")','div:contains("Price")'
  ].join(',')).first().text().trim();
  const quick = firstMoneyUniversal(priceish);
  if (Number.isFinite(quick)) return quick;

  const all = collectAllMoneyUniversal($.text());
  const plausible = all.filter(n => n >= 0.5 && n <= 1000).sort((a,b)=>a-b);
  return plausible[0];
}

export function scrape(html: string, url: string) {
  const $ = load(html);
  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().trim() || 'No title found';

  const rawImg =
    $('meta[property="og:image"]').attr('content') ||
    $('img[src]').first().attr('src');
  const image = absUrl(url, rawImg);

  let priceNum =
    metaPrice($) ??
    readJSONLDPrice($) ??
    bestGuessPriceFromPage($);

  let isbn =
    $('*').filter((_, el) => /ISBN/i.test($(el).text())).first().text()
      .replace(/.*ISBN[:\s]*/i, '').trim() || undefined;

  if (!isbn) {
    const t = $.text().replace(/\s+/g,' ');
    const m13 = t.match(/\b97[89]\d{10}\b/);
    const m10 = t.match(/\b\d{9}[\dX]\b/);
    isbn = m13 ? m13[0] : (m10 ? m10[0] : undefined);
  }

  return { title, image, priceNum, isbn, source: 'bookoutlet' };
}
