import { load } from 'cheerio';
import { firstMoneyUniversal } from '../lib/money';
import { absUrl } from '../lib/html';

export function match(url: string) {
  const h = new URL(url).hostname.replace(/^www\./,'');
  return /walmart\.(com|ca)$/i.test(h);
}

export function scrape(html: string, url: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim() || 'No title found';

  const rawImg =
    $('meta[property="og:image"]').attr('content') ||
    $('img[src]').first().attr('src');
  const image = absUrl(url, rawImg);

  const priceText =
    $('meta[itemprop=price]').attr('content') ||
    $('[itemprop=price]').attr('content') ||
    $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content') ||
    $('[data-automation-id*=price]').first().text() ||
    $('.price-characteristic').first().attr('content');

  const priceNum = firstMoneyUniversal(String(priceText || ''));
  return { title, image, priceNum, source: 'walmart' };
}
