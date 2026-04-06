import { type Camera } from 'cesium';
import { CesiumGlobe } from '@/components/CesiumGlobe';
import { GlobeDataManager } from '@/components/GlobeDataManager';

function zoomCamera(camera: Camera | undefined, delta: number): void {
  if (!camera) return;
  if (delta > 0) {
    camera.zoomOut(delta);
  } else if (delta < 0) {
    camera.zoomIn(-delta);
  }
}

function addListener<K extends string>(
  el: EventTarget,
  event: K,
  handler: (e: Event) => void,
  opts?: AddEventListenerOptions,
): () => void {
  el.addEventListener(event, handler, opts);
  return () => el.removeEventListener(event, handler, opts);
}

export class GodsEyeView {
  private container: HTMLElement;
  private globe: CesiumGlobe | null = null;
  private dataManager: GlobeDataManager | null = null;
  private active = false;
  private ionToken: string | undefined;
  private cleanupHandlers: (() => void)[] = [];

  constructor(ionToken?: string) {
    this.ionToken = ionToken;
    this.container = document.createElement('div');
    this.container.className = 'gods-eye-container';
    document.body.append(this.container);
  }

  get isActive(): boolean {
    return this.active;
  }

  async enter(): Promise<void> {
    if (this.active) return;
    this.active = true;

    this.container.classList.add('gods-eye-active');
    document.body.classList.add('gods-eye-lock');

    try {
      this.globe = new CesiumGlobe({
        container: this.container,
        ionToken: this.ionToken,
      });
      await this.globe.initialize();
    } catch (error) {
      // eslint-disable-next-line no-console -- surface GPU/WebGL crash diagnostics
      console.error('[GodsEyeView] WebGL initialization failed:', error);
      this.globe?.destroy();
      this.globe = null;
      this.active = false;
      this.container.classList.remove('gods-eye-active');
      document.body.classList.remove('gods-eye-lock');
      return;
    }

    this.attachZoomHandlers();

    // Load data layers onto the globe (non-blocking — layers appear as they load)
    const viewer = this.globe.cesiumViewer;
    if (viewer) {
      this.dataManager = new GlobeDataManager(viewer);
      this.dataManager.initialize();
    }
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;

    for (const fn of this.cleanupHandlers) fn();
    this.cleanupHandlers = [];

    this.container.classList.remove('gods-eye-active');
    document.body.classList.remove('gods-eye-lock');

    setTimeout(() => {
      this.dataManager?.destroy();
      this.dataManager = null;
      this.globe?.destroy();
      this.globe = null;
    }, 600);
  }

  toggle(): void {
    if (this.active) {
      this.exit();
    } else {
      void this.enter();
    }
  }

  destroy(): void {
    this.exit();
    this.container.remove();
  }

  private attachZoomHandlers(): void {
    this.cleanupHandlers.push(
      // 1. wheel on document (capture phase) — most reliable for WKWebView
      addListener(document, 'wheel', (e: Event) => {
        if (!this.active) return;
        const we = e as WheelEvent;
        if (!this.container.contains(we.target as Node)) return;
        we.preventDefault();
        zoomCamera(this.globe?.camera, we.deltaY * 500);
      }, { passive: false, capture: true }),

      // 2. wheel on container (bubble phase)
      addListener(this.container, 'wheel', (e: Event) => {
        (e as WheelEvent).preventDefault();
        zoomCamera(this.globe?.camera, (e as WheelEvent).deltaY * 500);
      }, { passive: false }),

      // 3. Legacy mousewheel (older WebKit)
      addListener(this.container, 'mousewheel', (e: Event) => {
        e.preventDefault();
        zoomCamera(this.globe?.camera, ((e as WheelEvent).deltaY ?? 0) * 500);
      }, { passive: false }),

      // 4. Safari gesturechange — trackpad pinch-to-zoom fires this on WebKit
      addListener(this.container, 'gesturestart', (e: Event) => {
        e.preventDefault();
      }),
      addListener(this.container, 'gesturechange', (e: Event) => {
        e.preventDefault();
        const ge = e as Event & { scale?: number };
        if (ge.scale == null) return;
        const camera = this.globe?.camera;
        if (!camera) return;
        const alt = camera.positionCartographic.height;
        // scale > 1 = pinch out = zoom in, scale < 1 = pinch in = zoom out
        if (ge.scale > 1) {
          camera.zoomIn(alt * (ge.scale - 1) * 3);
        } else if (ge.scale < 1) {
          camera.zoomOut(alt * (1 - ge.scale) * 3);
        }
      }),

      // 5. Keyboard +/- zoom
      addListener(document, 'keydown', (e: Event) => {
        if (!this.active) return;
        const ke = e as KeyboardEvent;
        const camera = this.globe?.camera;
        if (!camera) return;
        const alt = camera.positionCartographic.height;
        if (ke.key === '=' || ke.key === '+') {
          camera.zoomIn(alt * 0.4);
        } else if (ke.key === '-' || ke.key === '_') {
          camera.zoomOut(alt * 0.4);
        }
      }),
    );
  }
}
