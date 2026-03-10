import type { MarketQuote } from '../types/index.js';
import { formatPrice, formatChange, colorClass, arrowChar } from '../utils/format.js';

function quoteRow(q: MarketQuote): string {
  const cls = colorClass(q.changePercent);
  const arrow = arrowChar(q.changePercent);
  return `
    <div class="quote-row ${cls}">
      <span class="quote-name">${q.name}</span>
      <span class="quote-price">${formatPrice(q.price)}</span>
      <span class="quote-change">${arrow} ${formatChange(q.change, q.changePercent)}</span>
    </div>
  `;
}

export class MarketsPanel {
  private element: HTMLElement;
  private equitiesEl!: HTMLElement;
  private forexEl!: HTMLElement;
  private commoditiesEl!: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'panel markets-panel';
    this.element.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">MARKETS</span>
      </div>
      <div class="panel-body markets-body">
        <div class="market-section">
          <div class="section-title">EQUITIES &amp; INDICES</div>
          <div class="quote-list" id="equities-list"></div>
        </div>
        <div class="market-section">
          <div class="section-title">FOREIGN EXCHANGE</div>
          <div class="quote-list" id="forex-list"></div>
        </div>
        <div class="market-section">
          <div class="section-title">COMMODITIES</div>
          <div class="quote-list" id="commodities-list"></div>
        </div>
      </div>
    `;
    this.equitiesEl = this.element.querySelector('#equities-list') as HTMLElement;
    this.forexEl = this.element.querySelector('#forex-list') as HTMLElement;
    this.commoditiesEl = this.element.querySelector('#commodities-list') as HTMLElement;
  }

  updateEquities(quotes: MarketQuote[]): void {
    this.equitiesEl.innerHTML = quotes.length
      ? quotes.map(quoteRow).join('')
      : '<div class="quote-empty">LOADING...</div>';
  }

  updateForex(quotes: MarketQuote[]): void {
    this.forexEl.innerHTML = quotes.length
      ? quotes.map(quoteRow).join('')
      : '<div class="quote-empty">LOADING...</div>';
  }

  updateCommodities(quotes: MarketQuote[]): void {
    this.commoditiesEl.innerHTML = quotes.length
      ? quotes.map(quoteRow).join('')
      : '<div class="quote-empty">LOADING...</div>';
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
