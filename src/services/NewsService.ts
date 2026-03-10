import type { NewsItem } from '../types/index.js';
import { fetchText } from '../utils/fetch.js';
import { XMLParser } from 'fast-xml-parser';

const RSS_SOURCES = [
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'AP', url: 'https://feeds.apnews.com/rss/apf-topnews' },
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { name: 'FT', url: 'https://www.ft.com/?format=rss' },
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '_' });

interface RssChannel {
  item?: RssItem | RssItem[];
}

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
}

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  try {
    const result = parser.parse(xml) as { rss?: { channel?: RssChannel } };
    const channel = result?.rss?.channel;
    if (!channel) return [];
    const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    return items.slice(0, 15).map((item) => ({
      title: item.title?.trim() ?? '',
      description: (item.description ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 200),
      url: item.link?.trim() ?? '#',
      publishedAt: item.pubDate ?? new Date().toISOString(),
      source: sourceName,
    })).filter(item => item.title.length > 0);
  } catch {
    return [];
  }
}

export class NewsService {
  private cache: NewsItem[] = [];
  private lastFetch = 0;
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  async fetchNews(): Promise<NewsItem[]> {
    const now = Date.now();
    if (this.cache.length > 0 && now - this.lastFetch < this.ttlMs) {
      return this.cache;
    }

    const results: NewsItem[] = [];
    const fetches = RSS_SOURCES.map(async ({ name, url }) => {
      try {
        const xml = await fetchText(url);
        const items = parseRssItems(xml, name);
        results.push(...items);
      } catch {
        // Individual feed failure is non-fatal
      }
    });

    await Promise.allSettled(fetches);

    if (results.length === 0 && this.cache.length > 0) {
      return this.cache; // Keep stale cache if all feeds fail
    }

    // Sort by publication date descending
    results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    this.cache = results;
    this.lastFetch = now;
    return this.cache;
  }
}
