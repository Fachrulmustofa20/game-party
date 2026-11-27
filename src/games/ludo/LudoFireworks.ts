interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  size: number;
  color: string;
}

const PALETTE = ['#ef4444', '#facc15', '#22c55e', '#38bdf8', '#e879f9', '#fb923c', '#ffffff'];

export class LudoFireworks {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rockets: Rocket[] = [];
  private sparks: Spark[] = [];
  private spawnTimer = 0;
  private active = false;
  private accentColor = '#facc15';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  start(accentColor: string): void {
    this.accentColor = accentColor;
    this.rockets = [];
    this.sparks = [];
    this.spawnTimer = 0;
    this.active = true;
    this.canvas.style.display = 'block';
    this.resize();
    this.launchRocket(0.25);
    this.launchRocket(0.5);
    this.launchRocket(0.75);
  }

  stop(): void {
    this.active = false;
    this.rockets = [];
    this.sparks = [];
    this.canvas.style.display = 'none';
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35 + Math.random() * 0.35;
      this.launchRocket(0.15 + Math.random() * 0.7);
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vy += 220 * dt;

      ctx.beginPath();
      ctx.arc(r.x, r.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = r.color;
      ctx.fill();

      if (r.y <= r.targetY || r.vy >= -40) {
        this.explode(r.x, r.y, r.color);
        this.rockets.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.px = s.x;
      s.py = s.y;
      s.vx *= Math.pow(0.96, dt * 60);
      s.vy *= Math.pow(0.96, dt * 60);
      s.vy += 260 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alpha -= s.decay * dt;

      if (s.alpha <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.px, s.py);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private launchRocket(xRatio: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x = w * xRatio;
    const targetY = h * (0.18 + Math.random() * 0.34);
    const color =
      Math.random() < 0.35
        ? this.accentColor
        : PALETTE[Math.floor(Math.random() * PALETTE.length)];
    this.rockets.push({
      x,
      y: h + 10,
      vx: (Math.random() - 0.5) * 90,
      vy: -(540 + Math.random() * 200),
      targetY,
      color,
    });
  }

  private explode(x: number, y: number, primaryColor: string): void {
    const count = 48 + Math.floor(Math.random() * 22);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.18;
      const speed = 110 + Math.random() * 270;
      const color =
        Math.random() < 0.65
          ? primaryColor
          : PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.sparks.push({
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        decay: 0.75 + Math.random() * 0.6,
        size: 2 + Math.random() * 2,
        color,
      });
    }
  }
}
