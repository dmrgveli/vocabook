// The word pool's 3D scene. React renders the pills and the centre word; this moves them
// every frame: three rings in perspective, words on fixed seats so they never overlap,
// turning (each ring by its own step, like a combination lock), tilting, a soft cursor
// parallax and a field of faint dots behind. On phones the rings are entered by zooming:
// zoomed out shows "used with it", further in "explains it", all the way in "similar meaning".
// Tested layouts: the seats below never overlap at any resting turn or tilt.

export interface PoolParams {
  /** stage size the radii are designed for; larger stages scale the rings, not the type */
  base: number;
  baseH: number;
  /** seat angles per ring are SLOTS + off */
  off: [number, number, number];
  R: [number, number, number];
  /** ring heights: the closer in meaning, the higher */
  Hs: [number, number, number];
  /** height of the centre word (0: it sits in the middle of the active ring) */
  Hc: number;
  /** camera distance */
  D: number;
  pitch: number;
  pitchMin: number;
  pitchMax: number;
  fs: [number, number, number];
  lift: number;
  dragPx: number;
  /** zoom per level (phones): level 0 = used with it … level 2 = similar meaning */
  zoom?: [number, number, number];
  focusR?: number;
  fade?: number;
}

export const DESKTOP: PoolParams = {
  base: 680,
  baseH: 480,
  off: [45, 45, 0],
  R: [140, 222, 296],
  Hs: [44, 20, 0],
  Hc: 74,
  D: 1700,
  pitch: 0.66,
  pitchMin: 0.6,
  pitchMax: 0.74,
  fs: [19, 16, 14],
  lift: 8,
  dragPx: 110,
};

export const PHONE: PoolParams = {
  // flat rings on phones: the word in the middle stays in the middle of whichever ring is in focus
  base: 276,
  baseH: 300,
  off: [0, 45, 0],
  R: [34, 62, 100],
  Hs: [0, 0, 0],
  Hc: 0,
  D: 900,
  pitch: 0.8,
  pitchMin: 0.8,
  pitchMax: 0.8,
  fs: [17, 16, 14],
  lift: 0,
  dragPx: 70,
  zoom: [1, 1.61, 2.95],
  focusR: 100,
  fade: 34,
};

const SLOTS = [
  [45, 135, 225, 315],
  [0, 90, 180, 270],
  [30, 90, 150, 210, 270, 330],
];
const STEP = [90, 90, 60];
export const RING_VARS = [
  "var(--ring-same)",
  "var(--ring-explains)",
  "var(--ring-used)",
];

export interface Seat {
  el: HTMLElement;
  ring: number;
  slot: number;
}

interface Dot {
  x: number;
  y: number;
  depth: number;
  phase: number;
  speed: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;

export class PoolEngine {
  private seats: Seat[] = [];
  private t = -0.8;
  private target = 0;
  private pitch: number;
  private pitchT: number;
  private level: number;
  private levelT: number;
  private mx = 0;
  private my = 0;
  private born = performance.now();
  private wordsBorn = performance.now();
  private from: [number, number] | undefined;
  private ghostUntil = 0;
  private gesture:
    | {
        x: number;
        y: number;
        t: number;
        pitch: number;
        level: number;
        axis?: "x" | "y";
        pinch?: number;
      }
    | undefined;
  private pointers = new Map<number, [number, number]>();
  private dragged = false;
  private raf = 0;
  private dots: Dot[] = [];
  private dotColor = "#888";
  private colorCheckedAt = 0;
  private lastLevel = -1;
  private wheelTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;

  constructor(
    private root: HTMLElement,
    private svg: SVGSVGElement,
    private canvas: HTMLCanvasElement,
    private center: HTMLElement,
    private p: PoolParams,
    private onLevel?: (level: number) => void,
  ) {
    this.pitch = this.pitchT = p.pitch;
    this.level = this.levelT = 0;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.dots = Array.from({ length: p.zoom ? 46 : 70 }, () => ({
      x: rand(),
      y: rand(),
      depth: 0.25 + rand() * 0.75,
      phase: rand() * 6.28,
      speed: 0.4 + rand() * 0.9,
    }));
    root.addEventListener("pointerdown", this.down);
    window.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.up);
    window.addEventListener("pointercancel", this.up);
    root.addEventListener("pointerleave", this.leave);
    if (p.zoom) root.addEventListener("wheel", this.wheel, { passive: false });
    if (this.reduced) this.t = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.root.removeEventListener("pointerdown", this.down);
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.up);
    window.removeEventListener("pointercancel", this.up);
    this.root.removeEventListener("pointerleave", this.leave);
    this.root.removeEventListener("wheel", this.wheel);
    clearTimeout(this.wheelTimer);
  }

  /** A new word in the middle. `from` is where the chosen word was on screen, so the new rings grow out of it. */
  open(from?: [number, number]) {
    this.from = this.reduced ? undefined : from;
    this.ghostUntil = performance.now() + 700;
    this.born = performance.now();
    this.target = 0;
    this.t = this.reduced ? 0 : -0.8;
    if (this.p.zoom) this.levelT = 0;
  }

  /** The words arrived (or changed): seats in render order. */
  setSeats(seats: Seat[]) {
    this.seats = seats;
    this.wordsBorn = performance.now();
  }

  turn(steps: number) {
    this.target = Math.round(this.target) + steps;
  }

  zoomBy(steps: number) {
    if (this.p.zoom) this.levelT = clamp(Math.round(this.levelT) + steps, 0, 2);
  }

  /** True right after a drag, so the click that ends it doesn't open a word. */
  wasDrag() {
    return this.dragged;
  }

  private down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-pool-ui]")) return;
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = {
        x: 0,
        y: 0,
        t: this.t,
        pitch: this.pitch,
        level: this.level,
        pinch: Math.hypot(a[0] - b[0], a[1] - b[1]),
      };
    } else {
      this.gesture = {
        x: e.clientX,
        y: e.clientY,
        t: this.t,
        pitch: this.pitch,
        level: this.level,
      };
    }
    this.dragged = false;
  };

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) {
      if (this.p.zoom || e.pointerType !== "mouse") return;
      const r = this.root.getBoundingClientRect();
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      this.mx = inside ? ((e.clientX - r.left) / r.width) * 2 - 1 : 0;
      this.my = inside ? ((e.clientY - r.top) / r.height) * 2 - 1 : 0;
      return;
    }
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const g = this.gesture;
    if (!g) return;
    if (g.pinch !== undefined) {
      const [a, b] = [...this.pointers.values()];
      this.level = this.levelT = clamp(
        g.level + (Math.hypot(a[0] - b[0], a[1] - b[1]) - g.pinch) / 110,
        0,
        2,
      );
      this.dragged = true;
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis && Math.hypot(dx, dy) > 6) {
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      this.dragged = true;
    }
    if (g.axis === "x") this.t = this.target = g.t - dx / this.p.dragPx;
    else if (g.axis === "y") {
      // On a touch screen a vertical swipe scrolls the page (touch-action: pan-y); only a
      // mouse drag zooms. Fingers zoom with a pinch or the +/- buttons.
      if (this.p.zoom && e.pointerType !== "mouse") return;
      if (this.p.zoom)
        this.level = this.levelT = clamp(g.level - dy / 110, 0, 2);
      else
        this.pitch = this.pitchT = clamp(
          g.pitch + dy * 0.003,
          this.p.pitchMin,
          this.p.pitchMax,
        );
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId) || this.pointers.size) return;
    this.gesture = undefined;
    this.target = Math.round(this.t);
    if (this.p.zoom) this.levelT = Math.round(this.level);
    setTimeout(() => (this.dragged = false), 0);
  };

  private leave = () => {
    this.mx = 0;
    this.my = 0;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.level = this.levelT = clamp(
      this.level - e.deltaY * (e.ctrlKey ? 0.012 : 0.004),
      0,
      2,
    );
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(
      () => (this.levelT = Math.round(this.level)),
      260,
    );
  };

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const { p } = this;
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    if (!W || !H) return;
    const k = Math.min(W / p.base, H / p.baseH);
    // type scales with the rings below the designed size, so the tested spacing holds
    const type = Math.min(1, k);
    const cx = W / 2;
    const cy = H / 2;
    const ease = this.reduced ? 1 : 0.14;

    if (!this.gesture) {
      this.t += (this.target - this.t) * ease;
      this.level += (this.levelT - this.level) * (this.reduced ? 1 : 0.16);
      this.pitch += (this.pitchT - this.pitch) * (this.reduced ? 1 : 0.12);
    }
    const e = this.reduced
      ? 1
      : 1 - Math.pow(1 - Math.min(1, (now - this.born) / 700), 3);
    const we = this.reduced
      ? 1
      : 1 - Math.pow(1 - Math.min(1, (now - this.wordsBorn) / 450), 3);
    const s = this.from ? 0.3 + 0.7 * e : 0.75 + 0.25 * e;
    let ox = this.from ? (this.from[0] - cx) * (1 - e) : 0;
    let oy = this.from ? (this.from[1] - cy) * (1 - e) : 0;

    let z = 1;
    if (p.zoom) {
      const lf = Math.floor(clamp(this.level, 0, 1.999));
      z = Math.exp(
        Math.log(p.zoom[lf]) +
          (this.level - lf) * (Math.log(p.zoom[lf + 1]) - Math.log(p.zoom[lf])),
      );
      const rounded = Math.round(this.level);
      if (rounded !== this.lastLevel)
        this.onLevel?.((this.lastLevel = rounded));
    }
    const pitch = this.pitch + (p.zoom ? this.level * 0.1 : 0) + this.my * 0.05;
    const c = Math.cos(pitch);
    const sn = Math.sin(pitch);
    const tE = this.t + this.mx * 0.05;
    const P = (X: number, Y: number, Zw: number): [number, number, number] => {
      const kk = p.D / (p.D - (Zw * c + Y * sn));
      return [cx + ox + X * kk, cy + oy + (-Y * c + Zw * sn) * kk, kk];
    };
    // phones: the ring in focus is centred on the stage, and the middle word on that ring's visual middle
    // (perspective draws a ring's middle lower than its geometric centre)
    let centerDrop = 0;
    if (p.zoom && p.focusR) {
      const r = p.focusR * k;
      const mid = (P(0, 0, r)[1] + P(0, 0, -r)[1]) / 2;
      centerDrop = mid - P(0, 0, 0)[1];
      oy += cy + (this.from ? (this.from[1] - cy) * (1 - e) : 0) - mid;
    }

    this.drawDots(now, W, H, tE, pitch, z, k);

    let g = "";
    if (now < this.ghostUntil && this.from) {
      for (const ri of [2, 1, 0]) {
        const rr = p.R[ri] * k * z * (1 - 0.6 * e);
        g += `<path d="${this.ring(P, rr, 0, 48, 90 * e)}" fill="none" style="stroke:${RING_VARS[ri]}" stroke-opacity="${0.5 * (1 - e)}"/>`;
      }
    }
    const vis = (ri: number) =>
      p.zoom && p.focusR && p.fade
        ? clamp(
            1 - Math.abs(p.R[ri] * z * k - p.focusR * k) / (p.fade * k),
            0,
            1,
          )
        : 1;
    const inside = (ri: number) =>
      Boolean(p.zoom && p.focusR && p.R[ri] * z * k < (p.focusR - 8) * k);
    for (const ri of [2, 1, 0]) {
      const v = p.zoom ? Math.max(vis(ri), inside(ri) ? 0.6 : 0) : 1;
      if (v < 0.02) continue;
      const rr = p.R[ri] * k * z * s;
      const width = p.zoom && vis(ri) > 0.5 ? 2 : 1.6;
      g += `<path d="${this.ring(P, rr, p.Hs[ri] * z * e, 64, 0)}" fill="none" style="stroke:${RING_VARS[ri]}" stroke-width="${width}" stroke-opacity="${0.8 * v * e}"/>`;
    }

    for (const seat of this.seats) {
      const ri = seat.ring;
      const a = (SLOTS[ri][seat.slot] + p.off[ri] + tE * STEP[ri]) * DEG;
      const rr = p.R[ri] * k * z * s;
      const q = P(rr * Math.cos(a), p.Hs[ri] * z * e, rr * Math.sin(a));
      const v = vis(ri);
      const lift = p.lift * q[2];
      if (lift && v > 0.05)
        g += `<line x1="${q[0]}" y1="${q[1]}" x2="${q[0]}" y2="${q[1] - lift}" style="stroke:${RING_VARS[ri]}" stroke-opacity="${0.7 * e * v * we}"/>`;
      const dot = inside(ri) ? 0.9 * (1 - v) * e : 0;
      if (dot > 0.02)
        g += `<circle cx="${q[0]}" cy="${q[1]}" r="3" style="fill:${RING_VARS[ri]}" fill-opacity="${dot}"/>`;
      else if (!p.zoom)
        g += `<circle cx="${q[0]}" cy="${q[1]}" r="2.6" style="fill:${RING_VARS[ri]}" fill-opacity="${e * we}"/>`;
      const st = seat.el.style;
      st.left = `${q[0]}px`;
      st.top = `${q[1] - lift}px`;
      st.transform = `translate(-50%, ${lift ? "-100%" : "-50%"})`;
      st.fontSize = `${p.fs[ri] * q[2] * type}px`;
      st.opacity = String(
        e * we * v * (0.8 + 0.2 * clamp((q[2] - 0.9) * 4, 0, 1)),
      );
      st.pointerEvents = v > 0.5 && we > 0.5 ? "auto" : "none";
      st.zIndex = String(Math.round(q[1]));
      seat.el.tabIndex = v > 0.5 ? 0 : -1;
    }

    const qc = P(0, p.Hc * e, 0);
    const cs = this.center.style;
    cs.left = `${qc[0]}px`;
    cs.top = `${qc[1] + centerDrop}px`;
    cs.transform = `translate(-50%, ${p.Hc ? "-100%" : "-50%"}) rotate(-2deg)`;
    cs.zIndex = String(Math.round(qc[1] + 30));
    this.svg.innerHTML = g;
  };

  private ring(
    P: (x: number, y: number, z: number) => [number, number, number],
    r: number,
    y: number,
    n: number,
    drop: number,
  ) {
    let d = "";
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * Math.PI * 2;
      const q = P(r * Math.cos(a), y, r * Math.sin(a));
      d += `${j ? "L" : "M"}${q[0].toFixed(1)} ${(q[1] + drop).toFixed(1)}`;
    }
    return d;
  }

  /** Faint dots at different depths: they drift with the turn, the tilt and the cursor, and come and go slowly. */
  private drawDots(
    now: number,
    W: number,
    H: number,
    t: number,
    pitch: number,
    z: number,
    k: number,
  ) {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    if (now - this.colorCheckedAt > 1000) {
      this.dotColor =
        getComputedStyle(this.root).getPropertyValue("--ink-3").trim() ||
        "#888";
      this.colorCheckedAt = now;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = this.dotColor;
    const zoomOut = Math.log(z);
    for (const d of this.dots) {
      const shiftX = -t * 46 * d.depth * k + this.mx * 14 * d.depth;
      const shiftY =
        (pitch - this.p.pitch) * 260 * d.depth + this.my * 10 * d.depth;
      let x = (((d.x * W + shiftX) % W) + W) % W;
      let y = (((d.y * H + shiftY) % H) + H) % H;
      if (zoomOut) {
        // diving in: the dots stream outwards, the nearer ones faster
        const f = 1 + zoomOut * 0.55 * d.depth;
        x = W / 2 + (x - W / 2) * f;
        y = H / 2 + (y - H / 2) * f;
      }
      const twinkle = this.reduced
        ? 0.6
        : 0.5 + 0.5 * Math.sin((now / 1000) * d.speed + d.phase);
      ctx.globalAlpha = (0.08 + 0.3 * d.depth) * twinkle;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + 1.3 * d.depth, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
