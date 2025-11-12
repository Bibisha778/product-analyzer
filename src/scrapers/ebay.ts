import { load } from 'cheerio';
import { firstMoneyUniversal } from '../lib/money';

export function match(url: string) {
  const h = new URL(url).hostname.replace(/^www\./,'');
  return /ebay\.(com|ca|co\.uk|de|fr|it|es|com\.au)$/i.test(h);
}

export function scrape(html: string, url: string) {
  const $ = load(html);
  const title =
    $('#itemTitle').clone().children().remove().end().text().trim() ||
    $('h1.x-item-title__mainTitle').text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').text().trim() || 'No title found';

  const image =
    $('meta[property="og:image"]').attr('content') ||
    $('#icImg').attr('src') ||
    $('img[src]').first().attr('src');

  const priceText =
    $('#prcIsum').attr('content') || $('#prcIsum').text() ||
    $('#mm-saleDscPrc').text() ||
    $('.x-price-primary .ux-textspans').first().text() ||
    $('[itemprop=price]').attr('content') ||
    $('.display-price').first().text() ||
    $('.mainPrice').first().text();

  const priceNum = firstMoneyUniversal(String(priceText || ''));
  return { title, image, priceNum, source: 'ebay' };
}
