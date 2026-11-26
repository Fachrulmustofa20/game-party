import { TelemetryPacket } from '../net/BinaryProtocol';
import { TransportMode } from '../net/HostNetworkManager';

export interface ControllerOutput {
  steer: number;
  gas: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean;
  boost: boolean;
}

export interface ControllerViewContext {
  slot: number;
  color: string;
  transportMode: TransportMode;
  onUnlockAudio: () => void;
  onToggleFullscreen: () => void;
  onBindLandscapeGuard: () => void;
}

export interface GameControllerView {
  readonly id: string;
  mount(container: HTMLElement, ctx: ControllerViewContext): void;
  updateTelemetry(t: TelemetryPacket): void;
  updateTransport(mode: TransportMode): void;
  getOutput(): ControllerOutput;
  releaseAllInputs(): void;
  unmount(): void;
}

export const CTRL_SVG_ICONS = {
  fullscreen: `<svg class="ctrl-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  itemEmpty: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  boost: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" fill-opacity="0.25"/></svg>`,
  drift: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18c3-7 8-10 15-10"/><path d="m15 4 4 4-4 4"/><path d="M4 21c2.5-4.5 6-6.5 11-7" opacity="0.55"/></svg>`,
  gas: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/><path d="M7 19h10"/></svg>`,
};

export function updateTransportBadge(el: HTMLElement | null, mode: TransportMode): void {
  if (!el) return;
  if (mode === 'webrtc') {
    el.textContent = 'WebRTC UDP';
    el.className = 'badge-rtc';
  } else if (mode === 'ws-fallback') {
    el.textContent = 'WS Relay';
    el.className = 'badge-ws';
  } else {
    el.textContent = 'Connecting...';
    el.className = 'badge-ws';
  }
}

export function drawRadarBlips(
  canvas: HTMLCanvasElement | null,
  t: TelemetryPacket,
  mySlot: number
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  for (const k of t.karts) {
    const px = (k.x / 255) * (w - 12) + 6;
    const pz = (k.z / 255) * (h - 12) + 6;
    ctx.beginPath();
    ctx.arc(px, pz, k.slot === mySlot ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = k.slot === mySlot ? '#22c55e' : '#94a3b8';
    ctx.fill();
    if (k.slot === mySlot) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function bindHoldButton(
  el: HTMLElement | null,
  onChange: (pressed: boolean) => void,
  onPressHaptic?: () => void
): void {
  if (!el) return;
  const set = (val: boolean) => {
    onChange(val);
    el.classList.toggle('pressed', val);
    if (val) {
      onPressHaptic?.();
      navigator.vibrate?.(12);
    }
  };
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    set(true);
  });
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    set(false);
  });
  el.addEventListener('touchcancel', () => set(false));
  el.addEventListener('mousedown', () => set(true));
  el.addEventListener('mouseup', () => set(false));
  el.addEventListener('mouseleave', () => set(false));
}

export function bindFloatingAnalog(
  zone: HTMLElement,
  base: HTMLElement,
  knob: HTMLElement,
  isDisabled: () => boolean,
  onMove: (normX: number, normY: number) => void,
  onReset: () => void
): () => void {
  let activeTouchId: number | null = null;
  let mouseDown = false;
  const maxRadius = 52;
  let originX = 0;
  let originY = 0;

  const placeBaseAt = (clientX: number, clientY: number) => {
    const zRect = zone.getBoundingClientRect();
    const pad = 42;
    const localX = Math.max(pad, Math.min(zRect.width - pad, clientX - zRect.left));
    const localY = Math.max(pad + 28, Math.min(zRect.height - pad, clientY - zRect.top));
    originX = zRect.left + localX;
    originY = zRect.top + localY;

    base.style.position = 'absolute';
    base.style.left = `${localX}px`;
    base.style.top = `${localY}px`;
    base.style.transform = 'translate(-50%, -50%)';
  };

  const updateFromClient = (clientX: number, clientY: number) => {
    let dx = clientX - originX;
    let dy = clientY - originY;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      const excess = dist - maxRadius;
      const nx = dx / dist;
      const ny = dy / dist;
      placeBaseAt(originX + nx * excess, originY + ny * excess);
      dx = nx * maxRadius;
      dy = ny * maxRadius;
    }

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onMove(
      Math.max(-1, Math.min(1, dx / maxRadius)),
      Math.max(-1, Math.min(1, dy / maxRadius))
    );
  };

  const reset = () => {
    activeTouchId = null;
    mouseDown = false;
    base.style.position = 'relative';
    base.style.left = '';
    base.style.top = '';
    base.style.transform = '';
    knob.style.transform = 'translate(-50%, -50%)';
    onReset();
  };

  zone.addEventListener('touchstart', (e) => {
    if (isDisabled() || (e.target as HTMLElement)?.closest('button')) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    placeBaseAt(t.clientX, t.clientY);
    updateFromClient(t.clientX, t.clientY);
  });

  zone.addEventListener('touchmove', (e) => {
    if (isDisabled() || activeTouchId === null) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === activeTouchId) {
        updateFromClient(t.clientX, t.clientY);
      }
    }
  });

  zone.addEventListener('touchend', (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === activeTouchId) reset();
    }
  });
  zone.addEventListener('touchcancel', reset);

  const onMouseDown = (e: MouseEvent) => {
    if (isDisabled() || (e.target as HTMLElement)?.closest('button')) return;
    mouseDown = true;
    placeBaseAt(e.clientX, e.clientY);
    updateFromClient(e.clientX, e.clientY);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (mouseDown) updateFromClient(e.clientX, e.clientY);
  };
  const onMouseUp = () => {
    if (mouseDown) reset();
  };

  zone.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}
