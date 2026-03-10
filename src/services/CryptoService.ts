import type { CryptoQuote } from '../types/index.js';
import { fetchJson } from '../utils/fetch.js';

interface CoinGeckoResponse {
  [id: string]: {
    usd?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
  };
}

const COIN_MAP: [string, string, string][] = [
  ['bitcoin', 'BTC', 'Bitcoin'],
  ['ethereum', 'ETH', 'Ethereum'],
  ['binancecoin', 'BNB', 'BNB'],
  ['solana', 'SOL', 'Solana'],
  ['ripple', 'XRP', 'XRP'],
  ['cardano', 'ADA', 'Cardano'],
  ['dogecoin', 'DOGE', 'Dogecoin'],
  ['avalanche-2', 'AVAX', 'Avalanche'],
  ['chainlink', 'LINK', 'Chainlink'],
  ['polkadot', 'DOT', 'Polkadot'],
];

export class CryptoService {
  private cache: CryptoQuote[] = [];
  private lastFetch = 0;
  private readonly ttlMs = 60 * 1000;

  async fetchCrypto(): Promise<CryptoQuote[]> {
    const now = Date.now();
    if (this.cache.length > 0 && now - this.lastFetch < this.ttlMs) {
      return this.cache;
    }

    const ids = COIN_MAP.map(([id]) => id).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

    try {
      const data = await fetchJson<CoinGeckoResponse>(url);
      this.cache = COIN_MAP.map(([id, symbol, name]) => {
        const d = data[id] ?? {};
        return {
          id,
          symbol,
          name,
          price: d.usd ?? 0,
          change24h: (d.usd_24h_change ?? 0) / 100 * (d.usd ?? 0),
          changePercent24h: d.usd_24h_change ?? 0,
          marketCap: d.usd_market_cap ?? 0,
        };
      }).filter(c => c.price > 0);
      this.lastFetch = now;
    } catch {
      // Return stale cache if available
    }

    return this.cache;
  }
}
