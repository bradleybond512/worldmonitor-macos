import type { Viewer } from 'cesium';
import { FreeFlyCamera } from './FreeFlyCamera';
import { CinematicPath } from './CinematicPath';
import { ChaseCamera } from './ChaseCamera';
import { CityFlyMode } from './CityFlyMode';
import { FLY_SUB_MODE_NAMES, type FlySubMode } from './flyModeKeybinds';
import type { FollowTarget } from '@/components/gods-eye/AutoFollowEngine';
import type { BuildingTileManager } from '@/services/building-tiles';

export interface FlyModeStatus {
  active: boolean;
  subMode: FlySubMode;
  subModeName: string;
  chaseCockpit?: boolean;
}

export class FlyModeController {
  private viewer: Viewer;
  private canvas: HTMLCanvasElement;
  private buildingTiles: BuildingTileManager;
  private getPriorityTargets: (n: number) => FollowTarget[];
  private _active = false;
  private _subMode: FlySubMode = 1;

  private freeFly: FreeFlyCamera | null = null;
  private cinematic: CinematicPath | null = null;
  private chase: ChaseCamera | null = null;
  private cityFly: CityFlyMode | null = null;

  private preUpdateRemover: (() => void) | null = null;
  private lastFrameMs = 0;
  private readonly preUpdateHandler = () => { this.onFrame(); };
  private onStatusChange: ((status: FlyModeStatus) => void) | null = null;

  constructor(
    viewer: Viewer,
    canvas: HTMLCanvasElement,
    buildingTiles: BuildingTileManager,
    getPriorityTargets: (n: number) => FollowTarget[],
  ) {
    this.viewer = viewer;
    this.canvas = canvas;
    this.buildingTiles = buildingTiles;
    this.getPriorityTargets = getPriorityTargets;
  }

  setOnStatusChange(cb: (status: FlyModeStatus) => void): void {
    this.onStatusChange = cb;
  }

  get isActive(): boolean {
    return this._active;
  }

  get currentSubMode(): FlySubMode {
    return this._subMode;
  }

  enter(startSubMode: FlySubMode = 1): void {
    if (this._active) return;
    this._active = true;

    // Disable orbit camera controller — we take over completely
    this.setOrbitEnabled(false);

    // Switch Cesium to continuous rendering so frames fire even without input
    this.viewer.scene.requestRenderMode = false;

    // Hook per-frame update
    this.lastFrameMs = performance.now();
    this.preUpdateRemover = this.viewer.scene.preUpdate.addEventListener(this.preUpdateHandler);

    this.activateSubMode(startSubMode);
  }

  exit(): void {
    if (!this._active) return;
    this._active = false;

    this.destroyActiveSubMode();

    // Remove frame listener
    this.preUpdateRemover?.();
    this.preUpdateRemover = null;

    // Restore on-demand rendering
    this.viewer.scene.requestRenderMode = true;

    // Restore orbit controller
    this.setOrbitEnabled(true);

    // Release pointer lock if held
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    this.emitStatus();
  }

  switchSubMode(subMode: FlySubMode): void {
    if (!this._active) return;
    if (this._subMode === subMode) return;
    this.destroyActiveSubMode();
    this.activateSubMode(subMode);
  }

  /** Called from GodsEyeView when a click picks an entity during Chase mode. */
  attachChaseTarget(entity: import('cesium').Entity): void {
    if (this._subMode === 3 && this.chase) {
      this.chase.attachToEntity(entity);
      this.emitStatus();
    }
  }

  /** Toggle cockpit / 3rd-person in Chase mode. */
  toggleCockpit(): void {
    this.chase?.toggleCockpit();
    this.emitStatus();
  }

  getStatus(): FlyModeStatus {
    return {
      active: this._active,
      subMode: this._subMode,
      subModeName: FLY_SUB_MODE_NAMES[this._subMode],
      chaseCockpit: this.chase?.isCockpit,
    };
  }

  destroy(): void {
    this.exit();
    this.onStatusChange = null;
  }

  // ── Private ──────────────────────────────────────────

  private activateSubMode(subMode: FlySubMode): void {
    this._subMode = subMode;

    switch (subMode) {
      case 1: {
        this.freeFly = new FreeFlyCamera(this.viewer, this.canvas);
        this.freeFly.activate();
        break;
      }
      case 2: {
        const targets = this.getPriorityTargets(20);
        if (targets.length >= 2) {
          this.cinematic = new CinematicPath(this.viewer, targets);
        } else {
          // Not enough targets — fall back to free fly
          this.freeFly = new FreeFlyCamera(this.viewer, this.canvas);
          this.freeFly.activate();
          this._subMode = 1;
        }
        break;
      }
      case 3: {
        this.chase = new ChaseCamera(this.viewer);
        // If a click handler is wired, the user will click to pick a target.
        // Pre-attach to the first priority target if available.
        const targets = this.getPriorityTargets(1);
        if (targets.length > 0) {
          // Targets are FollowTarget objects (lat/lon/id), not entities.
          // Chase cam will pick up an entity on the next click through attachChaseTarget().
        }
        break;
      }
      case 4: {
        this.cityFly = new CityFlyMode(this.viewer, this.canvas, this.buildingTiles);
        this.cityFly.activate();
        break;
      }
    }

    this.emitStatus();
  }

  private destroyActiveSubMode(): void {
    this.freeFly?.deactivate();
    this.freeFly = null;
    this.cinematic?.destroy();
    this.cinematic = null;
    this.chase?.detach();
    this.chase = null;
    this.cityFly?.deactivate();
    this.cityFly = null;
  }

  private onFrame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameMs) / 1000, 0.1); // cap dt at 100ms
    this.lastFrameMs = now;

    const time = this.viewer.clock.currentTime;

    switch (this._subMode) {
      case 1: { this.freeFly?.update(dt); break;
      }
      case 2: { this.cinematic?.update(dt); break;
      }
      case 3: { this.chase?.update(dt, time); break;
      }
      case 4: { this.cityFly?.update(dt); break;
      }
    }
  }

  private setOrbitEnabled(enabled: boolean): void {
    const ctrl = this.viewer.scene.screenSpaceCameraController;
    ctrl.enableZoom = enabled;
    ctrl.enableRotate = enabled;
    ctrl.enableTilt = enabled;
    ctrl.enableLook = enabled;
    ctrl.enableTranslate = enabled;
  }

  private emitStatus(): void {
    this.onStatusChange?.(this.getStatus());
  }
}
