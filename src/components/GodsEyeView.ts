import {
  Math as CesiumMath,
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { CesiumGlobe } from '@/components/CesiumGlobe';
import { GlobeDataManager } from '@/components/GlobeDataManager';
import { GlobeHUD } from '@/components/GlobeHUD';

// ── Theater camera presets (lat, lon, altitude meters, pitch degrees) ──
const THEATERS = {
  middleEast: { lon: 44, lat: 30, alt: 4e6, pitch: -35 },
  pacific:    { lon: 135, lat: 20, alt: 8e6, pitch: -30 },
  europe:     { lon: 15, lat: 50, alt: 5e6, pitch: -35 },
  arctic:     { lon: 0, lat: 80, alt: 6e6, pitch: -50 },
  africa:     { lon: 20, lat: 5, alt: 6e6, pitch: -30 },
  americas:   { lon: -80, lat: 20, alt: 8e6, pitch: -30 },
} as const;

const THEATER_KEYS: Record<string, keyof typeof THEATERS> = {
  '1': 'middleEast',
  '2': 'pacific',
  '3': 'europe',
  '4': 'arctic',
  '5': 'africa',
  '6': 'americas',
};

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
  private hud: GlobeHUD | null = null;
  private hudTickId: number | null = null;
  private orbitTickId: number | null = null;
  private idleTimer: number | null = null;
  private eventHandler: ScreenSpaceEventHandler | null = null;
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
    this.attachKeyboardHandlers();
    this.attachClickToFly();

    // Load data layers onto the globe
    const viewer = this.globe.cesiumViewer;
    if (viewer) {
      this.dataManager = new GlobeDataManager(viewer);
      this.dataManager.initialize();
    }

    // HUD overlay
    this.hud = new GlobeHUD(this.container);
    this.hud.setOnExit(() => this.exit());
    this.hud.setOnLayerToggle((key, enabled) => {
      this.dataManager?.setLayerVisible(key, enabled);
    });

    // Update HUD at ~10fps
    this.hudTickId = window.setInterval(() => {
      const camera = this.globe?.camera;
      if (!camera || !this.hud) return;
      const carto = camera.positionCartographic;
      this.hud.updateState({
        cameraAltitude: carto.height,
        cameraLat: CesiumMath.toDegrees(carto.latitude),
        cameraLon: CesiumMath.toDegrees(carto.longitude),
        activeHotspots: this.dataManager?.getEntityCount() ?? 0,
      });
      if (this.dataManager) {
        this.hud.updateLayerCounts(this.dataManager.getLayerCounts());
      }
    }, 100);

    // Auto-orbit disabled — was disruptive during use
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;

    for (const fn of this.cleanupHandlers) fn();
    this.cleanupHandlers = [];

    this.container.classList.remove('gods-eye-active');
    document.body.classList.remove('gods-eye-lock');

    if (this.hudTickId != null) { clearInterval(this.hudTickId); this.hudTickId = null; }
    if (this.orbitTickId != null) { cancelAnimationFrame(this.orbitTickId); this.orbitTickId = null; }
    if (this.idleTimer != null) { clearTimeout(this.idleTimer); this.idleTimer = null; }

    this.eventHandler?.destroy();
    this.eventHandler = null;

    setTimeout(() => {
      this.hud?.destroy();
      this.hud = null;
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

  private onUserInteraction(): void {
    if (this.orbitTickId != null) { cancelAnimationFrame(this.orbitTickId); this.orbitTickId = null; }
    if (this.idleTimer != null) clearTimeout(this.idleTimer);
  }

  // ── Click to fly ─────────────────────────────────────

  private attachClickToFly(): void {
    const viewer = this.globe?.cesiumViewer;
    if (!viewer) return;

    this.eventHandler = new ScreenSpaceEventHandler(viewer.canvas);
    this.eventHandler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position) as
        { id?: { position?: { getValue: (t: unknown) => Cartesian3 | undefined } } } | undefined;
      if (picked?.id?.position) {
        this.onUserInteraction();
        const pos = picked.id.position.getValue(viewer.clock.currentTime);
        if (pos) {
          const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(pos);
          viewer.camera.flyTo({
            destination: Cartesian3.fromRadians(
              carto.longitude,
              carto.latitude,
              Math.max(carto.height + 500_000, 800_000),
            ),
            duration: 2,
          });
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  // ── Keyboard ─────────────────────────────────────────

  private attachKeyboardHandlers(): void {
    this.cleanupHandlers.push(
      addListener(document, 'keydown', (e: Event) => {
        if (!this.active) return;
        const ke = e as KeyboardEvent;

        // ESC exits God's Eye
        if (ke.key === 'Escape') {
          this.exit();
          return;
        }

        // Theater presets 1-6
        const theater = THEATER_KEYS[ke.key];
        if (theater) {
          this.onUserInteraction();
          this.flyToTheater(theater);
          return;
        }

        // +/- zoom
        const camera = this.globe?.camera;
        if (!camera) return;
        const alt = camera.positionCartographic.height;
        if (ke.key === '=' || ke.key === '+') {
          this.onUserInteraction();
          camera.zoomIn(alt * 0.4);
        } else if (ke.key === '-' || ke.key === '_') {
          this.onUserInteraction();
          camera.zoomOut(alt * 0.4);
        }
      }),
    );
  }

  private flyToTheater(name: keyof typeof THEATERS): void {
    const viewer = this.globe?.cesiumViewer;
    if (!viewer) return;
    const t = THEATERS[name];
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(t.lon, t.lat, t.alt),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(t.pitch),
        roll: 0,
      },
      duration: 2.5,
    });
  }

  // ── Zoom handlers ────────────────────────────────────

  private attachZoomHandlers(): void {
    this.cleanupHandlers.push(
      // 1. wheel on document (capture phase)
      addListener(document, 'wheel', (e: Event) => {
        if (!this.active) return;
        const we = e as WheelEvent;
        if (!this.container.contains(we.target as Node)) return;
        we.preventDefault();
        this.onUserInteraction();
        const camera = this.globe?.camera;
        if (!camera) return;
        const delta = we.deltaY * 500;
        if (delta > 0) camera.zoomOut(delta);
        else if (delta < 0) camera.zoomIn(-delta);
      }, { passive: false, capture: true }),

      // 2. wheel on container (bubble)
      addListener(this.container, 'wheel', (e: Event) => {
        const we = e as WheelEvent;
        we.preventDefault();
        this.onUserInteraction();
        const camera = this.globe?.camera;
        if (!camera) return;
        if (we.deltaY > 0) camera.zoomOut(we.deltaY * 500);
        else if (we.deltaY < 0) camera.zoomIn(-we.deltaY * 500);
      }, { passive: false }),

      // 3. Legacy mousewheel
      addListener(this.container, 'mousewheel', (e: Event) => {
        e.preventDefault();
        this.onUserInteraction();
        const camera = this.globe?.camera;
        if (!camera) return;
        const delta = ((e as WheelEvent).deltaY ?? 0) * 500;
        if (delta > 0) camera.zoomOut(delta);
        else if (delta < 0) camera.zoomIn(-delta);
      }, { passive: false }),

      // 4. Safari gesturechange — trackpad pinch
      addListener(this.container, 'gesturestart', (e: Event) => {
        e.preventDefault();
      }),
      addListener(this.container, 'gesturechange', (e: Event) => {
        e.preventDefault();
        this.onUserInteraction();
        const ge = e as Event & { scale?: number };
        if (ge.scale == null) return;
        const camera = this.globe?.camera;
        if (!camera) return;
        const alt = camera.positionCartographic.height;
        if (ge.scale > 1) camera.zoomIn(alt * (ge.scale - 1) * 3);
        else if (ge.scale < 1) camera.zoomOut(alt * (1 - ge.scale) * 3);
      }),

      // 5. Mouse drag / touch — mark as user interaction
      addListener(this.container, 'mousedown', () => this.onUserInteraction()),
      addListener(this.container, 'touchstart', () => this.onUserInteraction()),
    );
  }
}
