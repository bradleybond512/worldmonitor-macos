import { loadGodsEyeLayers, saveGodsEyeLayers, type GodsEyeLayers } from '@/config/gods-eye-layers';
import type { AppMode } from '@/services/mode-manager';
import type { FollowTarget } from '@/components/gods-eye/AutoFollowEngine';

export interface HUDState {
  cameraAltitude: number;
  cameraLat: number;
  cameraLon: number;
  satelliteCount: number;
  activeHotspots: number;
  threatLevel: string;
}

const MODE_LABELS: Record<AppMode, { label: string; cls: string }> = {
  peace: { label: 'PEACE', cls: 'ge-mode-badge-peace' },
  war: { label: 'WAR', cls: 'ge-mode-badge-war' },
  disaster: { label: 'DISASTER', cls: 'ge-mode-badge-disaster' },
  finance: { label: 'FINANCE', cls: 'ge-mode-badge-finance' },
  ghost: { label: 'GHOST', cls: 'ge-mode-badge-ghost' },
};

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
  private onAutoFollowSkip: (() => void) | null = null;
  private clockId: number | null = null;

  // Cached DOM refs
  private threatEl: HTMLElement | null = null;
  private hotspotsEl: HTMLElement | null = null;
  private altEl: HTMLElement | null = null;
  private coordsEl: HTMLElement | null = null;
  private clockEl: HTMLElement | null = null;
  private modeBadgeEl: HTMLElement | null = null;
  private autoFollowCard: HTMLElement | null = null;
  private autoFollowTarget: HTMLElement | null = null;
  private autoFollowCounter: HTMLElement | null = null;
  private autoFollowSkipBtn: HTMLElement | null = null;
  private layerCountEls = new Map<string, HTMLElement>();
  private tooltipEl: HTMLElement | null = null;

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
    this.modeBadgeEl = this.el('div', 'ge-mode-badge ge-mode-badge-peace', 'PEACE');
    card.append(this.modeBadgeEl);
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

    // ── Bottom-left: Auto-follow status ──
    const bottomLeft = this.pos('bottom:16px;left:16px;pointer-events:auto;');
    this.autoFollowCard = this.card('ge-autofollow-card ge-hidden');
    const afHeader = this.el('div', 'ge-autofollow-header');
    const afLabel = this.el('span', 'ge-hud-micro-label', 'AUTO-FOLLOW');
    this.autoFollowCounter = this.el('span', 'ge-autofollow-counter', '0/0');
    afHeader.append(afLabel, this.autoFollowCounter);
    this.autoFollowCard.append(afHeader);
    this.autoFollowTarget = this.el('div', 'ge-autofollow-target', 'Scanning...');
    this.autoFollowCard.append(this.autoFollowTarget);
    this.autoFollowSkipBtn = document.createElement('button');
    this.autoFollowSkipBtn.className = 'ge-autofollow-skip';
    this.autoFollowSkipBtn.textContent = 'SKIP \u25B6';
    this.autoFollowSkipBtn.addEventListener('click', () => this.onAutoFollowSkip?.());
    this.autoFollowCard.append(this.autoFollowSkipBtn);
    bottomLeft.append(this.autoFollowCard);
    this.element.append(bottomLeft);

    // ── Overlays ──
    const scanlines = document.createElement('div');
    scanlines.className = 'ge-scanlines';
    this.element.append(scanlines);

    const vignette = document.createElement('div');
    vignette.className = 'ge-vignette';
    this.element.append(vignette);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'ge-tooltip ge-hidden';
    this.element.append(this.tooltipEl);
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

  setMode(mode: AppMode): void {
    if (!this.modeBadgeEl) return;
    const info = MODE_LABELS[mode] ?? MODE_LABELS.peace;
    this.modeBadgeEl.textContent = info.label;
    this.modeBadgeEl.className = `ge-mode-badge ${info.cls}`;
  }

  updateAutoFollowState(target: FollowTarget | null, index: number, total: number): void {
    if (!this.autoFollowCard) return;
    if (!target) {
      this.autoFollowCard.classList.add('ge-hidden');
      return;
    }
    this.autoFollowCard.classList.remove('ge-hidden');
    if (this.autoFollowTarget) {
      // Truncate long names
      const name = target.name.length > 60 ? target.name.slice(0, 57) + '...' : target.name;
      this.autoFollowTarget.textContent = name;
    }
    if (this.autoFollowCounter) {
      this.autoFollowCounter.textContent = `${index + 1}/${total}`;
    }
  }

  showTooltip(x: number, y: number, title: string, body: string): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.replaceChildren();
    const titleEl = document.createElement('div');
    titleEl.className = 'ge-tooltip-title';
    titleEl.textContent = title;
    const bodyEl = document.createElement('div');
    bodyEl.className = 'ge-tooltip-body';
    bodyEl.textContent = body;
    this.tooltipEl.append(titleEl, bodyEl);
    const pad = 12;
    const w = this.tooltipEl.offsetWidth || 220;
    const h = this.tooltipEl.offsetHeight || 80;
    const left = Math.min(x + 16, window.innerWidth - w - pad);
    const top = Math.min(y + 16, window.innerHeight - h - pad);
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
    this.tooltipEl.classList.remove('ge-hidden');
  }

  hideTooltip(): void {
    this.tooltipEl?.classList.add('ge-hidden');
  }

  setOnLayerToggle(cb: (layerKey: string, enabled: boolean) => void): void {
    this.onLayerToggle = cb;
  }

  setOnAutoFollowSkip(cb: () => void): void {
    this.onAutoFollowSkip = cb;
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
