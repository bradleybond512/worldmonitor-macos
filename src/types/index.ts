export interface NewsItem {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

export interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  marketCap: number;
}

export interface TerminalState {
  activePanel: PanelId;
  lastRefresh: Date | null;
  isLoading: boolean;
}

export type PanelId = 'news' | 'markets' | 'crypto' | 'forex' | 'all';

export interface Panel {
  id: PanelId;
  title: string;
  render(): HTMLElement;
  refresh(): Promise<void>;
}
