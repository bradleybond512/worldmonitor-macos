import type { AppMode } from '@/services/mode-manager';

const MODE_CONFIG: Record<AppMode, { freq: number; gain: number; lfo: number }> = {
  peace:   { freq: 60,  gain: 0.04, lfo: 0.3 },
  finance: { freq: 80,  gain: 0.06, lfo: 0.5 },
  war:     { freq: 40,  gain: 0.1, lfo: 1.2 },
  disaster:{ freq: 50,  gain: 0.09, lfo: 0.9 },
  ghost:   { freq: 30,  gain: 0.05, lfo: 0.2 },
};

export class GlobeAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfoGain: GainNode | null = null;
  private enabled = false;

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.ctx = new AudioContext();
    const ctx = this.ctx;

    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = 60;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    this.lfoOsc = ctx.createOscillator();
    this.lfoOsc.type = 'sine';
    this.lfoOsc.frequency.value = 0.3;

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.01;

    this.lfoOsc.connect(this.lfoGain);
    this.lfoGain.connect(this.gainNode.gain);
    this.osc.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);

    this.osc.start();
    this.lfoOsc.start();

    this.gainNode.gain.setTargetAtTime(0.04, ctx.currentTime, 1.5);
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      window.setTimeout(() => {
        this.osc?.stop();
        this.lfoOsc?.stop();
        void this.ctx?.close();
        this.ctx = null;
        this.osc = null;
        this.lfoOsc = null;
        this.gainNode = null;
        this.lfoGain = null;
      }, 2000);
    }
  }

  setMode(mode: AppMode): void {
    if (!this.ctx || !this.osc || !this.gainNode || !this.lfoOsc) return;
    const cfg = MODE_CONFIG[mode];
    const t = this.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(cfg.freq, t, 2);
    this.gainNode.gain.setTargetAtTime(cfg.gain, t, 2);
    this.lfoOsc.frequency.setTargetAtTime(cfg.lfo, t, 2);
  }

  isEnabled(): boolean { return this.enabled; }
}
