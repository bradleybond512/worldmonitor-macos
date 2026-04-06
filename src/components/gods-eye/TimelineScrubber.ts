/**
 * TimelineScrubber — Time window filter for God's Eye entities.
 *
 * Renders a bar of preset time windows (1h, 6h, 24h, 7d, All) that
 * dispatches a custom event when the user changes the window. The
 * GlobeDataManager can then filter entities by time.
 */

const TIME_WINDOWS = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
  { label: 'ALL', hours: 0 },
] as const;

const STORAGE_KEY = 'worldmonitor-gods-eye-timeline';

export class TimelineScrubber {
  private element: HTMLElement;
  private activeHours = 0; // 0 = all
  private buttons: HTMLButtonElement[] = [];
  private onChange: ((hours: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'ge-timeline-bar';
    this.element.style.cssText = 'position:absolute;bottom:56px;left:50%;transform:translateX(-50%);pointer-events:auto;z-index:11;';
    container.append(this.element);

    this.loadState();
    this.buildDOM();
  }

  setOnChange(cb: (hours: number) => void): void {
    this.onChange = cb;
  }

  get currentHours(): number {
    return this.activeHours;
  }

  private buildDOM(): void {
    const label = document.createElement('span');
    label.className = 'ge-timeline-label';
    label.textContent = 'TIME';
    this.element.append(label);

    for (const tw of TIME_WINDOWS) {
      const btn = document.createElement('button');
      btn.className = `ge-timeline-btn${tw.hours === this.activeHours ? ' ge-timeline-active' : ''}`;
      btn.textContent = tw.label;
      btn.addEventListener('click', () => this.selectWindow(tw.hours));
      this.element.append(btn);
      this.buttons.push(btn);
    }
  }

  private selectWindow(hours: number): void {
    this.activeHours = hours;
    for (const [i, TIME_WINDOW] of TIME_WINDOWS.entries()) {
      this.buttons[i]!.classList.toggle('ge-timeline-active', TIME_WINDOW!.hours === hours);
    }
    this.saveState();
    this.onChange?.(hours);
  }

  private loadState(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) this.activeHours = Number(stored) || 0;
    } catch { /* ignore */ }
  }

  private saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, String(this.activeHours));
    } catch { /* ignore */ }
  }

  destroy(): void {
    this.element.remove();
    this.onChange = null;
  }
}
