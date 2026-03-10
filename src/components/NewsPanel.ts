import type { NewsItem } from '../types/index.js';
import { timeAgo, escapeHtml, safeUrl } from '../utils/format.js';

export class NewsPanel {
  private element: HTMLElement;
  private listEl!: HTMLElement;
  private selectedIndex = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'panel news-panel';
    this.element.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">TOP NEWS</span>
        <span class="panel-badge" id="news-count">--</span>
        <span class="panel-action" id="news-source-filter">ALL SOURCES</span>
      </div>
      <div class="panel-body">
        <div class="news-list" id="news-list"></div>
      </div>
    `;
    this.listEl = this.element.querySelector('#news-list') as HTMLElement;
  }

  update(items: NewsItem[]): void {
    const countEl = this.element.querySelector('#news-count');
    if (countEl) countEl.textContent = String(items.length);

    if (items.length === 0) {
      this.listEl.innerHTML = `<div class="news-empty">⚠ FETCHING NEWS FEEDS...</div>`;
      return;
    }

    this.listEl.innerHTML = items.map((item, i) => {
      const url = safeUrl(item.url);
      return `
      <div class="news-item ${i === this.selectedIndex ? 'selected' : ''}" data-index="${i}" data-url="${escapeHtml(url)}">
        <div class="news-meta">
          <span class="news-source">[${escapeHtml(item.source.toUpperCase())}]</span>
          <span class="news-time">${timeAgo(item.publishedAt)}</span>
        </div>
        <div class="news-title">${escapeHtml(item.title)}</div>
        ${item.description ? `<div class="news-desc">${escapeHtml(item.description)}</div>` : ''}
      </div>
    `;
    }).join('');

    // Click to open URL — dataset value is already sanitised via safeUrl+escapeHtml above
    this.listEl.querySelectorAll('.news-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = (el as HTMLElement).dataset['url'];
        if (url && url !== '#' && (url.startsWith('https://') || url.startsWith('http://'))) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
