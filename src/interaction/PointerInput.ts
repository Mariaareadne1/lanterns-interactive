import type { LanternsApp } from '../app/LanternsApp';
import { DrawingOverlay } from './DrawingOverlay';
import { smooth, strokeLength, type Pt } from './stroke';

/**
 * One pointer state machine for mouse, pen and touch:
 *   press on a lantern  → select it
 *   press anywhere else → draw a lantern (a closed loop)
 * A second finger, pointercancel or Escape abandons a stroke cleanly.
 */

type Gesture =
  | { kind: 'none' }
  | { kind: 'press'; id: string; x: number; y: number; pointerId: number }
  | { kind: 'stroke'; points: Pt[]; pointerId: number };


export class PointerInput {
  private gesture: Gesture = { kind: 'none' };
  private readonly overlay: DrawingOverlay;
  private readonly activePointers = new Set<number>();
  private hoverRaf = 0;
  private lastHover: { x: number; y: number } | null = null;
  /** Feedback hook (toasts) for rejected strokes. */
  onMessage: ((text: string) => void) | null = null;

  constructor(private readonly el: HTMLElement, private readonly app: LanternsApp) {
    this.overlay = new DrawingOverlay(el);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('lostpointercapture', this.lost);
    el.addEventListener('contextmenu', this.noMenu);
  }

  get isDrawing(): boolean {
    return this.gesture.kind === 'stroke';
  }

  get ink(): SVGSVGElement {
    return this.overlay.svg;
  }

  /** Only the canvas itself is drawable; the interface floats above it. */
  private onCanvas(e: Event): boolean {
    return (e.target as Element | null)?.tagName === 'CANVAS';
  }

  private down = (e: PointerEvent) => {
    if (!this.onCanvas(e)) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.activePointers.add(e.pointerId);
    if (this.activePointers.size > 1) {
      this.abort(); // pinch / two-finger: not ours
      return;
    }
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone (or synthetic); events still arrive on the element
    }
    const sel = this.app.pickAt(e.clientX, e.clientY);
    if (sel) {
      this.app.select(sel);
      this.gesture = { kind: 'press', id: sel.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      return;
    }
    this.gesture = { kind: 'stroke', points: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], pointerId: e.pointerId };
    this.overlay.begin();
    this.app.store.set({ selection: null, reading: null });
  };

  private move = (e: PointerEvent) => {
    const g = this.gesture;
    if (g.kind === 'none') {
      if (!this.onCanvas(e)) return;
      this.lastHover = { x: e.clientX, y: e.clientY };
      if (!this.hoverRaf) this.hoverRaf = requestAnimationFrame(this.hover);
      return;
    }
    if ('pointerId' in g && g.pointerId !== e.pointerId) return;
    if (g.kind === 'press') return;
    if (g.kind === 'stroke') {
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const c of events.length ? events : [e]) g.points.push({ x: c.clientX, y: c.clientY, t: c.timeStamp || e.timeStamp });
      this.overlay.update(smooth(g.points, 1));
    }
  };

  private up = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    const g = this.gesture;
    if (g.kind === 'none' || ('pointerId' in g && g.pointerId !== e.pointerId)) return;
    this.gesture = { kind: 'none' };
    if (g.kind === 'stroke') this.finishStroke(g.points);
    this.updateHover(e.clientX, e.clientY);
  };

  private finishStroke(points: Pt[]): void {
    if (strokeLength(points) < 8) {
      // a tap on the night: just clears the selection
      this.overlay.settle(null);
      return;
    }
    const result = this.app.createFromStroke(points);
    if (!result.ok) {
      this.overlay.settle(null);
      this.onMessage?.(result.message);
      return;
    }
    // the pen line fades as the brush paints the lantern in
    this.overlay.settle(result.id);
  }

  private cancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    this.abort();
  };

  private lost = (e: PointerEvent) => {
    // capture lost without pointerup (e.g. window blur): treat as cancel
    if ('pointerId' in this.gesture && this.gesture.pointerId === e.pointerId && !this.activePointers.has(e.pointerId)) this.abort();
  };

  /** Abandon whatever is in progress without creating or committing anything. */
  abort(): void {
    const g = this.gesture;
    this.gesture = { kind: 'none' };
    if (g.kind === 'stroke') this.overlay.settle(null);
  }

  private noMenu = (e: Event) => e.preventDefault();

  private hover = () => {
    this.hoverRaf = 0;
    if (this.lastHover) this.updateHover(this.lastHover.x, this.lastHover.y);
  };

  private updateHover(x: number, y: number): void {
    const sel = this.app.pickAt(x, y);
    this.app.hoverId = sel?.id ?? null;
    if (sel) this.setCursor('pointer');
    else this.setCursor(this.app.canDrawAt(x, y) ? 'draw' : 'nope');
  }

  private setCursor(c: 'draw' | 'nope' | 'pointer'): void {
    this.el.dataset.cursor = c;
  }

  dispose(): void {
    cancelAnimationFrame(this.hoverRaf);
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
    this.el.removeEventListener('lostpointercapture', this.lost);
    this.el.removeEventListener('contextmenu', this.noMenu);
    this.overlay.dispose();
  }
}
