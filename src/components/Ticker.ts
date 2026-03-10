import type { MarketQuote } from '../types/index.js';
import { formatPrice, colorClass, arrowChar } from '../utils/format.js';

export class Ticker {
  private element: HTMLElement;
  private trackEl!: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ticker-container';
    this.element.innerHTML = `<div class="ticker-track" id="ticker-track"></div>`;
    this.trackEl = this.element.querySelector('#ticker-track') as HTMLElement;
  }

  update(quotes: MarketQuote[]): void {
    if (quotes.length === 0) return;
    const items = [...quotes, ...quotes].map(q => {
      const cls = colorClass(q.changePercent);
      const arrow = arrowChar(q.changePercent);
      const sign = q.changePercent >= 0 ? '+' : '';
      return `<span class="ticker-item ${cls}">
        <span class="ticker-symbol">${q.symbol.replace('^', '').replace('=X', '')}</span>
        <span class="ticker-price">${formatPrice(q.price)}</span>
        <span class="ticker-change">${arrow} ${sign}${q.changePercent.toFixed(2)}%</span>
      </span>`;
    }).join('<span class="ticker-dot">◆</span>');

    this.trackEl.innerHTML = items;
    // Reset animation by cloning
    const old = this.trackEl;
    const fresh = old.cloneNode(true) as HTMLElement;
    old.parentNode?.replaceChild(fresh, old);
    this.trackEl = fresh;
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
