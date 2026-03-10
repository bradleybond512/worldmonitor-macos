import type { MarketQuote } from '../types/index.js';
import { fetchJson } from '../utils/fetch.js';

interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        symbol?: string;
      };
    }>;
    error?: string | null;
  };
}

const EQUITY_SYMBOLS: [string, string][] = [
  ['^GSPC', 'S&P 500'],
  ['^IXIC', 'NASDAQ'],
  ['^DJI', 'DOW'],
  ['^RUT', 'RUSSELL 2K'],
  ['^VIX', 'VIX'],
  ['AAPL', 'APPLE'],
  ['MSFT', 'MICROSOFT'],
  ['GOOGL', 'ALPHABET'],
  ['AMZN', 'AMAZON'],
  ['NVDA', 'NVIDIA'],
  ['META', 'META'],
  ['TSLA', 'TESLA'],
];

const FOREX_SYMBOLS: [string, string][] = [
  ['EURUSD=X', 'EUR/USD'],
  ['GBPUSD=X', 'GBP/USD'],
  ['USDJPY=X', 'USD/JPY'],
  ['USDCNY=X', 'USD/CNY'],
  ['USDCHF=X', 'USD/CHF'],
  ['AUDUSD=X', 'AUD/USD'],
];

const COMMODITY_SYMBOLS: [string, string][] = [
  ['GC=F', 'GOLD'],
  ['CL=F', 'OIL (WTI)'],
  ['NG=F', 'NAT. GAS'],
  ['SI=F', 'SILVER'],
  ['HG=F', 'COPPER'],
];

async function fetchQuote(symbol: string, name: string): Promise<MarketQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const data = await fetchJson<YahooFinanceResponse>(url);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    return { symbol, name, price, change, changePercent, previousClose: prevClose };
  } catch {
    return null;
  }
}

async function fetchQuotes(pairs: [string, string][]): Promise<MarketQuote[]> {
  const results = await Promise.allSettled(pairs.map(([sym, name]) => fetchQuote(sym, name)));
  return results
    .filter((r): r is PromiseFulfilledResult<MarketQuote | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value as MarketQuote);
}

export class MarketService {
  private equitiesCache: MarketQuote[] = [];
  private forexCache: MarketQuote[] = [];
  private commoditiesCache: MarketQuote[] = [];
  private lastFetch = 0;
  private readonly ttlMs = 60 * 1000; // 1 minute

  async fetchEquities(): Promise<MarketQuote[]> {
    await this.maybeRefresh();
    return this.equitiesCache;
  }

  async fetchForex(): Promise<MarketQuote[]> {
    await this.maybeRefresh();
    return this.forexCache;
  }

  async fetchCommodities(): Promise<MarketQuote[]> {
    await this.maybeRefresh();
    return this.commoditiesCache;
  }

  private async maybeRefresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFetch < this.ttlMs) return;
    this.lastFetch = now;

    const [equities, forex, commodities] = await Promise.allSettled([
      fetchQuotes(EQUITY_SYMBOLS),
      fetchQuotes(FOREX_SYMBOLS),
      fetchQuotes(COMMODITY_SYMBOLS),
    ]);

    if (equities.status === 'fulfilled') this.equitiesCache = equities.value;
    if (forex.status === 'fulfilled') this.forexCache = forex.value;
    if (commodities.status === 'fulfilled') this.commoditiesCache = commodities.value;
  }
}
