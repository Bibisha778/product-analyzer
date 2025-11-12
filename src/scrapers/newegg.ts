import { load } from 'cheerio';
import { firstMoneyUniversal } from '../lib/money';

export function match(url: string) {
  return /newegg\.com$/i.test(new URL(url).hostname.replace(/^www\./,''));
}

export function scrape(html: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim() || 'No title found';

  const image =
    $('meta[property="og:image"]').attr('content') ||
    $('.product-view-img-original').attr('src') ||
    $('img[src]').first().attr('src');

  const priceText =
    $('.price-current').first().text().trim() ||
    $('.price-current *').first().text().trim();

  const priceNum = firstMoneyUniversal(String(priceText || ''));
  return { title, image, priceNum, source: 'newegg' };
}
