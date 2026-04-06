/**
 * Minimap — Small 2D inset showing current camera position on a flat map.
 *
 * Uses a simple canvas with a projected world outline and a crosshair
 * at the current camera lat/lon. Updated at ~10fps from the HUD tick.
 */

const MAP_W = 160;
const MAP_H = 80;

// Simplified world continent outlines (lon, lat polylines)
// Just enough to show land/ocean orientation
const LAND_OUTLINES: [number, number][][] = [
  // North America
  [[-130, 50], [-125, 60], [-100, 60], [-80, 45], [-65, 45], [-80, 25], [-100, 20], [-120, 35], [-130, 50]],
  // South America
  [[-80, 10], [-60, 5], [-35, -5], [-40, -22], [-55, -35], [-70, -50], [-75, -20], [-80, 10]],
  // Europe/Africa
  [[-10, 35], [0, 48], [10, 55], [30, 60], [40, 55], [30, 45], [35, 30], [50, 12], [40, -5], [30, -35], [20, -35], [10, 5], [-5, 10], [-15, 15], [-10, 35]],
  // Asia
  [[40, 55], [60, 55], [80, 45], [90, 28], [100, 22], [105, 10], [120, 25], [130, 40], [140, 45], [150, 60], [180, 65], [180, 55], [135, 35], [120, 15], [100, 5], [80, 8], [65, 25], [60, 40], [40, 55]],
  // Australia
  [[115, -15], [130, -12], [150, -15], [150, -30], [140, -38], [130, -35], [115, -22], [115, -15]],
];

function lonToX(lon: number): number {
  return ((lon + 180) / 360) * MAP_W;
}
function latToY(lat: number): number {
  return ((90 - lat) / 180) * MAP_H;
}

export class Minimap {
  private element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'ge-minimap';
    this.element.style.cssText = 'position:absolute;bottom:56px;right:16px;pointer-events:none;z-index:11;';

    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_W * 2; // 2x for retina
    this.canvas.height = MAP_H * 2;
    this.canvas.style.cssText = `width:${MAP_W}px;height:${MAP_H}px;border-radius:8px;`;
    this.element.append(this.canvas);
    container.append(this.element);

    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(2, 2);
    this.drawBase();
  }

  update(lat: number, lon: number): void {
    this.drawBase();
    this.drawCrosshair(lon, lat);
  }

  private drawBase(): void {
    const ctx = this.ctx;
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Grid lines
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.08)';
    ctx.lineWidth = 0.5;
    for (let lon = -180; lon <= 180; lon += 60) {
      ctx.beginPath();
      ctx.moveTo(lonToX(lon), 0);
      ctx.lineTo(lonToX(lon), MAP_H);
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      ctx.moveTo(0, latToY(lat));
      ctx.lineTo(MAP_W, latToY(lat));
      ctx.stroke();
    }

    // Land outlines
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.25)';
    ctx.lineWidth = 0.8;
    for (const outline of LAND_OUTLINES) {
      ctx.beginPath();
      for (const [i, element] of outline.entries()) {
        const [lon, lat] = element!;
        const x = lonToX(lon);
        const y = latToY(lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private drawCrosshair(lon: number, lat: number): void {
    const ctx = this.ctx;
    const x = lonToX(lon);
    const y = latToY(lat);

    // Crosshair
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.8)';
    ctx.lineWidth = 1;

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x - 2, y);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 6, y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y - 2);
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x, y + 6);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = 'rgba(248, 113, 113, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  destroy(): void {
    this.element.remove();
  }
}
