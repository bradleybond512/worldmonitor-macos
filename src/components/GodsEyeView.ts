import { CesiumGlobe } from '@/components/CesiumGlobe';

export class GodsEyeView {
  private container: HTMLElement;
  private globe: CesiumGlobe | null = null;
  private active = false;
  private ionToken: string | undefined;
  private wheelCapture: ((e: WheelEvent) => void) | null = null;

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

    // Make container visible BEFORE Cesium init — ensures canvas gets real dimensions
    this.container.classList.add('gods-eye-active');
    // Prevent WKWebView's NSScrollView from consuming wheel events for elastic bounce.
    // Capture-phase listener fires before any element handlers — tells the browser
    // NOT to do its own scrolling, so the event reaches Cesium's canvas handler intact.
    document.body.classList.add('gods-eye-lock');
    this.wheelCapture = (e: WheelEvent) => {
      if (this.container.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', this.wheelCapture, { passive: false, capture: true });

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
      return;
    }
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;

    // Animate out
    this.container.classList.remove('gods-eye-active');
    document.body.classList.remove('gods-eye-lock');
    if (this.wheelCapture) {
      document.removeEventListener('wheel', this.wheelCapture, { capture: true } as EventListenerOptions);
      this.wheelCapture = null;
    }

    // Cleanup after animation completes
    setTimeout(() => {
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
}
