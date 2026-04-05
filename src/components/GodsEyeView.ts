import { CesiumGlobe } from '@/components/CesiumGlobe';
import { ThreeOverlay } from '@/components/ThreeOverlay';
import { GlobeHUD, type HUDState } from '@/components/GlobeHUD';
import { Cartographic, Math as CesiumMath, Cartesian3 } from 'cesium';

export class GodsEyeView {
  private container: HTMLElement;
  private globe: CesiumGlobe | null = null;
  private threeOverlay: ThreeOverlay | null = null;
  private hud: GlobeHUD | null = null;
  private active = false;
  private renderLoopId: number | null = null;
  private ionToken: string | undefined;

  constructor(ionToken?: string) {
    this.ionToken = ionToken;
    this.container = document.createElement('div');
    this.container.className = 'gods-eye-container';
    document.body.append(this.container);
  }

  get isActive(): boolean {
    return this.active;
  }

  async enter(centerLon?: number, centerLat?: number): Promise<void> {
    if (this.active) return;
    this.active = true;

    try {
      // Initialize Cesium globe
      this.globe = new CesiumGlobe({
        container: this.container,
        ionToken: this.ionToken,
      });
      await this.globe.initialize();

      // Initialize Three.js overlay
      this.threeOverlay = new ThreeOverlay({
        container: this.container,
        enableBloom: true,
      });
      this.threeOverlay.initialize();
    } catch (error) {
      // eslint-disable-next-line no-console -- surface GPU crash diagnostics
      console.error('[GodsEyeView] WebGL initialization failed:', error);
      this.globe?.destroy();
      this.globe = null;
      this.threeOverlay?.destroy();
      this.threeOverlay = null;
      this.active = false;
      return;
    }

    // Initialize HUD
    this.hud = new GlobeHUD(this.container);
    this.hud.setOnExit(() => { this.exit(); });
    this.hud.setOnLayerToggle((key, enabled) => { this.handleLayerToggle(key, enabled); });

    // Fly to initial position or default orbital view
    const lon = centerLon ?? 0;
    const lat = centerLat ?? 20;
    this.globe.cesiumViewer?.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, 20_000_000),
      duration: 2,
    });

    // Start render loop
    this.startRenderLoop();

    // Animate in
    requestAnimationFrame(() => {
      this.container.classList.add('gods-eye-active');
    });
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;

    // Animate out
    this.container.classList.remove('gods-eye-active');

    // Cleanup after animation completes
    setTimeout(() => {
      this.stopRenderLoop();
      this.hud?.destroy();
      this.hud = null;
      this.threeOverlay?.destroy();
      this.threeOverlay = null;
      this.globe?.destroy();
      this.globe = null;
    }, 600);
  }

  toggle(centerLon?: number, centerLat?: number): void {
    if (this.active) {
      this.exit();
    } else {
      void this.enter(centerLon, centerLat);
    }
  }

  private startRenderLoop(): void {
    const loop = (): void => {
      if (!this.active) return;
      this.syncThreeToCamera();
      this.threeOverlay?.render();
      this.updateHUDState();
      this.renderLoopId = requestAnimationFrame(loop);
    };
    this.renderLoopId = requestAnimationFrame(loop);
  }

  private stopRenderLoop(): void {
    if (this.renderLoopId !== null) {
      cancelAnimationFrame(this.renderLoopId);
      this.renderLoopId = null;
    }
  }

  private syncThreeToCamera(): void {
    const camera = this.globe?.camera;
    if (!camera || !this.threeOverlay) return;

    const frustum = camera.frustum as {
      fov?: number;
      aspectRatio?: number;
      near?: number;
      far?: number;
      projectionMatrix?: { toArray?: () => number[] };
    };
    this.threeOverlay.syncCamera(
      camera.viewMatrix,
      camera.frustum.projectionMatrix,
      CesiumMath.toDegrees(frustum.fov ?? 1),
      frustum.aspectRatio ?? 1,
      frustum.near ?? 0.1,
      frustum.far ?? 500_000_000,
    );
  }

  private updateHUDState(): void {
    const camera = this.globe?.camera;
    if (!camera || !this.hud) return;

    try {
      const carto = Cartographic.fromCartesian(camera.position);
      const state: Partial<HUDState> = {
        cameraAltitude: carto.height,
        cameraLat: CesiumMath.toDegrees(carto.latitude),
        cameraLon: CesiumMath.toDegrees(carto.longitude),
      };
      this.hud.updateState(state);
    } catch {
      // Camera position may not be convertible during transitions
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleLayerToggle(_layerKey: string, _layerEnabled: boolean): void {
    // Phase 2 layers will register handlers here
  }

  destroy(): void {
    this.exit();
    this.container.remove();
  }
}
