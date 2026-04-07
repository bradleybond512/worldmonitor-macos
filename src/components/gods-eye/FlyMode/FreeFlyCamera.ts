import type { Viewer } from 'cesium';
import {
  FLY_SENSITIVITY,
  FLY_SPEED_SCALE,
  FLY_MIN_SPEED,
  FLY_BOOST_MULTIPLIER,
  FLY_BRAKE_MULTIPLIER,
} from './flyModeKeybinds';

interface KeyState {
  w: boolean; s: boolean; a: boolean; d: boolean;
  q: boolean; e: boolean;
  shift: boolean; ctrl: boolean;
}

export class FreeFlyCamera {
  protected viewer: Viewer;
  protected canvas: HTMLCanvasElement;
  private keys: KeyState = { w:false, s:false, a:false, d:false, q:false, e:false, shift:false, ctrl:false };
  protected pointerLocked = false;

  private removeKeyDown: (() => void) | null = null;
  private removeKeyUp: (() => void) | null = null;
  private removeMouseMove: (() => void) | null = null;
  private removeLockChange: (() => void) | null = null;

  // Bound method references kept as class fields so activate/deactivate share the same reference
  private readonly boundKeyDown = (e: KeyboardEvent) => { this.onKeyDown(e); };
  private readonly boundKeyUp = (e: KeyboardEvent) => { this.onKeyUp(e); };
  private readonly boundMouseMove = (e: MouseEvent) => { this.onMouseMove(e); };
  private readonly boundLockChange = () => { this.pointerLocked = document.pointerLockElement === this.canvas; };

  constructor(viewer: Viewer, canvas: HTMLCanvasElement) {
    this.viewer = viewer;
    this.canvas = canvas;
  }

  activate(): void {
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('pointerlockchange', this.boundLockChange);

    this.removeKeyDown = () => { document.removeEventListener('keydown', this.boundKeyDown); };
    this.removeKeyUp = () => { document.removeEventListener('keyup', this.boundKeyUp); };
    this.removeMouseMove = () => { document.removeEventListener('mousemove', this.boundMouseMove); };
    this.removeLockChange = () => { document.removeEventListener('pointerlockchange', this.boundLockChange); };

    this.canvas.requestPointerLock().catch(() => {/* denied — continue without lock */});
  }

  deactivate(): void {
    this.removeKeyDown?.();
    this.removeKeyUp?.();
    this.removeMouseMove?.();
    this.removeLockChange?.();
    this.removeKeyDown = null;
    this.removeKeyUp = null;
    this.removeMouseMove = null;
    this.removeLockChange = null;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.pointerLocked = false;
    this.keys = { w:false, s:false, a:false, d:false, q:false, e:false, shift:false, ctrl:false };
  }

  update(dt: number): void {
    const camera = this.viewer.camera;
    const alt = camera.positionCartographic.height;
    const base = Math.max(FLY_MIN_SPEED, alt * FLY_SPEED_SCALE);
    const speed = base
      * (this.keys.shift ? FLY_BOOST_MULTIPLIER : 1)
      * (this.keys.ctrl ? FLY_BRAKE_MULTIPLIER : 1);
    const dist = speed * dt;

    if (this.keys.w) camera.moveForward(dist);
    if (this.keys.s) camera.moveBackward(dist);
    if (this.keys.a) camera.moveLeft(dist);
    if (this.keys.d) camera.moveRight(dist);
    if (this.keys.q) camera.moveUp(dist);
    if (this.keys.e) camera.moveDown(dist);
  }

  private onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': { this.keys.w = true; e.preventDefault(); break;
      }
      case 'KeyS': { this.keys.s = true; e.preventDefault(); break;
      }
      case 'KeyA': { this.keys.a = true; e.preventDefault(); break;
      }
      case 'KeyD': { this.keys.d = true; e.preventDefault(); break;
      }
      case 'KeyQ': { this.keys.q = true; e.preventDefault(); break;
      }
      case 'KeyE': { this.keys.e = true; e.preventDefault(); break;
      }
      case 'ShiftLeft': case 'ShiftRight': { this.keys.shift = true; break;
 }
      case 'ControlLeft': case 'ControlRight': { this.keys.ctrl = true; break;
 }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': { this.keys.w = false; break;
      }
      case 'KeyS': { this.keys.s = false; break;
      }
      case 'KeyA': { this.keys.a = false; break;
      }
      case 'KeyD': { this.keys.d = false; break;
      }
      case 'KeyQ': { this.keys.q = false; break;
      }
      case 'KeyE': { this.keys.e = false; break;
      }
      case 'ShiftLeft': case 'ShiftRight': { this.keys.shift = false; break;
 }
      case 'ControlLeft': case 'ControlRight': { this.keys.ctrl = false; break;
 }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked) return;
    const camera = this.viewer.camera;
    const dx = e.movementX * FLY_SENSITIVITY;
    const dy = e.movementY * FLY_SENSITIVITY;
    if (dx !== 0) camera.lookRight(dx);
    if (dy !== 0) camera.lookDown(dy);
  }
}
