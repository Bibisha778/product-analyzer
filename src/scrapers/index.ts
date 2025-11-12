import * as bookoutlet from './bookoutlet';
import * as newegg from './newegg';
import * as ebay from './ebay';
import * as walmart from './walmart';
import * as indigo from './indigo';
import * as generic from './generic';

type ScraperMod = {
  match?: (url: string) => boolean;
  scrape: (html: string, url: string) => any;
};

export function findScraper(url: string): ScraperMod {
  const modules: ScraperMod[] = [bookoutlet, newegg, ebay, walmart, indigo];
  const hit = modules.find(m => typeof m.match === 'function' && m.match!(url));
  return hit || generic;
}
