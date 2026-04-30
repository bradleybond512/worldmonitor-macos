/**
 * Globe4DManager — orchestrator for God's Eye 4D mode.
 *
 * Foundation skeleton. Owns the on/off toggle and broadcasts state changes
 * to subscribers (HUD, future swimlane / playback / trails / pillars /
 * degradation / predictions / branching components).
 *
 * Visual sub-components are deferred to follow-up PRs per the plan at
 * docs/superpowers/plans/2026-04-13-gods-eye-4d.md. This class exposes the
 * lifecycle hooks they will plug into so the wiring in `GodsEyeView` and
 * `GlobeHUD` is stable across those PRs.
 *
 * Spec: docs/superpowers/specs/2026-04-13-gods-eye-4d-design.md
 */

import type { GlobeDataManager } from '@/components/GlobeDataManager';
import type { GlobeTimeMachine } from '@/components/GlobeTimeMachine';
import type { GlobeHUD } from '@/components/GlobeHUD';
import { GlobeSwimlane } from '@/components/gods-eye/GlobeSwimlane';

export type PlaybackMode = 'documentary' | 'director' | 'heartbeat';

export interface Globe4DState {
  /** True when the user has toggled 4D mode on (e.g. via the `T` key). */
  active: boolean;
  /** Currently selected playback mode. Defaults to documentary. */
  playbackMode: PlaybackMode;
  /** Active trail count — populated when GlobeTrails lands. */
  trailCount: number;
  /** Forecast-entity count — populated when GlobeDegradation lands. */
  forecastCount: number;
}

export interface Globe4DManagerDeps {
  hud?: GlobeHUD | null;
  timeMachine?: GlobeTimeMachine | null;
  dataManager?: GlobeDataManager | null;
  /** DOM node the swimlane mounts into. Usually the God's Eye container. */
  overlayContainer?: HTMLElement | null;
}

const SWIMLANE_REFRESH_MS = 1500;

export class Globe4DManager {
  private state: Globe4DState = {
    active: false,
    playbackMode: 'documentary',
    trailCount: 0,
    forecastCount: 0,
  };
  private listeners: ((state: Readonly<Globe4DState>) => void)[] = [];
  private deps: Globe4DManagerDeps;
  private unsubTimeChange: (() => void) | null = null;
  private swimlane: GlobeSwimlane | null = null;
  private swimlaneRefreshId: ReturnType<typeof setInterval> | null = null;

  constructor(deps: Globe4DManagerDeps) {
    this.deps = deps;
  }

  /** Idempotent enable. Wires sub-components when they exist. */
  enable(): void {
    if (this.state.active) return;
    this.state = { ...this.state, active: true };
    document.body.classList.add('gods-eye-4d-active');

    this.mountSwimlane();

    // Drive swimlane NOW line from time-machine state, and surface time
    // updates to future degradation/trail consumers via a single hook.
    this.unsubTimeChange = this.deps.timeMachine?.onTimeChange((ms) => {
      this.swimlane?.updateNow(ms);
    }) ?? null;

    this.broadcast();
  }

  /** Idempotent disable. Tears down any active sub-component. */
  disable(): void {
    if (!this.state.active) return;
    this.state = { ...this.state, active: false };
    document.body.classList.remove('gods-eye-4d-active');

    if (this.unsubTimeChange) {
      this.unsubTimeChange();
      this.unsubTimeChange = null;
    }

    this.unmountSwimlane();

    this.broadcast();
  }

  toggle(): void {
    if (this.state.active) this.disable();
    else this.enable();
  }

  isActive(): boolean { return this.state.active; }

  setPlaybackMode(mode: PlaybackMode): void {
    if (this.state.playbackMode === mode) return;
    this.state = { ...this.state, playbackMode: mode };
    this.broadcast();
  }

  getState(): Readonly<Globe4DState> { return this.state; }

  /**
   * Subscribe to 4D state changes. Returns an unsubscribe function.
   * Listeners are invoked synchronously after state is updated.
   */
  onChange(listener: (state: Readonly<Globe4DState>) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  destroy(): void {
    this.disable();
    this.listeners = [];
  }

  private mountSwimlane(): void {
    const container = this.deps.overlayContainer;
    const dataManager = this.deps.dataManager;
    if (!container || !dataManager) return; // running headless or pre-mount

    this.swimlane = new GlobeSwimlane(container);
    this.swimlane.setOnTimeChange((ms) => { this.deps.timeMachine?.setTime(ms); });
    this.swimlane.setOnEventClick((block) => {
      // Future PR (Tier 2 deep analysis) will fly camera to block.lat/lon
      // and open prediction overlays. For now, just scrub time to the event.
      this.deps.timeMachine?.setTime(block.startMs);
    });
    this.swimlane.setOnLaneToggle((category) => {
      // Lane labels toggle the contributing data layers. The mapping lives
      // in GlobeDataManager (SWIMLANE_CATEGORY_MAP) but isn't currently
      // exported; for the swimlane MVP we leave this as a no-op hook so
      // future PRs can wire layer visibility via a public method.
      // eslint-disable-next-line no-console
      console.debug('[Globe4DManager] lane toggle (no-op pending layer-visibility hook):', category);
    });
    this.swimlane.mount();
    this.refreshSwimlaneBlocks();
    this.swimlaneRefreshId = setInterval(() => this.refreshSwimlaneBlocks(), SWIMLANE_REFRESH_MS);
  }

  private unmountSwimlane(): void {
    if (this.swimlaneRefreshId != null) {
      clearInterval(this.swimlaneRefreshId);
      this.swimlaneRefreshId = null;
    }
    this.swimlane?.destroy();
    this.swimlane = null;
  }

  private refreshSwimlaneBlocks(): void {
    if (!this.swimlane || !this.deps.dataManager) return;
    try {
      const blocks = this.deps.dataManager.getEventBlocks();
      this.swimlane.updateBlocks(blocks);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Globe4DManager] getEventBlocks failed', error);
    }
  }

  private broadcast(): void {
    for (const listener of this.listeners) {
      try { listener(this.state); }
      catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Globe4DManager] listener threw', error);
      }
    }
  }
}
