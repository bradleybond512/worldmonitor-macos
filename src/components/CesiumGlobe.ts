import {
  Viewer,
  IonImageryProvider,
  ImageryLayer,
  UrlTemplateImageryProvider,
  Terrain,
  SceneMode,
  Color,
  type Scene,
  type Camera,
  type ImageryProvider,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { initCesium } from '@/config/cesium-init';

export interface CesiumGlobeOptions {
  container: HTMLElement;
  ionToken?: string;
}

export class CesiumGlobe {
  private viewer: Viewer | null = null;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private fallbackAdded = false;

  constructor(private readonly options: CesiumGlobeOptions) {
    this.container = options.container;
  }

  async initialize(): Promise<void> {
    initCesium(this.options.ionToken);

    const cesiumContainer = document.createElement('div');
    cesiumContainer.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;';
    this.container.append(cesiumContainer);

    const hasToken = Boolean(this.options.ionToken);

    this.viewer = new Viewer(cesiumContainer, {
      sceneMode: SceneMode.SCENE3D,
      animation: false,
      baseLayerPicker: false,
      baseLayer: false,
      terrain: hasToken ? Terrain.fromWorldTerrain() : undefined,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      shadows: false,
      contextOptions: {
        webgl: {
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        },
      },
      msaaSamples: 4,
      useBrowserRecommendedResolution: false,
    });

    const scene = this.viewer.scene;
    const globe = scene.globe;

    // ── Resolution ──────────────────────────────────────
    this.viewer.resolutionScale = Math.min(window.devicePixelRatio, 2);

    // ── Sky & Space ────────────────────────────────────
    scene.backgroundColor = Color.fromCssColorString('#050510');
    // Dark charcoal — visually distinct from Cesium's pink missing-tile fallback
    globe.baseColor = Color.fromCssColorString('#1a1a1a');

    // Sun and moon
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;

    // ── Globe Lighting ─────────────────────────────────
    globe.enableLighting = false;
    globe.showGroundAtmosphere = true;

    // Sky atmosphere
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.hueShift = -0.05;
      scene.skyAtmosphere.saturationShift = 0.15;
      scene.skyAtmosphere.brightnessShift = -0.05;
    }

    // ── Terrain ────────────────────────────────────────
    scene.verticalExaggeration = 1.5;
    scene.verticalExaggerationRelativeHeight = 0;

    // ── Fog & Depth ────────────────────────────────────
    scene.fog.enabled = true;
    scene.fog.density = 2e-4;
    scene.fog.minimumBrightness = 0.03;

    // ── Post-Processing ────────────────────────────────
    scene.postProcessStages.fxaa.enabled = true;
    scene.postProcessStages.bloom.enabled = false;
    scene.postProcessStages.ambientOcclusion.enabled = false;
    scene.highDynamicRange = true;

    // ── Camera Controls ────────────────────────────────
    const controller = scene.screenSpaceCameraController;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableLook = true;
    controller.minimumZoomDistance = 250;
    controller.maximumZoomDistance = 5e7;

    // ── Imagery Layers ─────────────────────────────────
    this.viewer.imageryLayers.removeAll();

    if (hasToken) {
      await this.addPrimaryIonImagery();
    } else {
      this.log('INFO', '[globe] no Ion token — using ArcGIS imagery directly');
      this.addFallbackImagery('no-token');
    }

    // Safety net: if nothing got added (both paths somehow silent-failed), force ArcGIS
    if (this.viewer.imageryLayers.length === 0) {
      this.log('ERROR', '[globe] no imagery layers after init — falling back to ArcGIS');
      this.addFallbackImagery('post-init-safety');
    }

    // ── Resize Observer ────────────────────────────────
    this.resizeObserver = new ResizeObserver(() => {
      this.viewer?.resize();
    });
    this.resizeObserver.observe(this.container);

    // ── WebGL context loss handlers ────────────────────
    const canvas = this.viewer.canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.log('WARN', 'CesiumGlobe webglcontextlost — GPU context dropped');
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      this.log('INFO', 'CesiumGlobe webglcontextrestored — re-rendering');
      this.viewer?.scene.requestRender();
    }, false);
  }

  private async addPrimaryIonImagery(): Promise<void> {
    if (!this.viewer) return;

    let layer: ImageryLayer;
    try {
      // Use fromProviderAsync so Cesium manages the async load internally and
      // exposes errorEvent/readyEvent on the layer itself — the older pattern of
      // awaiting fromAssetId and then calling addImageryProvider only catches the
      // provider-creation error, not per-tile fetch failures.
      layer = ImageryLayer.fromProviderAsync(
        IonImageryProvider.fromAssetId(2, {}),
      );
      this.viewer.imageryLayers.add(layer);
    } catch (error) {
      this.log('WARN', `[globe] Ion imagery provider construction threw synchronously: ${String(error)} — falling back to ArcGIS`);
      this.addFallbackImagery('sync-throw');
      return;
    }

    // Style the layer
    layer.alpha = 1;
    layer.brightness = 1.1;
    layer.contrast = 1.15;
    layer.saturation = 1.2;

    // Track whether ready arrived within the sentinel window
    let providerReady = false;

    // layer.errorEvent fires if the async provider creation fails (e.g. Ion
    // returns 401/403 on the asset-metadata request).
    layer.errorEvent.addEventListener((err: Error) => {
      this.log('WARN', `[globe] Ion imagery layer errorEvent: ${err?.message ?? String(err)} — falling back to ArcGIS`);
      this.addFallbackImagery('layer-error-event');
    });

    // layer.readyEvent fires once the provider is live. At that point we can
    // subscribe to per-tile errors on the underlying imageryProvider.
    layer.readyEvent.addEventListener((provider: ImageryProvider) => {
      providerReady = true;
      this.log('INFO', '[globe] Ion imagery layer ready — subscribing to tile error events');

      provider.errorEvent.addEventListener((tileErr: unknown) => {
        const msg = tileErr instanceof Error ? tileErr.message : String(tileErr);
        this.log('WARN', `[globe] Ion tile load error: ${msg} — switching to ArcGIS fallback`);
        this.addFallbackImagery('tile-error');
      });
    });

    // Sentinel: if the layer isn't ready within 5 s, assume the token is bad
    // or the network is blocking Ion, and switch to ArcGIS.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!providerReady) {
          this.log('WARN', '[globe] Ion imagery layer not ready after 5 s — falling back to ArcGIS');
          this.addFallbackImagery('sentinel-timeout');
        }
        resolve();
      }, 5000);

      layer.readyEvent.addEventListener(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private addFallbackImagery(reason: string): void {
    if (!this.viewer) return;

    // Only add the fallback once per session — tile errors fire per-tile, so
    // without this guard we'd stack dozens of ArcGIS layers.
    if (this.fallbackAdded) return;
    this.fallbackAdded = true;

    this.log('INFO', `[globe] adding ArcGIS fallback imagery (reason=${reason})`);

    const satImagery = new UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: 'Esri, Maxar, Earthstar Geographics',
      maximumLevel: 19,
    });
    const layer = this.viewer.imageryLayers.addImageryProvider(satImagery);
    layer.alpha = 1;
    layer.brightness = 1.1;
    layer.contrast = 1.1;
    layer.saturation = 1.15;
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
    void import('@/services/log-bridge').then((m) => {
      m.logToDesktop(level, msg);
    });
  }

  get scene(): Scene | undefined {
    return this.viewer?.scene;
  }

  get camera(): Camera | undefined {
    return this.viewer?.camera;
  }

  get cesiumViewer(): Viewer | undefined {
    return this.viewer ?? undefined;
  }

  get canvas(): HTMLCanvasElement | undefined {
    return this.viewer?.canvas;
  }

  setLightingEnabled(enabled: boolean): void {
    const scene = this.viewer?.scene;
    if (!scene) return;
    scene.globe.enableLighting = enabled;
    scene.globe.dynamicAtmosphereLighting = enabled;
    scene.globe.dynamicAtmosphereLightingFromSun = enabled;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.brightnessShift = enabled ? 0 : -0.05;
    }
    scene.requestRender();
  }

  getLightingEnabled(): boolean {
    return this.viewer?.scene.globe.enableLighting ?? false;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
    this.viewer = null;
  }
}
