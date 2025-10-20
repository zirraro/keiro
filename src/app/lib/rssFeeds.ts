export type CleanCat =
  | 'a-la-une' | 'politique' | 'economie' | 'business'
  | 'sport' | 'people' | 'sante' | 'restauration'
  | 'tech' | 'culture' | 'monde' | 'auto'
  | 'climat' | 'immo' | 'lifestyle' | 'gaming';

type FeedMap = Record<CleanCat, string[]>;

export const RSS_FEEDS: FeedMap = {
  'a-la-une': [
    'https://www.france24.com/fr/rss',
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://www.reuters.com/world/rss'
  ],
  politique: [
    'https://www.reuters.com/politics/rss',
    'https://www.france24.com/fr/politique/rss'
  ],
  economie: [
    'https://www.reuters.com/finance/rss',
    'https://www.france24.com/fr/%C3%A9conomie/rss'
  ],
  business: [
    'https://www.reuters.com/markets/rss',
    'https://feeds.bbci.co.uk/news/business/rss.xml'
  ],
  sport: [
    'https://www.reuters.com/lifestyle/sports/rss',
    'https://www.france24.com/fr/sports/rss'
  ],
  people: [
    'https://www.hollywoodreporter.com/t/celebrity/feed/',
    'https://www.etonline.com/rss'
  ],
  sante: [
    'https://medicalxpress.com/rss-feed/',
    'https://www.who.int/feeds/entity/mediacentre/news/fr/rss.xml'
  ],
  restauration: [
    'https://www.eater.com/rss/index.xml',
    'https://www.qsrmagazine.com/rss.xml'
  ],
  tech: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://arstechnica.com/feed/'
  ],
  culture: [
    'https://www.france24.com/fr/culture/rss',
    'https://www.rollingstone.com/music/music-news/feed/'
  ],
  monde: [
    'https://www.reuters.com/world/rss',
    'https://feeds.bbci.co.uk/news/world/rss.xml'
  ],
  auto: [
    'https://www.motor1.com/rss/news/',
    'https://www.autoblog.com/rss.xml'
  ],
  climat: [
    'https://www.theguardian.com/environment/rss',
    'https://www.reuters.com/business/environment/rss'
  ],
  immo: [
    'https://www.housingwire.com/feed/',
    'https://therealdeal.com/feed/'
  ],
  lifestyle: [
    'https://www.gq.com/feed/rss',
    'https://www.vogue.com/rss'
  ],
  gaming: [
    'https://www.polygon.com/gaming/rss/index.xml',
    'https://www.ign.com/rss'
  ],
};
