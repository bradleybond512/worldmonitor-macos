import { loadGodsEyeLayers, saveGodsEyeLayers, type GodsEyeLayers } from '@/config/gods-eye-layers';

export interface HUDState {
  cameraAltitude: number;
  cameraLat: number;
  cameraLon: number;
  satelliteCount: number;
  activeHotspots: number;
  threatLevel: string;
}

export class GlobeHUD {
  private element: HTMLElement;
  private layers: GodsEyeLayers;
  private onLayerToggle: ((layerKey: string, enabled: boolean) => void) | null = null;
  private onExit: (() => void) | null = null;

  // Cached DOM references for efficient updates
  private threatEl: HTMLElement | null = null;
  private hotspotsEl: HTMLElement | null = null;
  private satsEl: HTMLElement | null = null;
  private altEl: HTMLElement | null = null;
  private coordsEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.layers = loadGodsEyeLayers();
    this.element = document.createElement('div');
    this.element.className = 'gods-eye-hud';
    this.element.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
    container.append(this.element);
    this.buildDOM();
  }

  private buildDOM(): void {
    // Top-left: threat info card
    const topLeft = this.createPositioned('top:12px;left:12px;pointer-events:auto;');
    const card = this.createCard();
    this.appendLabel(card, 'THREAT LEVEL');
    this.threatEl = this.appendValue(card, 'NOMINAL', 'ge-hud-threat');
    this.hotspotsEl = this.appendStat(card, 'Hotspots: ', '0');
    this.satsEl = this.appendStat(card, 'Satellites: ', '0');
    topLeft.append(card);
    this.element.append(topLeft);

    // Top-right: exit button
    const topRight = this.createPositioned('top:12px;right:12px;pointer-events:auto;');
    const exitBtn = document.createElement('button');
    exitBtn.className = 'ge-exit-btn';
    exitBtn.id = 'geExitBtn';
    exitBtn.title = 'Exit God\'s Eye (ESC)';
    exitBtn.textContent = 'EXIT';
    exitBtn.addEventListener('click', () => this.onExit?.());
    topRight.append(exitBtn);
    this.element.append(topRight);

    // Bottom-center: layer toggle bar
    const bottomCenter = this.createPositioned(
      'bottom:12px;left:50%;transform:translateX(-50%);pointer-events:auto;',
    );
    const layerBar = document.createElement('div');
    layerBar.className = 'ge-layer-bar';
    layerBar.id = 'geLayerBar';
    this.buildLayerButtons(layerBar);
    bottomCenter.append(layerBar);
    this.element.append(bottomCenter);

    // Bottom-right: camera readout
    const bottomRight = this.createPositioned('bottom:12px;right:12px;');
    const camCard = this.createCard();
    camCard.classList.add('ge-hud-camera');
    this.altEl = document.createElement('span');
    this.altEl.textContent = '0 km';
    this.coordsEl = document.createElement('span');
    this.coordsEl.textContent = '0.00\u00B0, 0.00\u00B0';
    camCard.append(this.altEl);
    camCard.append(document.createTextNode(' \u00B7 '));
    camCard.append(this.coordsEl);
    bottomRight.append(camCard);
    this.element.append(bottomRight);
  }

  private createPositioned(style: string): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;${style}`;
    return el;
  }

  private createCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ge-hud-card';
    return card;
  }

  private appendLabel(parent: HTMLElement, text: string): void {
    const el = document.createElement('div');
    el.className = 'ge-hud-label';
    el.textContent = text;
    parent.append(el);
  }

  private appendValue(parent: HTMLElement, text: string, className: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `ge-hud-value ${className}`;
    el.textContent = text;
    parent.append(el);
    return el;
  }

  private appendStat(parent: HTMLElement, label: string, value: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ge-hud-stat';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    const valueSpan = document.createElement('span');
    valueSpan.textContent = value;
    el.append(labelSpan);
    el.append(valueSpan);
    parent.append(el);
    return valueSpan;
  }

  private buildLayerButtons(bar: HTMLElement): void {
    for (const [key, config] of Object.entries(this.layers)) {
      if (config.category === 'aesthetic') continue;
      const btn = document.createElement('button');
      btn.className = `ge-layer-btn${config.enabled ? ' ge-layer-active' : ''}`;
      btn.dataset.layer = key;
      btn.title = config.description;
      btn.textContent = config.name;
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

  updateState(state: Partial<HUDState>): void {
    if (state.threatLevel !== undefined && this.threatEl) {
      this.threatEl.textContent = state.threatLevel;
    }
    if (state.activeHotspots !== undefined && this.hotspotsEl) {
      this.hotspotsEl.textContent = String(state.activeHotspots);
    }
    if (state.satelliteCount !== undefined && this.satsEl) {
      this.satsEl.textContent = String(state.satelliteCount);
    }
    if (state.cameraAltitude !== undefined && this.altEl) {
      const km = Math.round(state.cameraAltitude / 1000);
      this.altEl.textContent = km > 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km} km`;
    }
    if (state.cameraLat !== undefined && state.cameraLon !== undefined && this.coordsEl) {
      this.coordsEl.textContent = `${state.cameraLat.toFixed(2)}\u00B0, ${state.cameraLon.toFixed(2)}\u00B0`;
    }
  }

  setOnLayerToggle(cb: (layerKey: string, enabled: boolean) => void): void {
    this.onLayerToggle = cb;
  }

  setOnExit(cb: () => void): void {
    this.onExit = cb;
  }

  destroy(): void {
    this.element.remove();
    this.onLayerToggle = null;
    this.onExit = null;
  }
}
