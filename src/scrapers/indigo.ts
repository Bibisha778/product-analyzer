import { load } from 'cheerio';
import { firstMoneyUniversal } from '../lib/money';
import { absUrl } from '../lib/html';

export function match(url: string) {
  const h = new URL(url).hostname.replace(/^www\./,'');
  return /(^|\.)indigo\.ca$/i.test(h);
}

export function scrape(html: string, url: string) {
  const $ = load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim() || 'No title found';

  const rawImg =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    $('img[src]').first().attr('src');
  const image = absUrl(url, rawImg);

  const metaPrice =
    $('meta[itemprop=price]').attr('content') ||
    $('[itemprop=price]').attr('content') ||
    $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content');

  let priceNum = firstMoneyUniversal(String(metaPrice || ''));
  if (!Number.isFinite(priceNum)) {
    const visiblePrice =
      $('.price, .product__price, .price__value, .product-price, .price-current, [data-testid*=price]')
        .first().text().trim() ||
      $('*:contains("Price")').first().text().trim();
    priceNum = firstMoneyUniversal(String(visiblePrice || ''));
  }

  const text = $.text().replace(/\s+/g,' ');
  const m13 = text.match(/\b97[89]\d{10}\b/);
  const m10 = text.match(/\b\d{9}[\dX]\b/);
  const isbn = m13 ? m13[0] : (m10 ? m10[0] : undefined);

  return { title, image, priceNum, isbn, source: 'indigo' };
}
