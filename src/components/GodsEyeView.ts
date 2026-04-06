import { CesiumGlobe } from '@/components/CesiumGlobe';

export class GodsEyeView {
  private container: HTMLElement;
  private globe: CesiumGlobe | null = null;
  private active = false;
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

  async enter(): Promise<void> {
    if (this.active) return;
    this.active = true;

    // Make container visible BEFORE Cesium init — ensures canvas gets real dimensions
    this.container.classList.add('gods-eye-active');

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
