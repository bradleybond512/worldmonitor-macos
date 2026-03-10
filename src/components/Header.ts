import { formatTime, formatDate } from '../utils/format.js';

export class Header {
  private element: HTMLElement;
  private timeEl!: HTMLSpanElement;
  private dateEl!: HTMLSpanElement;
  private statusEl!: HTMLSpanElement;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'terminal-header';
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="header-left">
        <span class="header-logo">◆ TERMINAL</span>
        <span class="header-separator">|</span>
        <span class="header-subtitle">FINANCIAL & NEWS INTELLIGENCE</span>
      </div>
      <div class="header-center">
        <span class="header-date" id="header-date"></span>
        <span class="header-separator">|</span>
        <span class="header-time" id="header-time"></span>
      </div>
      <div class="header-right">
        <span class="header-status" id="header-status">● LIVE</span>
        <span class="header-separator">|</span>
        <span class="header-build">v1.0.0</span>
      </div>
    `;
    this.timeEl = this.element.querySelector('#header-time') as HTMLSpanElement;
    this.dateEl = this.element.querySelector('#header-date') as HTMLSpanElement;
    this.statusEl = this.element.querySelector('#header-status') as HTMLSpanElement;
    this.updateClock();
  }

  private updateClock(): void {
    const now = new Date();
    if (this.timeEl) this.timeEl.textContent = formatTime(now);
    if (this.dateEl) this.dateEl.textContent = formatDate(now);
  }

  start(): void {
    this.intervalId = setInterval(() => this.updateClock(), 1000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  setStatus(status: 'live' | 'loading' | 'error'): void {
    if (!this.statusEl) return;
    const map = {
      live: { text: '● LIVE', cls: 'status-live' },
      loading: { text: '○ LOADING', cls: 'status-loading' },
      error: { text: '✕ ERROR', cls: 'status-error' },
    };
    const s = map[status];
    this.statusEl.textContent = s.text;
    this.statusEl.className = `header-status ${s.cls}`;
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
