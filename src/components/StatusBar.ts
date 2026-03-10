export interface StatusBarAction {
  key: string;
  label: string;
  action: () => void;
}

export class StatusBar {
  private element: HTMLElement;
  private refreshEl!: HTMLElement;
  private lastUpdateEl!: HTMLElement;

  constructor(actions: StatusBarAction[]) {
    this.element = document.createElement('div');
    this.element.className = 'status-bar';
    this.render(actions);
  }

  private render(actions: StatusBarAction[]): void {
    const actionHtml = actions.map(a =>
      `<button class="status-btn" data-key="${a.key}" title="${a.label}">
        <span class="status-key">${a.key}</span>
        <span class="status-label">${a.label}</span>
       </button>`
    ).join('');

    this.element.innerHTML = `
      <div class="status-actions">${actionHtml}</div>
      <div class="status-info">
        <span id="status-refresh" class="status-refresh"></span>
        <span class="status-separator">|</span>
        <span id="status-last-update" class="status-last-update">NOT YET REFRESHED</span>
      </div>
    `;

    this.refreshEl = this.element.querySelector('#status-refresh') as HTMLElement;
    this.lastUpdateEl = this.element.querySelector('#status-last-update') as HTMLElement;

    actions.forEach(a => {
      const btn = this.element.querySelector(`[data-key="${a.key}"]`);
      btn?.addEventListener('click', a.action);
    });
  }

  setLastUpdate(date: Date): void {
    if (this.lastUpdateEl) {
      this.lastUpdateEl.textContent = `LAST UPDATE: ${date.toLocaleTimeString('en-US', { hour12: false })}`;
    }
  }

  setRefreshing(active: boolean): void {
    if (this.refreshEl) {
      this.refreshEl.textContent = active ? '⟳ REFRESHING...' : '';
    }
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
