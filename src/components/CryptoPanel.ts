import type { CryptoQuote } from '../types/index.js';
import { formatPrice, colorClass, arrowChar } from '../utils/format.js';

export class CryptoPanel {
  private element: HTMLElement;
  private listEl!: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'panel crypto-panel';
    this.element.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">CRYPTO</span>
        <span class="panel-subtitle">VIA COINGECKO</span>
      </div>
      <div class="panel-body">
        <div class="crypto-list" id="crypto-list"></div>
      </div>
    `;
    this.listEl = this.element.querySelector('#crypto-list') as HTMLElement;
  }

  update(quotes: CryptoQuote[]): void {
    if (quotes.length === 0) {
      this.listEl.innerHTML = '<div class="quote-empty">LOADING...</div>';
      return;
    }

    this.listEl.innerHTML = quotes.map(q => {
      const cls = colorClass(q.changePercent24h);
      const arrow = arrowChar(q.changePercent24h);
      const sign = q.changePercent24h >= 0 ? '+' : '';
      const mcap = q.marketCap >= 1e9
        ? `$${(q.marketCap / 1e9).toFixed(1)}B`
        : q.marketCap >= 1e6
        ? `$${(q.marketCap / 1e6).toFixed(0)}M`
        : '';
      return `
        <div class="crypto-row ${cls}">
          <div class="crypto-left">
            <span class="crypto-symbol">${q.symbol}</span>
            <span class="crypto-name">${q.name}</span>
          </div>
          <div class="crypto-right">
            <span class="crypto-price">$${formatPrice(q.price, q.price < 1 ? 4 : 2)}</span>
            <span class="crypto-change">${arrow} ${sign}${q.changePercent24h.toFixed(2)}%</span>
            ${mcap ? `<span class="crypto-mcap">${mcap}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
