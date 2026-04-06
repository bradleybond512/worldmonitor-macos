import { loadGodsEyeLayers, saveGodsEyeLayers, type GodsEyeLayers } from '@/config/gods-eye-layers';

export interface HUDState {
  cameraAltitude: number;
  cameraLat: number;
  cameraLon: number;
  satelliteCount: number;
  activeHotspots: number;
  threatLevel: string;
}

function threatFromHotspots(count: number): { label: string; cls: string } {
  if (count > 500) return { label: 'CRITICAL', cls: 'ge-threat-critical' };
  if (count > 200) return { label: 'ELEVATED', cls: 'ge-threat-elevated' };
  if (count > 50)  return { label: 'GUARDED', cls: 'ge-threat-guarded' };
  return { label: 'NOMINAL', cls: 'ge-threat-nominal' };
}

function formatCoord(deg: number, pos: string, neg: string): string {
  const dir = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(2)}\u00B0${dir}`;
}

const THEATER_HINTS = [
  ['1', 'Middle East'],
  ['2', 'Pacific'],
  ['3', 'Europe'],
  ['4', 'Arctic'],
  ['5', 'Africa'],
  ['6', 'Americas'],
  ['ESC', 'Exit'],
] as const;

export class GlobeHUD {
  private element: HTMLElement;
  private layers: GodsEyeLayers;
  private onLayerToggle: ((layerKey: string, enabled: boolean) => void) | null = null;
  private onExit: (() => void) | null = null;
  private clockId: number | null = null;

  // Cached DOM refs
  private threatEl: HTMLElement | null = null;
  private hotspotsEl: HTMLElement | null = null;
  private altEl: HTMLElement | null = null;
  private coordsEl: HTMLElement | null = null;
  private clockEl: HTMLElement | null = null;
  private layerCountEls = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    this.layers = loadGodsEyeLayers();
    this.element = document.createElement('div');
    this.element.className = 'gods-eye-hud';
    this.element.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
    container.append(this.element);
    this.buildDOM();
    this.startClock();
  }

  private buildDOM(): void {
    // ── Top-left: Threat card ──
    const topLeft = this.pos('top:16px;left:16px;pointer-events:auto;');
    const card = this.card('ge-hud-threat-card');
    this.clockEl = this.el('div', 'ge-hud-clock');
    card.append(this.clockEl);
    const threatLabel = this.el('div', 'ge-hud-micro-label', 'THREAT ASSESSMENT');
    card.append(threatLabel);
    this.threatEl = this.el('div', 'ge-hud-threat-value ge-threat-nominal', 'NOMINAL');
    card.append(this.threatEl);
    const statsRow = this.el('div', 'ge-hud-stats-row');
    this.hotspotsEl = this.statPill(statsRow, 'HOTSPOTS', '0');
    this.altEl = this.statPill(statsRow, 'ALT', '0 km');
    card.append(statsRow);
    const coordRow = this.el('div', 'ge-hud-stats-row');
    this.coordsEl = this.el('span', 'ge-hud-coord', '0.00\u00B0N, 0.00\u00B0E');
    coordRow.append(this.coordsEl);
    card.append(coordRow);
    topLeft.append(card);
    this.element.append(topLeft);

    // ── Top-right: Exit + theater legend ──
    const topRight = this.pos('top:16px;right:16px;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px;');
    const exitBtn = document.createElement('button');
    exitBtn.className = 'ge-exit-btn';
    exitBtn.id = 'geExitBtn';
    exitBtn.title = 'Exit God\'s Eye (ESC)';
    const exitIcon = this.el('span', 'ge-exit-icon', '\u2715');
    exitBtn.append(exitIcon, document.createTextNode(' EXIT'));
    exitBtn.addEventListener('click', () => this.onExit?.());
    topRight.append(exitBtn);

    // Theater preset hints
    const hints = this.card('ge-hud-hints');
    for (const [key, label] of THEATER_HINTS) {
      const row = document.createElement('div');
      row.className = 'ge-hint-row';
      const keyEl = this.el('span', 'ge-hint-key', key);
      row.append(keyEl, document.createTextNode(` ${label}`));
      hints.append(row);
    }
    topRight.append(hints);
    this.element.append(topRight);

    // ── Bottom-center: Layer toggle bar ──
    const bottomCenter = this.pos(
      'bottom:16px;left:50%;transform:translateX(-50%);pointer-events:auto;max-width:90vw;',
    );
    const layerBar = document.createElement('div');
    layerBar.className = 'ge-layer-bar';
    layerBar.id = 'geLayerBar';
    this.buildLayerButtons(layerBar);
    bottomCenter.append(layerBar);
    this.element.append(bottomCenter);

    // ── Overlays ──
    const scanlines = document.createElement('div');
    scanlines.className = 'ge-scanlines';
    this.element.append(scanlines);

    const vignette = document.createElement('div');
    vignette.className = 'ge-vignette';
    this.element.append(vignette);
  }

  private pos(style: string): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;${style}`;
    return el;
  }

  private card(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `ge-hud-card ${cls}`;
    return el;
  }

  private el(tag: string, cls: string, text?: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  private statPill(parent: HTMLElement, label: string, value: string): HTMLElement {
    const pill = this.el('div', 'ge-hud-stat-pill');
    const labelEl = this.el('span', 'ge-hud-stat-label', label);
    const valueEl = this.el('span', 'ge-hud-stat-value', value);
    pill.append(labelEl, valueEl);
    parent.append(pill);
    return valueEl;
  }

  private buildLayerButtons(bar: HTMLElement): void {
    for (const [key, config] of Object.entries(this.layers)) {
      if (config.category === 'aesthetic') continue;
      const btn = document.createElement('button');
      btn.className = `ge-layer-btn${config.enabled ? ' ge-layer-active' : ''}`;
      btn.dataset.layer = key;
      btn.title = config.description;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ge-layer-name';
      nameSpan.textContent = config.name;

      const countSpan = document.createElement('span');
      countSpan.className = 'ge-layer-count';
      this.layerCountEls.set(key, countSpan);

      btn.append(nameSpan, countSpan);
      btn.addEventListener('click', () => {
        const layer = this.layers[key];
        if (!layer) return;
        layer.enabled = !layer.enabled;
        btn.classList.toggle('ge-layer-active', layer.enabled);
        saveGodsEyeLayers(this.layers);
        this.onLayerToggle?.(key, layer.enabled);
      });
      bar.append(btn);
    }
  }

  private updateClock(): void {
    if (!this.clockEl) return;
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    const s = String(now.getUTCSeconds()).padStart(2, '0');
    this.clockEl.textContent = `${h}:${m}:${s} UTC`;
  }

  private startClock(): void {
    this.updateClock();
    this.clockId = window.setInterval(() => this.updateClock(), 1000);
  }

  updateState(state: Partial<HUDState>): void {
    if (state.activeHotspots !== undefined) {
      if (this.hotspotsEl) this.hotspotsEl.textContent = String(state.activeHotspots);
      if (this.threatEl) {
        const { label, cls } = threatFromHotspots(state.activeHotspots);
        this.threatEl.textContent = label;
        this.threatEl.className = `ge-hud-threat-value ${cls}`;
      }
    }
    if (state.cameraAltitude !== undefined && this.altEl) {
      const km = Math.round(state.cameraAltitude / 1000);
      this.altEl.textContent = km > 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km} km`;
    }
    if (state.cameraLat !== undefined && state.cameraLon !== undefined && this.coordsEl) {
      this.coordsEl.textContent =
        `${formatCoord(state.cameraLat, 'N', 'S')}, ${formatCoord(state.cameraLon, 'E', 'W')}`;
    }
  }

  updateLayerCounts(counts: Map<string, number>): void {
    for (const [key, el] of this.layerCountEls) {
      const n = counts.get(key);
      el.textContent = n != null && n > 0 ? String(n) : '';
    }
  }

  setOnLayerToggle(cb: (layerKey: string, enabled: boolean) => void): void {
    this.onLayerToggle = cb;
  }

  setOnExit(cb: () => void): void {
    this.onExit = cb;
  }

  destroy(): void {
    if (this.clockId != null) clearInterval(this.clockId);
    this.element.remove();
    this.onLayerToggle = null;
    this.onExit = null;
  }
}
