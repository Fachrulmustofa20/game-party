import * as THREE from 'three';
import { ControllerInputState } from '../../net/BinaryProtocol';
import { HostSDKContext, PlatformGame, PlatformPlayer } from '../../sdk/GameSDK';
import { LudoAudioEngine } from './LudoAudioEngine';
import { LudoFireworks } from './LudoFireworks';
import {
  HOME_STRETCH,
  LUDO_COLORS,
  LUDO_COLOR_NAMES,
  LudoTurnPhase,
  OUTER_TRACK,
  SAFE_TRACK_INDICES,
  START_OFFSETS,
  diceFace,
  getOuterTrackIndex,
  getPawnGridPos,
  gridToWorld,
  packLudoTelemetry,
} from './LudoBoard';
import { LUDO_CSS } from './LudoStyles';

const TILE_SIZE = 1.6;
const TURN_SECONDS = 15;
const STEP_INTERVAL = 0.16;

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#172554"/>
      <stop offset="100%" stop-color="#070b14"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <g transform="translate(215,52)">
    <rect width="210" height="210" rx="18" fill="#f8fafc" stroke="#334155" stroke-width="6"/>
    <rect x="8" y="8" width="78" height="78" rx="10" fill="#ef4444"/>
    <rect x="124" y="8" width="78" height="78" rx="10" fill="#3b82f6"/>
    <rect x="124" y="124" width="78" height="78" rx="10" fill="#eab308"/>
    <rect x="8" y="124" width="78" height="78" rx="10" fill="#22c55e"/>
    <polygon points="86,86 124,86 105,105" fill="#3b82f6"/>
    <polygon points="124,86 124,124 105,105" fill="#eab308"/>
    <polygon points="86,124 124,124 105,105" fill="#22c55e"/>
    <polygon points="86,86 86,124 105,105" fill="#ef4444"/>
  </g>
  <text x="320" y="325" text-anchor="middle" fill="#fde047" font-family="system-ui,sans-serif" font-weight="900" font-size="28" letter-spacing="4">LUDO 3D</text>
</svg>
`)}`;

interface LudoPawn {
  index: number;
  progress: number; // -1 = yard, 0..55 = track/home stretch, 56 = finished
  mesh: THREE.Group;
  labelSprite: THREE.Sprite;
  targetPos: THREE.Vector3;
}

interface LudoSeat {
  player: PlatformPlayer;
  team: number; // 0..3
  color: string;
  pawns: LudoPawn[];
}

const DICE_SIZE = 1.7;
const DICE_REST_Y = 0.19 + DICE_SIZE / 2; // Top of center pedestal (0.19) + half die height
const DICE_SPIN_DURATION = 0.5;

const DICE_FACE_ROTATIONS: Record<number, readonly [number, number, number]> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
};

function createDiceFaceTexture(value: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  const pips: Record<number, ReadonlyArray<readonly [number, number]>> = {
    1: [[0.5, 0.5]],
    2: [
      [0.27, 0.27],
      [0.73, 0.73],
    ],
    3: [
      [0.27, 0.27],
      [0.5, 0.5],
      [0.73, 0.73],
    ],
    4: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    5: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.5, 0.5],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    6: [
      [0.27, 0.24],
      [0.73, 0.24],
      [0.27, 0.5],
      [0.73, 0.5],
      [0.27, 0.76],
      [0.73, 0.76],
    ],
  };

  ctx.fillStyle = value === 1 ? '#dc2626' : '#0f172a';
  const radius = value === 1 ? 30 : 22;
  for (const [px, py] of pips[value] ?? pips[1]) {
    ctx.beginPath();
    ctx.arc(px * size, py * size, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrapAngleDelta(target: number, current: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class LudoGame implements PlatformGame {
  readonly id = 'ludo-3d';
  readonly title = 'Ludo 3D';
  readonly subtitle =
    'Permainan papan Ludo 3D klasik untuk 2–4 pemain! Lempar dadu, keluarkan bidak dengan angka 6, tendang bidak lawan kembali ke kandang, dan bawa 4 bidakmu ke tengah papan.';
  readonly badge = '2-4 PLAYER • 3D PAPAN';
  readonly accentColor = '#ef4444';
  readonly coverImage = COVER_SVG;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;
  readonly controllerLayout: 'arena-dpad' = 'arena-dpad';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private audio = new LudoAudioEngine();

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private diceMesh: THREE.Mesh | null = null;
  private diceSpinTimer = 0;

  private seats: LudoSeat[] = [];
  private turnIdx = 0;
  private phase: LudoTurnPhase = 'roll';
  private turnTimer = TURN_SECONDS;
  private botTimer = 0.85;
  private lastRoll = 0;
  private bonusTurn = false;
  private playablePawns: number[] = [];

  private movingPawn: LudoPawn | null = null;
  private movingSeat: LudoSeat | null = null;
  private remainingSteps = 0;
  private stepTimer = 0;

  private rafId: number | null = null;
  private lastTime = 0;
  private telemetryTimer = 0;
  private inputPrev = new Map<string, ControllerInputState>();

  private diceEl: HTMLElement | null = null;
  private turnEl: HTMLElement | null = null;
  private playersEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private fireworks: LudoFireworks | null = null;

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.inputPrev.clear();
    this.seats = [];

    const stage = document.createElement('div');
    stage.className = 'ld3-stage';
    stage.innerHTML = `
      <style>${LUDO_CSS}</style>
      <div class="ld3-topbar">
        <div class="hud-pill">
          <strong>🎲 LUDO 3D</strong>
          <span id="ld3-turn-pill" style="color:#fde047;">Memulai...</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ld3-sound" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;">Suara: ON</button>
          <button id="ld3-exit" class="btn btn-danger" style="padding:6px 12px;font-size:12px;">Keluar ke Lobby</button>
        </div>
      </div>

      <aside class="ld3-sidebar">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;font-weight:800;color:var(--muted);">HASIL DADU</span>
          <span id="ld3-dice-glyph" style="font-size:36px;line-height:1;">🎲</span>
        </div>
        <div id="ld3-status" style="font-size:12px;color:#cbd5e1;font-weight:700;">Siap melempar dadu</div>
        <div id="ld3-players" style="display:flex;flex-direction:column;gap:6px;"></div>
      </aside>

      <div id="ld3-overlay" style="display:none;position:absolute;inset:0;z-index:40;background:rgba(7,11,20,0.84);backdrop-filter:blur(8px);align-items:center;justify-content:center;"></div>
      <canvas id="ld3-fireworks" style="display:none;position:absolute;inset:0;width:100%;height:100%;z-index:45;pointer-events:none;"></canvas>
    `;
    container.appendChild(stage);

    this.diceEl = stage.querySelector('#ld3-dice-glyph');
    this.turnEl = stage.querySelector('#ld3-turn-pill');
    this.playersEl = stage.querySelector('#ld3-players');
    this.statusEl = stage.querySelector('#ld3-status');
    this.overlayEl = stage.querySelector('#ld3-overlay');
    const fwCanvas = stage.querySelector('#ld3-fireworks') as HTMLCanvasElement | null;
    this.fireworks = fwCanvas ? new LudoFireworks(fwCanvas) : null;

    const soundBtn = stage.querySelector('#ld3-sound') as HTMLButtonElement | null;
    soundBtn?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.isMuted());
      soundBtn.textContent = this.audio.isMuted() ? 'Suara: OFF' : 'Suara: ON';
    });
    stage.querySelector('#ld3-exit')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    this.initThree(stage);
    this.initPlayers(sdk.getPlayers().slice(0, 4));
    this.resetMatch();

    window.addEventListener('resize', this.onResize);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private initThree(stage: HTMLElement): void {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    stage.prepend(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 160);
    camera.position.set(0, 25, 22);
    camera.lookAt(0, 0, 0);
    this.camera = camera;

    scene.add(new THREE.AmbientLight('#ffffff', 0.56));
    const dir = new THREE.DirectionalLight('#fffbeb', 1.35);
    dir.position.set(14, 28, 16);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -16;
    dir.shadow.camera.right = 16;
    dir.shadow.camera.top = 16;
    dir.shadow.camera.bottom = -16;
    dir.shadow.camera.near = 5;
    dir.shadow.camera.far = 65;
    dir.shadow.bias = -0.0005;
    scene.add(dir);

    this.buildBoard3D(scene);

    // 3D center dice resting on the board (+X:3, -X:4, +Y:1, -Y:6, +Z:2, -Z:5)
    const faceOrder = [3, 4, 1, 6, 2, 5];
    const diceMats = faceOrder.map(
      (face) =>
        new THREE.MeshStandardMaterial({
          map: createDiceFaceTexture(face),
          roughness: 0.28,
          metalness: 0.05,
        })
    );
    const dice = new THREE.Mesh(new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE), diceMats);
    dice.position.set(0, DICE_REST_Y, 0);
    dice.castShadow = true;
    dice.receiveShadow = true;
    scene.add(dice);
    this.diceMesh = dice;
  }

  private buildBoard3D(scene: THREE.Scene): void {
    const boardSpan = 15 * TILE_SIZE;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(boardSpan + 1.4, 0.8, boardSpan + 1.4),
      new THREE.MeshStandardMaterial({ color: '#3f2718', roughness: 0.7 })
    );
    base.position.y = -0.45;
    base.receiveShadow = true;
    scene.add(base);

    const tileGeom = new THREE.BoxGeometry(TILE_SIZE * 0.92, 0.16, TILE_SIZE * 0.92);
    const whiteMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5 });
    const safeMat = new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.4 });
    const teamMats = LUDO_COLORS.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42 })
    );

    // 4 Home Yards (6x6 corners)
    const yardCenters: ReadonlyArray<readonly [number, number]> = [
      [2.5, 2.5],
      [2.5, 11.5],
      [11.5, 11.5],
      [11.5, 2.5],
    ];
    yardCenters.forEach(([r, c], teamIdx) => {
      const { x, z } = gridToWorld(r, c, TILE_SIZE);
      const yard = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE * 5.8, 0.22, TILE_SIZE * 5.8),
        teamMats[teamIdx]
      );
      yard.position.set(x, 0.05, z);
      yard.receiveShadow = true;
      scene.add(yard);

      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE * 4.1, 0.26, TILE_SIZE * 4.1),
        whiteMat
      );
      inner.position.set(x, 0.07, z);
      inner.receiveShadow = true;
      scene.add(inner);
    });

    // 52 Outer Track Tiles
    OUTER_TRACK.forEach(([r, c], idx) => {
      const { x, z } = gridToWorld(r, c, TILE_SIZE);
      const startTeam = START_OFFSETS.indexOf(idx as 0 | 13 | 26 | 39);
      const mat =
        startTeam >= 0
          ? teamMats[startTeam]
          : SAFE_TRACK_INDICES.has(idx)
          ? safeMat
          : whiteMat;
      const tile = new THREE.Mesh(tileGeom, mat);
      tile.position.set(x, 0.04, z);
      tile.receiveShadow = true;
      scene.add(tile);
    });

    // 4 Home Stretches
    HOME_STRETCH.forEach((cells, teamIdx) => {
      cells.forEach(([r, c]) => {
        const { x, z } = gridToWorld(r, c, TILE_SIZE);
        const tile = new THREE.Mesh(tileGeom, teamMats[teamIdx]);
        tile.position.set(x, 0.04, z);
        tile.receiveShadow = true;
        scene.add(tile);
      });
    });

    // Center Goal Pedestal
    const center = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE * 2.8, 0.26, TILE_SIZE * 2.8),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.3, metalness: 0.35 })
    );
    center.position.set(0, 0.06, 0);
    center.receiveShadow = true;
    scene.add(center);
  }

  private createPawnNumberSprite(num: number, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(48, 48, 38, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 48, 50);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 2.05, 0);
    sprite.scale.set(1.05, 1.05, 1);
    sprite.renderOrder = 20;
    sprite.visible = false;
    return sprite;
  }

  private createPawnShadowDisc(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.55)');
    grad.addColorStop(0.65, 'rgba(2, 6, 23, 0.25)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.09;
    return disc;
  }

  private createPawnMesh(color: string, num: number): { group: THREE.Group; labelSprite: THREE.Sprite } {
    const g = new THREE.Group();
    const shadowDisc = this.createPawnShadowDisc();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.22, 16), mat);
    base.position.y = 0.22;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.85, 16), mat);
    body.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mat);
    head.position.y = 1.2;
    base.castShadow = true;
    body.castShadow = true;
    head.castShadow = true;
    base.receiveShadow = true;
    body.receiveShadow = true;
    head.receiveShadow = true;
    const labelSprite = this.createPawnNumberSprite(num, color);
    g.add(shadowDisc, base, body, head, labelSprite);
    return { group: g, labelSprite };
  }

  private initPlayers(players: PlatformPlayer[]): void {
    if (!this.scene) return;
    const usedTeams = new Set<number>();

    this.seats = players.map((p, idx) => {
      let team = -1;
      if (p.characterId?.startsWith('ludo-')) {
        const parsed = Number(p.characterId.slice(5));
        if (parsed >= 0 && parsed < 4 && !usedTeams.has(parsed)) {
          team = parsed;
        }
      }
      if (team < 0) {
        for (let t = 0; t < 4; t++) {
          if (!usedTeams.has(t)) {
            team = t;
            break;
          }
        }
      }
      if (team < 0) team = idx % 4;
      usedTeams.add(team);

      const color = LUDO_COLORS[team];
      const pawns: LudoPawn[] = [0, 1, 2, 3].map((pawnIdx) => {
        const { group: mesh, labelSprite } = this.createPawnMesh(color, pawnIdx + 1);
        this.scene!.add(mesh);
        return {
          index: pawnIdx,
          progress: -1,
          mesh,
          labelSprite,
          targetPos: new THREE.Vector3(),
        };
      });

      return { player: p, team, color, pawns };
    });
  }

  private resetMatch(): void {
    for (const s of this.seats) {
      for (const p of s.pawns) {
        p.progress = -1;
        const [r, c] = getPawnGridPos(s.team, p.index, -1);
        const { x, z } = gridToWorld(r, c, TILE_SIZE);
        p.targetPos.set(x, 0.12, z);
        p.mesh.position.copy(p.targetPos);
      }
    }
    this.turnIdx = 0;
    this.phase = 'roll';
    this.turnTimer = TURN_SECONDS;
    this.botTimer = 0.85;
    this.lastRoll = 0;
    this.bonusTurn = false;
    this.playablePawns = [];
    this.movingPawn = null;
    this.movingSeat = null;
    this.remainingSteps = 0;
    this.fireworks?.stop();
    if (this.overlayEl) this.overlayEl.style.display = 'none';
    this.updateHud();
    this.sendAllTelemetry();
  }

  private onResize = (): void => {
    if (!this.renderer || !this.camera || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.fireworks?.resize();
  };

  private loop = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.update(dt, now);
    this.render3D(dt, now);
    this.fireworks?.update(dt);

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 1 / 12) {
      this.telemetryTimer = 0;
      this.sendAllTelemetry();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private getPlayablePawns(seat: LudoSeat, roll: number): number[] {
    const list: number[] = [];
    for (const p of seat.pawns) {
      if (p.progress === -1 && roll === 6) {
        list.push(p.index);
      } else if (p.progress >= 0 && p.progress + roll <= 56) {
        list.push(p.index);
      }
    }
    return list;
  }

  private update(dt: number, _now: number): void {
    if (this.phase === 'gameover' || this.seats.length === 0) return;

    const current = this.seats[this.turnIdx];
    if (!current) return;

    if (this.phase === 'moving' && this.movingPawn && this.movingSeat) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        if (this.remainingSteps > 0) {
          this.movingPawn.progress =
            this.movingPawn.progress < 0 ? 0 : this.movingPawn.progress + 1;
          this.remainingSteps -= 1;
          this.syncPawnTarget(this.movingSeat, this.movingPawn);
          this.audio.playStep();
          this.stepTimer = STEP_INTERVAL;
          return;
        }

        // Arrived! Check capture or home
        let captured = false;
        const landedOuter = getOuterTrackIndex(this.movingSeat.team, this.movingPawn.progress);
        if (landedOuter !== null && !SAFE_TRACK_INDICES.has(landedOuter)) {
          for (const otherSeat of this.seats) {
            if (otherSeat === this.movingSeat) continue;
            for (const otherPawn of otherSeat.pawns) {
              const otherOuter = getOuterTrackIndex(otherSeat.team, otherPawn.progress);
              if (otherOuter === landedOuter) {
                otherPawn.progress = -1;
                this.syncPawnTarget(otherSeat, otherPawn);
                captured = true;
              }
            }
          }
        }

        if (captured) {
          this.audio.playCapture();
          this.bonusTurn = true;
          if (this.statusEl) {
            this.statusEl.textContent = `${this.movingSeat.player.name} menendang bidak lawan!`;
          }
        } else if (this.movingPawn.progress === 56) {
          this.audio.playHome();
          this.bonusTurn = true;
        }

        if (this.movingSeat.pawns.every((p) => p.progress === 56)) {
          this.finishGame(this.movingSeat);
          return;
        }

        if (this.bonusTurn) {
          this.bonusTurn = false;
          this.phase = 'roll';
          this.turnTimer = TURN_SECONDS;
          this.botTimer = 0.8;
        } else {
          this.advanceTurn();
        }
        this.updateHud();
      }
      return;
    }

    if (current.player.isBot) {
      this.botTimer -= dt;
      if (this.botTimer <= 0) {
        if (this.phase === 'roll') {
          this.handleRoll(current);
        } else if (this.phase === 'choose_pawn') {
          const chosen = this.pickBotPawn(current, this.playablePawns);
          this.startPawnMove(current, chosen);
        }
      }
      return;
    }

    const input = this.sdk?.getInput(current.player.id);
    if (input) {
      const prev = this.inputPrev.get(current.player.id);
      this.inputPrev.set(current.player.id, { ...input });

      if (this.phase === 'roll' && input.item && !prev?.item) {
        this.handleRoll(current);
        return;
      }
      if (this.phase === 'choose_pawn' && input.boost && !prev?.boost) {
        const idx = Math.max(0, Math.min(3, Math.round(((input.steer + 1) / 2) * 3)));
        const chosen = this.playablePawns.includes(idx) ? idx : this.playablePawns[0];
        this.startPawnMove(current, chosen);
        return;
      }
    }

    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      if (this.phase === 'roll') {
        this.handleRoll(current);
      } else if (this.phase === 'choose_pawn') {
        this.startPawnMove(current, this.playablePawns[0]);
      }
    }
  }

  private handleRoll(seat: LudoSeat): void {
    const roll = 1 + Math.floor(Math.random() * 6);
    this.lastRoll = roll;
    this.diceSpinTimer = DICE_SPIN_DURATION;
    this.bonusTurn = roll === 6;
    this.audio.playRoll();

    const playable = this.getPlayablePawns(seat, roll);
    this.playablePawns = playable;

    if (playable.length === 0) {
      if (this.statusEl) {
        this.statusEl.textContent = `${seat.player.name} dapat ${roll} — tidak ada langkah.`;
      }
      this.bonusTurn = false;
      this.advanceTurn();
      this.updateHud();
      return;
    }

    if (playable.length === 1) {
      this.startPawnMove(seat, playable[0]);
      return;
    }

    this.phase = 'choose_pawn';
    this.turnTimer = TURN_SECONDS;
    this.botTimer = 0.7;
    if (this.statusEl) {
      this.statusEl.textContent = `${seat.player.name} dapat ${roll}! Pilih bidak di HP.`;
    }
    this.updateHud();
  }

  private pickBotPawn(seat: LudoSeat, playable: number[]): number {
    // Prefer deploying from yard on 6, or finishing, or advancing furthest pawn
    for (const idx of playable) {
      if (seat.pawns[idx].progress === -1) return idx;
    }
    let best = playable[0];
    for (const idx of playable) {
      if (seat.pawns[idx].progress > seat.pawns[best].progress) best = idx;
    }
    return best;
  }

  private startPawnMove(seat: LudoSeat, pawnIndex: number): void {
    const pawn = seat.pawns[pawnIndex];
    if (!pawn) return;
    this.movingSeat = seat;
    this.movingPawn = pawn;
    this.remainingSteps = pawn.progress < 0 ? 1 : this.lastRoll;
    this.phase = 'moving';
    this.stepTimer = 0.1;
    if (this.statusEl) {
      this.statusEl.textContent = `${seat.player.name} melangkah (${this.lastRoll})...`;
    }
    this.updateHud();
  }

  private advanceTurn(): void {
    this.turnIdx = (this.turnIdx + 1) % this.seats.length;
    this.phase = 'roll';
    this.turnTimer = TURN_SECONDS;
    this.botTimer = 0.85;
    this.playablePawns = [];
  }

  private syncPawnTarget(seat: LudoSeat, pawn: LudoPawn): void {
    const [r, c] = getPawnGridPos(seat.team, pawn.index, pawn.progress);
    const { x, z } = gridToWorld(r, c, TILE_SIZE);
    pawn.targetPos.set(x, 0.12, z);
  }

  private finishGame(winner: LudoSeat): void {
    this.phase = 'gameover';
    this.audio.playWin();
    this.fireworks?.start(winner.color);
    this.updateHud();
    this.sendAllTelemetry();
    if (!this.overlayEl) return;

    this.overlayEl.style.display = 'flex';
    this.overlayEl.innerHTML = `
      <div style="width:min(92%,430px);background:var(--panel);border:2px solid ${winner.color};border-radius:20px;padding:24px;text-align:center;display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:12px;font-weight:800;color:var(--muted);">PERMAINAN SELESAI</div>
        <h2 style="margin:0;font-size:28px;font-weight:900;">🏆 ${winner.player.name} Menang!</h2>
        <p style="margin:0;font-size:13px;color:#cbd5e1;">Semua 4 bidak Tim ${LUDO_COLOR_NAMES[winner.team]} berhasil mencapai tengah papan!</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
          <button id="ld3-rematch" class="btn btn-primary" style="padding:12px;">Main Lagi</button>
          <button id="ld3-back" class="btn btn-secondary" style="padding:12px;">Kembali ke Lobby</button>
        </div>
      </div>
    `;
    this.overlayEl.querySelector('#ld3-rematch')?.addEventListener('click', () => this.resetMatch());
    this.overlayEl.querySelector('#ld3-back')?.addEventListener('click', () => this.sdk?.exitToHub());
  }

  private render3D(dt: number, now: number): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    const alpha = 1 - Math.exp(-14 * dt);
    const currentSeat = this.seats[this.turnIdx];
    const showTurnNumbers = this.phase === 'choose_pawn' || this.phase === 'moving';
    for (const s of this.seats) {
      for (const p of s.pawns) {
        const dist = p.mesh.position.distanceTo(p.targetPos);
        p.mesh.position.lerp(p.targetPos, alpha);
        if (dist > 0.08) {
          p.mesh.position.y = 0.12 + Math.min(1.1, dist * 0.55);
        }
        const showLabel =
          showTurnNumbers &&
          s === currentSeat &&
          (this.phase === 'choose_pawn' ? p.progress < 56 : p === this.movingPawn);
        p.labelSprite.visible = showLabel;
        if (showLabel) {
          const playable =
            this.phase === 'moving' || this.playablePawns.includes(p.index);
          (p.labelSprite.material as THREE.SpriteMaterial).opacity = playable ? 1 : 0.35;
        }
      }
    }

    if (this.diceMesh) {
      if (this.diceSpinTimer > 0) {
        this.diceSpinTimer = Math.max(0, this.diceSpinTimer - dt);
        const t = 1 - this.diceSpinTimer / DICE_SPIN_DURATION;
        this.diceMesh.rotation.x += dt * 16;
        this.diceMesh.rotation.y += dt * 19;
        this.diceMesh.rotation.z += dt * 11;
        this.diceMesh.position.y =
          DICE_REST_Y + Math.abs(Math.sin(t * Math.PI * 1.5)) * (1 - t) * 2.6;
      } else {
        this.diceMesh.position.y += (DICE_REST_Y - this.diceMesh.position.y) * Math.min(1, dt * 20);
        const [tx, ty, tz] = DICE_FACE_ROTATIONS[this.lastRoll || 1] ?? DICE_FACE_ROTATIONS[1];
        const rotAlpha = Math.min(1, dt * 18);
        this.diceMesh.rotation.x += wrapAngleDelta(tx, this.diceMesh.rotation.x) * rotAlpha;
        this.diceMesh.rotation.y += wrapAngleDelta(ty, this.diceMesh.rotation.y) * rotAlpha;
        this.diceMesh.rotation.z += wrapAngleDelta(tz, this.diceMesh.rotation.z) * rotAlpha;
      }
    }

    this.camera.position.x = Math.sin(now * 0.00025) * 1.4;
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  private sendAllTelemetry(): void {
    if (!this.sdk) return;
    const current = this.seats[this.turnIdx];
    for (const s of this.seats) {
      if (s.player.isBot) continue;
      const isTurn = current === s && (this.phase === 'roll' || this.phase === 'choose_pawn');
      let mask = 0;
      if (isTurn && this.phase === 'choose_pawn') {
        for (const idx of this.playablePawns) mask |= 1 << idx;
      }
      this.sdk.sendTelemetry(
        s.player.id,
        packLudoTelemetry({
          phase: this.phase,
          lastRoll: this.lastRoll,
          isMyTurn: isTurn,
          timerPct: isTurn ? Math.max(0, Math.min(100, (this.turnTimer / TURN_SECONDS) * 100)) : 0,
          playableMask: mask,
          pawnProgress: s.pawns.map((p) => p.progress),
          finishedCount: s.pawns.filter((p) => p.progress === 56).length,
        })
      );
    }
  }

  private updateHud(): void {
    const current = this.seats[this.turnIdx];
    if (this.diceEl) this.diceEl.textContent = this.lastRoll > 0 ? diceFace(this.lastRoll) : '🎲';
    if (this.turnEl && current) {
      this.turnEl.textContent = `Giliran ${current.player.name} (${LUDO_COLOR_NAMES[current.team]})`;
    }
    if (this.playersEl) {
      this.playersEl.innerHTML = this.seats
        .map((s) => {
          const fin = s.pawns.filter((p) => p.progress === 56).length;
          const isTurn = s === current && this.phase !== 'gameover';
          return `
            <div class="ld3-player-row ${isTurn ? 'turn' : ''}">
              <div style="display:flex;align-items:center;gap:7px;min-width:0;">
                <span style="width:11px;height:11px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">P${s.player.slot + 1} ${s.player.name}</span>
              </div>
              <span style="color:#fde047;">${fin}/4 🏆</span>
            </div>
          `;
        })
        .join('');
    }
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.onResize);
    this.fireworks?.stop();
    this.fireworks = null;
    this.audio.destroy();
    this.renderer?.dispose();
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }
}
