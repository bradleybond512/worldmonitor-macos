/**
 * EntityPopover — Glassmorphism detail card shown when clicking a globe entity.
 *
 * Reads the entity's description and position, then renders a floating
 * card anchored to the click position with a dismiss timer.
 */

import type { Entity, Viewer } from 'cesium';
import { Cartographic, Math as CesiumMath } from 'cesium';

const DISMISS_MS = 8000;

function formatCoord(deg: number, pos: string, neg: string): string {
  const dir = deg >= 0 ? pos : neg;
  return `${Math.abs(deg).toFixed(3)}\u00B0${dir}`;
}

export class EntityPopover {
  private element: HTMLElement;
  private container: HTMLElement;
  private viewer: Viewer;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private currentEntity: Entity | null = null;

  constructor(container: HTMLElement, viewer: Viewer) {
    this.container = container;
    this.viewer = viewer;
    this.element = document.createElement('div');
    this.element.className = 'ge-entity-popover ge-hidden';
    container.append(this.element);
  }

  show(entity: Entity, screenX: number, screenY: number): void {
    this.dismiss();
    this.currentEntity = entity;

    const desc = entity.description?.getValue(this.viewer.clock.currentTime) as string | undefined;
    const name = entity.name ?? 'Unknown';

    let coordText = '';
    try {
      const pos = entity.position?.getValue(this.viewer.clock.currentTime);
      if (pos) {
        const carto = Cartographic.fromCartesian(pos);
        const lat = CesiumMath.toDegrees(carto.latitude);
        const lon = CesiumMath.toDegrees(carto.longitude);
        coordText = `${formatCoord(lat, 'N', 'S')}, ${formatCoord(lon, 'E', 'W')}`;
      }
    } catch { /* position may not be available */ }

    this.element.innerHTML = '';

    // Header with close button
    const header = document.createElement('div');
    header.className = 'ge-popover-header';
    const title = document.createElement('div');
    title.className = 'ge-popover-title';
    title.textContent = name;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ge-popover-close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.dismiss());
    header.append(title, closeBtn);
    this.element.append(header);

    // Description
    if (desc) {
      const body = document.createElement('div');
      body.className = 'ge-popover-body';
      body.textContent = desc;
      this.element.append(body);
    }

    // Coordinates
    if (coordText) {
      const coords = document.createElement('div');
      coords.className = 'ge-popover-coords';
      coords.textContent = coordText;
      this.element.append(coords);
    }

    // Position the popover near the click, clamped to viewport
    const rect = this.container.getBoundingClientRect();
    const maxX = rect.width - 280;
    const maxY = rect.height - 150;
    const x = Math.min(Math.max(screenX + 16, 8), maxX);
    const y = Math.min(Math.max(screenY - 40, 8), maxY);
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;

    this.element.classList.remove('ge-hidden');

    this.dismissTimer = setTimeout(() => this.dismiss(), DISMISS_MS);
  }

  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.element.classList.add('ge-hidden');
    this.currentEntity = null;
  }

  get isVisible(): boolean {
    return this.currentEntity !== null;
  }

  destroy(): void {
    this.dismiss();
    this.element.remove();
  }
}
