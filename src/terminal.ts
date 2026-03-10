import { Header } from './components/Header.js';
import { Ticker } from './components/Ticker.js';
import { NewsPanel } from './components/NewsPanel.js';
import { MarketsPanel } from './components/MarketsPanel.js';
import { CryptoPanel } from './components/CryptoPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { NewsService } from './services/NewsService.js';
import { MarketService } from './services/MarketService.js';
import { CryptoService } from './services/CryptoService.js';

const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

export class Terminal {
  private header: Header;
  private ticker: Ticker;
  private newsPanel: NewsPanel;
  private marketsPanel: MarketsPanel;
  private cryptoPanel: CryptoPanel;
  private statusBar: StatusBar;

  private newsService = new NewsService();
  private marketService = new MarketService();
  private cryptoService = new CryptoService();

  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private root: HTMLElement) {
    this.header = new Header();
    this.ticker = new Ticker();
    this.newsPanel = new NewsPanel();
    this.marketsPanel = new MarketsPanel();
    this.cryptoPanel = new CryptoPanel();
    this.statusBar = new StatusBar([
      { key: 'F5', label: 'REFRESH', action: () => void this.refresh() },
      { key: 'F1', label: 'NEWS', action: () => this.scrollToPanel('news') },
      { key: 'F2', label: 'MARKETS', action: () => this.scrollToPanel('markets') },
      { key: 'F3', label: 'CRYPTO', action: () => this.scrollToPanel('crypto') },
    ]);
  }

  private buildLayout(): void {
    this.root.innerHTML = '';

    // Header
    this.root.appendChild(this.header.getElement());

    // Ticker tape
    this.root.appendChild(this.ticker.getElement());

    // Main content area
    const main = document.createElement('div');
    main.className = 'terminal-main';
    main.id = 'terminal-main';

    // Grid
    const grid = document.createElement('div');
    grid.className = 'terminal-grid';

    // News panel (wide, spans rows)
    const newsWrapper = document.createElement('div');
    newsWrapper.className = 'panel-wrapper news-wrapper';
    newsWrapper.id = 'panel-news';
    newsWrapper.appendChild(this.newsPanel.getElement());
    grid.appendChild(newsWrapper);

    // Markets panel
    const marketsWrapper = document.createElement('div');
    marketsWrapper.className = 'panel-wrapper markets-wrapper';
    marketsWrapper.id = 'panel-markets';
    marketsWrapper.appendChild(this.marketsPanel.getElement());
    grid.appendChild(marketsWrapper);

    // Crypto panel
    const cryptoWrapper = document.createElement('div');
    cryptoWrapper.className = 'panel-wrapper crypto-wrapper';
    cryptoWrapper.id = 'panel-crypto';
    cryptoWrapper.appendChild(this.cryptoPanel.getElement());
    grid.appendChild(cryptoWrapper);

    main.appendChild(grid);
    this.root.appendChild(main);

    // Status bar
    this.root.appendChild(this.statusBar.getElement());
  }

  private scrollToPanel(id: string): void {
    const el = document.getElementById(`panel-${id}`);
    el?.scrollIntoView({ behavior: 'smooth' });
  }

  async refresh(): Promise<void> {
    this.header.setStatus('loading');
    this.statusBar.setRefreshing(true);

    const [news, equities, forex, commodities, crypto] = await Promise.allSettled([
      this.newsService.fetchNews(),
      this.marketService.fetchEquities(),
      this.marketService.fetchForex(),
      this.marketService.fetchCommodities(),
      this.cryptoService.fetchCrypto(),
    ]);

    if (news.status === 'fulfilled') this.newsPanel.update(news.value);
    if (equities.status === 'fulfilled') this.marketsPanel.updateEquities(equities.value);
    if (forex.status === 'fulfilled') this.marketsPanel.updateForex(forex.value);
    if (commodities.status === 'fulfilled') this.marketsPanel.updateCommodities(commodities.value);
    if (crypto.status === 'fulfilled') this.cryptoPanel.update(crypto.value);

    // Update ticker with equities
    const allQuotes = [
      ...(equities.status === 'fulfilled' ? equities.value : []),
    ];
    this.ticker.update(allQuotes);

    this.header.setStatus('live');
    this.statusBar.setRefreshing(false);
    this.statusBar.setLastUpdate(new Date());
  }

  async init(): Promise<void> {
    this.buildLayout();
    this.header.start();

    // Remove loading screen
    const loading = document.getElementById('loading');
    if (loading) loading.remove();

    // Initial data fetch
    await this.refresh();

    // Auto-refresh
    this.refreshInterval = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  destroy(): void {
    this.header.stop();
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }
}
