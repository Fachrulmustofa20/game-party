import * as THREE from 'three';
import { HostSDKContext, PlatformGame, PlatformPlayer } from '../../sdk/GameSDK';
import { getSpaceCharacter } from '../../sdk/SpaceCharacters';
import { SpaceAudioEngine } from './SpaceAudioEngine';

const ARENA_HALF_W = 86;
const ARENA_HALF_H = 52;
const MAX_HP = 100;
const ROUNDS_TO_WIN = 3;

type PowerUpType = 'triple' | 'missile' | 'shield';

interface ShipState {
  player: PlatformPlayer;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number; // radians, 0 = +X
  hp: number;
  score: number;
  fireCooldown: number;
  boostTimer: number;
  boostCooldown: number;
  dodgeTimer: number;
  dodgeCooldown: number;
  rollAngle: number;
  powerUp: PowerUpType | null;
  powerUpTimer: number;
  hitFlash: number;
  mesh: THREE.Group;
  shieldMesh: THREE.Mesh;
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
}

interface Projectile {
  ownerId: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  ttl: number;
  homing: boolean;
  targetId?: string;
  mesh: THREE.Mesh;
}

interface Asteroid {
  x: number;
  z: number;
  radius: number;
  rotSpeedX: number;
  rotSpeedY: number;
  mesh: THREE.Mesh;
}

interface PowerUpOrb {
  type: PowerUpType;
  x: number;
  z: number;
  mesh: THREE.Group;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
  maxTtl: number;
  mesh: THREE.Mesh;
}

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="55%" stop-color="#090d1f"/>
      <stop offset="100%" stop-color="#030712"/>
    </radialGradient>
    <linearGradient id="ship1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="ship2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <g fill="#ffffff" opacity="0.7">
    <circle cx="70" cy="50" r="1.5"/><circle cx="150" cy="110" r="1"/><circle cx="240" cy="40" r="2"/>
    <circle cx="380" cy="70" r="1.2"/><circle cx="520" cy="45" r="1.8"/><circle cx="580" cy="130" r="1.2"/>
    <circle cx="95" cy="280" r="1.5"/><circle cx="210" cy="310" r="1"/><circle cx="430" cy="295" r="2"/>
    <circle cx="545" cy="270" r="1.4"/><circle cx="310" cy="190" r="1"/>
  </g>
  <line x1="175" y1="225" x2="430" y2="125" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
  <line x1="465" y1="135" x2="255" y2="220" stroke="#fb7185" stroke-width="4" stroke-linecap="round" stroke-dasharray="14 10" opacity="0.85"/>
  <g transform="translate(155,235) rotate(-22)">
    <polygon points="42,0 -24,-22 -12,0 -24,22" fill="url(#ship1)" stroke="#e0f2fe" stroke-width="2"/>
    <circle cx="-18" cy="0" r="6" fill="#7dd3fc"/>
  </g>
  <g transform="translate(485,125) rotate(158)">
    <polygon points="42,0 -24,-22 -12,0 -24,22" fill="url(#ship2)" stroke="#ffe4e6" stroke-width="2"/>
    <circle cx="-18" cy="0" r="6" fill="#fda4af"/>
  </g>
  <text x="320" y="325" text-anchor="middle" fill="#e2e8f0" font-family="system-ui,sans-serif" font-weight="900" font-size="24" letter-spacing="4">SPACE DOGFIGHT 10P</text>
</svg>
`)}`;

export class SpaceDogfightGame implements PlatformGame {
  id = 'space-dogfight-2p';
  title = 'Space Dogfight (10P Arena)';
  subtitle =
    'Pertempuran pesawat tempur di luar angkasa! Bermanuver menghindari tembakan musuh, lakukan barrel roll, aktifkan afterburner untuk mengejar, dan tembak jatuh pesawat lawan.';
  badge = '2-10 PLAYER • 3D SPACE';
  accentColor = '#38bdf8';
  coverImage = COVER_SVG;
  minPlayers = 2;
  maxPlayers = 10;
  controllerLayout: 'racing-ctr' = 'racing-ctr';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private ships: ShipState[] = [];
  private projectiles: Projectile[] = [];
  private asteroids: Asteroid[] = [];
  private powerUps: PowerUpOrb[] = [];
  private particles: Particle[] = [];

  private rafId: number | null = null;
  private lastTime = 0;
  private telemetryTimer = 0;
  private powerUpSpawnTimer = 4;

  private phase: 'countdown' | 'fighting' | 'round_over' | 'match_over' = 'countdown';
  private countdownTimer = 3.2;
  private roundTimer = 0;
  private roundNumber = 1;

  private hudEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private audio = new SpaceAudioEngine();
  private unlockAudioOnce = (): void => {
    this.audio.unlock();
  };

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.audio.unlock();
    window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true });
    window.addEventListener('keydown', this.unlockAudioOnce, { once: true });
    this.ships = [];
    this.projectiles = [];
    this.asteroids = [];
    this.powerUps = [];
    this.particles = [];
    this.roundNumber = 1;
    this.phase = 'countdown';
    this.countdownTimer = 3.2;
    this.powerUpSpawnTimer = 4;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030712');
    scene.fog = new THREE.FogExp2('#030712', 0.0022);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.5, 600);
    camera.position.set(0, 98, 46);
    camera.lookAt(0, 0, 0);
    this.camera = camera;

    this.buildSpaceEnvironment(scene);
    this.spawnAsteroids(scene);
    this.spawnShips(scene);
    this.buildHud(container);

    window.addEventListener('resize', this.handleResize);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointerdown', this.unlockAudioOnce);
    window.removeEventListener('keydown', this.unlockAudioOnce);
    this.audio.destroy();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }

  private handleResize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private buildSpaceEnvironment(scene: THREE.Scene): void {
    const ambient = new THREE.AmbientLight('#94a3b8', 1.2);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight('#e0f2fe', 2.2);
    dirLight.position.set(40, 80, 30);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 1.1);
    rimLight.position.set(-50, 30, -40);
    scene.add(rimLight);

    // Starfield
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 420;
      starPos[i * 3 + 1] = -15 - Math.random() * 90;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 320;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: '#e2e8f0', size: 0.9, transparent: true, opacity: 0.85 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Arena Grid Floor
    const grid = new THREE.GridHelper(ARENA_HALF_W * 2, 24, '#1d4ed8', '#0f172a');
    grid.position.y = -4;
    grid.scale.z = ARENA_HALF_H / ARENA_HALF_W;
    scene.add(grid);

    // Arena Neon Boundary
    const pts = [
      new THREE.Vector3(-ARENA_HALF_W, 0, -ARENA_HALF_H),
      new THREE.Vector3(ARENA_HALF_W, 0, -ARENA_HALF_H),
      new THREE.Vector3(ARENA_HALF_W, 0, ARENA_HALF_H),
      new THREE.Vector3(-ARENA_HALF_W, 0, ARENA_HALF_H),
      new THREE.Vector3(-ARENA_HALF_W, 0, -ARENA_HALF_H),
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const borderMat = new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.65 });
    scene.add(new THREE.Line(borderGeo, borderMat));
  }

  private spawnAsteroids(scene: THREE.Scene): void {
    const positions = [
      { x: 0, z: 0, r: 5.2 },
      { x: -34, z: -20, r: 3.8 },
      { x: 34, z: 20, r: 3.8 },
      { x: -30, z: 24, r: 3.4 },
      { x: 30, z: -24, r: 3.4 },
    ];
    for (const p of positions) {
      const geo = new THREE.DodecahedronGeometry(p.r, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.85,
        metalness: 0.25,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, 0, p.z);
      scene.add(mesh);
      this.asteroids.push({
        x: p.x,
        z: p.z,
        radius: p.r,
        rotSpeedX: (Math.random() - 0.5) * 0.6,
        rotSpeedY: (Math.random() - 0.5) * 0.8,
        mesh,
      });
    }
  }

  private createShipMesh(color: string, accentColor = '#38bdf8'): {
    group: THREE.Group;
    shield: THREE.Mesh;
    flameLeft: THREE.Mesh;
    flameRight: THREE.Mesh;
  } {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.55,
      roughness: 0.25,
      emissive: color,
      emissiveIntensity: 0.18,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.7, roughness: 0.3 });
    const cockpitMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.5,
      roughness: 0.1,
    });

    // Fuselage pointing +X
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6.2, 6), hullMat);
    body.rotation.z = -Math.PI / 2;
    group.add(body);

    // Wings
    const wingGeo = new THREE.BoxGeometry(2.4, 0.25, 6.4);
    const wings = new THREE.Mesh(wingGeo, hullMat);
    wings.position.set(-0.9, 0, 0);
    group.add(wings);

    // Wingtip cannons
    const podGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.6, 8);
    const podL = new THREE.Mesh(podGeo, darkMat);
    podL.rotation.z = Math.PI / 2;
    podL.position.set(-0.2, 0, -2.9);
    const podR = podL.clone();
    podR.position.z = 2.9;
    group.add(podL, podR);

    // Cockpit
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), cockpitMat);
    cockpit.scale.set(1.6, 0.7, 0.8);
    cockpit.position.set(0.5, 0.65, 0);
    group.add(cockpit);

    // Thruster flames
    const flameGeo = new THREE.ConeGeometry(0.42, 2.2, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85 });
    const flameLeft = new THREE.Mesh(flameGeo, flameMat);
    flameLeft.rotation.z = Math.PI / 2;
    flameLeft.position.set(-3.6, 0, -0.9);
    const flameRight = flameLeft.clone();
    flameRight.position.z = 0.9;
    group.add(flameLeft, flameRight);

    // Energy Shield bubble
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 20, 16),
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.28,
        wireframe: true,
      })
    );
    shield.visible = false;
    group.add(shield);

    return { group, shield, flameLeft, flameRight };
  }

  private createShipNameplateSprite(name: string, accentColor: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(8, 12, 23, 0.85)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(6, 10, 244, 44, 22);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(28, 32, 8, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 44, 33, 198);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, 4.8, 0);
    sprite.scale.set(7.6, 1.9, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private getSpawnPoints(count: number): Array<{ x: number; z: number; angle: number }> {
    const total = Math.max(2, count);
    const rx = ARENA_HALF_W * 0.72;
    const rz = ARENA_HALF_H * 0.72;
    return Array.from({ length: total }, (_, idx) => {
      const theta = Math.PI + (idx / total) * Math.PI * 2;
      const x = Math.cos(theta) * rx;
      const z = Math.sin(theta) * rz;
      const angle = Math.atan2(-z, -x);
      return { x, z, angle };
    });
  }

  private spawnShips(scene: THREE.Scene): void {
    const players = (this.sdk?.getPlayers() ?? []).slice(0, 10);
    const spawns = this.getSpawnPoints(players.length);

    players.forEach((p, idx) => {
      const sp = spawns[idx] ?? spawns[0];
      const charSpec = getSpaceCharacter(p.characterId, p.slot);
      const color = p.isBot ? charSpec.color : p.color || charSpec.color;
      const { group, shield, flameLeft, flameRight } = this.createShipMesh(color, charSpec.accent);
      if (players.length >= 5) {
        group.add(this.createShipNameplateSprite(p.name, color));
      }
      group.position.set(sp.x, 0, sp.z);
      group.rotation.y = -sp.angle;
      scene.add(group);

      this.ships.push({
        player: p,
        x: sp.x,
        z: sp.z,
        vx: 0,
        vz: 0,
        angle: sp.angle,
        hp: MAX_HP,
        score: 0,
        fireCooldown: 0,
        boostTimer: 0,
        boostCooldown: 0,
        dodgeTimer: 0,
        dodgeCooldown: 0,
        rollAngle: 0,
        powerUp: null,
        powerUpTimer: 0,
        hitFlash: 0,
        mesh: group,
        shieldMesh: shield,
        flameLeft,
        flameRight,
      });
    });
  }

  private resetRound(): void {
    const spawns = this.getSpawnPoints(this.ships.length);
    this.ships.forEach((s, idx) => {
      const sp = spawns[idx] ?? spawns[0];
      s.x = sp.x;
      s.z = sp.z;
      s.vx = 0;
      s.vz = 0;
      s.angle = sp.angle;
      s.hp = MAX_HP;
      s.fireCooldown = 0;
      s.boostTimer = 0;
      s.boostCooldown = 0;
      s.dodgeTimer = 0;
      s.dodgeCooldown = 0;
      s.rollAngle = 0;
      s.powerUp = null;
      s.powerUpTimer = 0;
      s.mesh.visible = true;
      s.mesh.position.set(s.x, 0, s.z);
      s.mesh.rotation.set(0, -s.angle, 0);
    });

    for (const pr of this.projectiles) this.scene?.remove(pr.mesh);
    this.projectiles = [];

    this.phase = 'countdown';
    this.countdownTimer = 2.6;
  }

  private buildHud(container: HTMLElement): void {
    const hud = document.createElement('div');
    hud.style.cssText =
      'position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:18px 24px;font-family:system-ui,sans-serif;';

    hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div id="df-players-hud" style="flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,230px));gap:8px;"></div>

        <div style="text-align:center;background:rgba(9,13,31,0.82);border:1px solid rgba(255,255,255,0.16);border-radius:14px;padding:8px 18px;pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;">
          <div id="df-round-label" style="font-size:12px;font-weight:900;letter-spacing:0.12em;color:#e2e8f0;">RONDE 1 • FIRST TO 3</div>
          <button id="df-exit-btn" type="button" style="border:none;background:rgba(239,68,68,0.2);color:#fca5a5;border-radius:8px;padding:4px 12px;font-size:11px;font-weight:800;cursor:pointer;">Keluar ke Hub</button>
        </div>
      </div>

      <div id="df-countdown" style="align-self:center;font-size:72px;font-weight:900;color:#fff;text-shadow:0 0 28px rgba(56,189,248,0.85);">3</div>

      <div style="display:flex;justify-content:center;">
        <div style="background:rgba(9,13,31,0.75);border:1px solid rgba(255,255,255,0.12);border-radius:999px;padding:6px 16px;font-size:12px;color:#cbd5e1;">
          <strong>Kontrol:</strong> Analog = Belok &bull; <strong>GAS</strong> = Maju &bull; <strong>ITEM</strong> = Tembak &bull; <strong>DRIFT</strong> = Barrel Roll &bull; <strong>BOOST</strong> = Afterburner
        </div>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(3,7,18,0.78);backdrop-filter:blur(8px);pointer-events:auto;';
    container.appendChild(hud);
    container.appendChild(overlay);

    hud.querySelector('#df-exit-btn')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    this.hudEl = hud;
    this.countdownEl = hud.querySelector('#df-countdown');
    this.overlayEl = overlay;
    this.updateHud();
  }

  private updateHud(): void {
    if (!this.hudEl) return;
    const renderStars = (score: number) => '★'.repeat(score) + '☆'.repeat(Math.max(0, ROUNDS_TO_WIN - score));
    const puText = (s: ShipState) => {
      if (s.hp <= 0) return 'HANCUR';
      if (s.powerUp === 'triple') return `TRIPLE LASER (${Math.ceil(s.powerUpTimer)}s)`;
      if (s.powerUp === 'missile') return `HOMING MISSILE (${Math.ceil(s.powerUpTimer)}s)`;
      if (s.powerUp === 'shield') return `ENERGY SHIELD (${Math.ceil(s.powerUpTimer)}s)`;
      return s.boostCooldown > 0 ? `Boost: ${Math.ceil(s.boostCooldown)}s` : 'Boost SIAP!';
    };

    const playersHud = this.hudEl.querySelector('#df-players-hud');
    if (playersHud) {
      playersHud.innerHTML = this.ships
        .map((s) => {
          const ch = getSpaceCharacter(s.player.characterId, s.player.slot);
          const color = s.player.isBot ? ch.color : s.player.color || ch.color;
          const hpPct = Math.max(0, Math.round(s.hp));
          return `
            <div style="background:rgba(9,13,31,0.82);border:1px solid ${color}77;border-radius:12px;padding:7px 10px;backdrop-filter:blur(6px);opacity:${s.hp <= 0 ? '0.52' : '1'};">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-weight:800;font-size:12px;">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">P${s.player.slot + 1} ${s.player.name}</span>
                <span style="color:#facc15;letter-spacing:1px;flex-shrink:0;">${renderStars(s.score)}</span>
              </div>
              <div style="font-size:10px;color:#94a3b8;margin-top:1px;">${ch.name}</div>
              <div style="height:7px;background:#1e293b;border-radius:999px;overflow:hidden;margin-top:4px;">
                <div style="width:${hpPct}%;height:100%;background:${color};transition:width 0.1s;"></div>
              </div>
              <div style="font-size:10px;color:#cbd5e1;margin-top:3px;font-weight:700;">${puText(s)}</div>
            </div>
          `;
        })
        .join('');
    }
    const roundLbl = this.hudEl.querySelector('#df-round-label');
    if (roundLbl) roundLbl.textContent = `RONDE ${this.roundNumber} • FIRST TO ${ROUNDS_TO_WIN}`;
  }

  private computeBotInput(bot: ShipState, enemy?: ShipState) {
    if (!enemy) return { steer: 0, gas: false, brake: false, drift: false, item: false, boost: false };
    const dx = enemy.x - bot.x;
    const dz = enemy.z - bot.z;
    const dist = Math.hypot(dx, dz);
    const targetAngle = Math.atan2(dz, dx);
    let diff = targetAngle - bot.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const lvl = bot.player.botLevel ?? 'medium';
    const steerGain = lvl === 'god' ? 3.1 : lvl === 'hard' ? 2.4 : lvl === 'medium' ? 1.8 : 1.15;
    const steer = Math.max(-1, Math.min(1, diff * steerGain));
    const aligned =
      Math.abs(diff) < (lvl === 'god' ? 0.5 : lvl === 'hard' ? 0.42 : lvl === 'medium' ? 0.35 : 0.22);
    const dodgeChance = lvl === 'god' ? 0.1 : lvl === 'hard' ? 0.06 : lvl === 'medium' ? 0.03 : 0.008;
    const fireProb = lvl === 'god' || lvl === 'hard' ? 1.0 : lvl === 'medium' ? 0.65 : 0.3;
    return {
      steer,
      gas: dist > 18,
      brake: false,
      drift: bot.dodgeCooldown <= 0 && dist < 24 && Math.random() < dodgeChance,
      item: aligned && dist < 78 && Math.random() < fireProb,
      boost: lvl !== 'easy' && aligned && dist > 45 && bot.boostCooldown <= 0,
    };
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.step(dt);
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    // Rotate asteroids
    for (const ast of this.asteroids) {
      ast.mesh.rotation.x += ast.rotSpeedX * dt;
      ast.mesh.rotation.y += ast.rotSpeedY * dt;
    }

    // Animate powerup orbs
    for (const orb of this.powerUps) {
      orb.mesh.rotation.y += 2.2 * dt;
      orb.mesh.position.y = Math.sin(performance.now() * 0.004 + orb.x) * 0.8;
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.ttl -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pt.mesh.position.set(pt.x, pt.y, pt.z);
      const scale = Math.max(0.01, pt.ttl / pt.maxTtl);
      pt.mesh.scale.setScalar(scale);
      if (pt.ttl <= 0) {
        this.scene?.remove(pt.mesh);
        this.particles.splice(i, 1);
      }
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownEl) {
        this.countdownEl.style.display = 'block';
        this.countdownEl.textContent = this.countdownTimer > 0.6 ? String(Math.ceil(this.countdownTimer - 0.4)) : 'TEMBAK!';
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'fighting';
        if (this.countdownEl) this.countdownEl.style.display = 'none';
      }
      this.updateCamera(dt);
      return;
    }

    if (this.phase === 'round_over') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundNumber++;
        this.resetRound();
      }
      this.updateCamera(dt);
      return;
    }

    if (this.phase === 'match_over') {
      this.updateCamera(dt);
      return;
    }

    // Spawn power-ups periodically
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0 && this.powerUps.length < 3) {
      this.spawnPowerUp();
      this.powerUpSpawnTimer = 6.5;
    }

    // Step ships
    for (const ship of this.ships) {
      if (ship.hp <= 0) {
        this.audio.updateShipThruster(ship.player.id, ship.player.slot, false, false);
        continue;
      }
      const enemy = this.findNearestEnemy(ship);
      const input = ship.player.isBot
        ? this.computeBotInput(ship, enemy)
        : this.sdk?.getInput(ship.player.id) ?? {
            steer: 0,
            gas: false,
            brake: false,
            drift: false,
            item: false,
            boost: false,
          };

      ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
      ship.boostTimer = Math.max(0, ship.boostTimer - dt);
      ship.boostCooldown = Math.max(0, ship.boostCooldown - dt);
      ship.dodgeTimer = Math.max(0, ship.dodgeTimer - dt);
      ship.dodgeCooldown = Math.max(0, ship.dodgeCooldown - dt);
      ship.hitFlash = Math.max(0, ship.hitFlash - dt);

      if (ship.powerUp) {
        ship.powerUpTimer -= dt;
        if (ship.powerUpTimer <= 0) ship.powerUp = null;
      }

      // Steer
      const turnRate = ship.dodgeTimer > 0 ? 1.8 : 3.4;
      ship.angle += input.steer * turnRate * dt;

      // Boost
      if (input.boost && ship.boostCooldown <= 0) {
        ship.boostTimer = 1.1;
        ship.boostCooldown = 4.5;
        this.sdk?.sendVibrate(ship.player.id, [30, 20, 40]);
      }

      // Barrel Roll Dodge
      if (input.drift && ship.dodgeCooldown <= 0) {
        ship.dodgeTimer = 0.42;
        ship.dodgeCooldown = 1.9;
        const sideDir = input.steer >= 0 ? 1 : -1;
        ship.vx += -Math.sin(ship.angle) * sideDir * 34;
        ship.vz += Math.cos(ship.angle) * sideDir * 34;
        this.audio.playDodge();
        this.sdk?.sendVibrate(ship.player.id, 25);
      }

      // Thrust & Reverse Brake
      const accel = ship.boostTimer > 0 ? 96 : input.gas ? 56 : input.brake ? 24 : 12;
      this.audio.updateShipThruster(ship.player.id, ship.player.slot, input.gas, ship.boostTimer > 0);
      if (input.gas || ship.boostTimer > 0) {
        ship.vx += Math.cos(ship.angle) * accel * dt;
        ship.vz += Math.sin(ship.angle) * accel * dt;
      } else if (input.brake) {
        ship.vx -= Math.cos(ship.angle) * accel * dt;
        ship.vz -= Math.sin(ship.angle) * accel * dt;
      }

      // Space drag
      const drag = Math.pow(0.28, dt);
      ship.vx *= drag;
      ship.vz *= drag;

      ship.x += ship.vx * dt;
      ship.z += ship.vz * dt;

      // Arena bounds bounce
      if (ship.x < -ARENA_HALF_W + 3) {
        ship.x = -ARENA_HALF_W + 3;
        ship.vx = Math.abs(ship.vx) * 0.6;
      } else if (ship.x > ARENA_HALF_W - 3) {
        ship.x = ARENA_HALF_W - 3;
        ship.vx = -Math.abs(ship.vx) * 0.6;
      }
      if (ship.z < -ARENA_HALF_H + 3) {
        ship.z = -ARENA_HALF_H + 3;
        ship.vz = Math.abs(ship.vz) * 0.6;
      } else if (ship.z > ARENA_HALF_H - 3) {
        ship.z = ARENA_HALF_H - 3;
        ship.vz = -Math.abs(ship.vz) * 0.6;
      }

      // Asteroid collisions
      for (const ast of this.asteroids) {
        const dx = ship.x - ast.x;
        const dz = ship.z - ast.z;
        const dist = Math.hypot(dx, dz);
        const minDist = ast.radius + 2.6;
        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          ship.x = ast.x + nx * minDist;
          ship.z = ast.z + nz * minDist;
          ship.vx += nx * 16;
          ship.vz += nz * 16;
        }
      }

      // Fire weapon
      if (input.item && ship.fireCooldown <= 0) {
        this.fireWeapon(ship, enemy);
      }

      // Collect power-ups
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        const orb = this.powerUps[i];
        if (Math.hypot(ship.x - orb.x, ship.z - orb.z) < 4.5) {
          ship.powerUp = orb.type;
          ship.powerUpTimer = 9;
          this.scene?.remove(orb.mesh);
          this.powerUps.splice(i, 1);
          this.audio.playPowerUp();
          this.sdk?.sendVibrate(ship.player.id, [20, 30, 20]);
        }
      }

      // Visual updates
      ship.rollAngle = ship.dodgeTimer > 0 ? ship.rollAngle + 18 * dt : -input.steer * 0.45;
      ship.mesh.position.set(ship.x, 0, ship.z);
      ship.mesh.rotation.set(ship.rollAngle, -ship.angle, 0);
      ship.shieldMesh.visible = ship.dodgeTimer > 0 || ship.powerUp === 'shield';

      const flameScale = ship.boostTimer > 0 ? 1.8 : input.gas ? 1.0 : 0.25;
      ship.flameLeft.scale.set(1, flameScale, 1);
      ship.flameRight.scale.set(1, flameScale, 1);
    }

    // Step projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.ttl -= dt;

      if (pr.homing && pr.targetId) {
        const target = this.ships.find((s) => s.player.id === pr.targetId);
        if (target) {
          const desiredAngle = Math.atan2(target.z - pr.z, target.x - pr.x);
          const speed = Math.hypot(pr.vx, pr.vz);
          const curAngle = Math.atan2(pr.vz, pr.vx);
          let diff = desiredAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const nextAngle = curAngle + Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
          pr.vx = Math.cos(nextAngle) * speed;
          pr.vz = Math.sin(nextAngle) * speed;
        }
      }

      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.mesh.position.set(pr.x, 0, pr.z);

      let remove = pr.ttl <= 0 || Math.abs(pr.x) > ARENA_HALF_W || Math.abs(pr.z) > ARENA_HALF_H;

      // Hit asteroid
      if (!remove) {
        for (const ast of this.asteroids) {
          if (Math.hypot(pr.x - ast.x, pr.z - ast.z) < ast.radius + 0.8) {
            this.spawnExplosion(pr.x, pr.z, '#94a3b8', 5);
            remove = true;
            break;
          }
        }
      }

      // Hit enemy ship
      if (!remove) {
        for (const ship of this.ships) {
          if (ship.hp <= 0 || ship.player.id === pr.ownerId) continue;
          if (Math.hypot(pr.x - ship.x, pr.z - ship.z) < 3.4) {
            remove = true;
            if (ship.dodgeTimer <= 0) {
              const dmg = ship.powerUp === 'shield' ? Math.round(pr.damage * 0.35) : pr.damage;
              ship.hp = Math.max(0, ship.hp - dmg);
              ship.hitFlash = 0.15;
              this.spawnExplosion(pr.x, pr.z, ship.player.color, 8);
              this.sdk?.sendVibrate(ship.player.id, [45, 20, 45]);

              if (ship.hp <= 0) {
                this.audio.playExplosion();
                this.handleShipDestroyed(ship, pr.ownerId);
              } else {
                this.audio.playHit();
              }
            } else {
              this.spawnExplosion(pr.x, pr.z, '#38bdf8', 4);
            }
            break;
          }
        }
      }

      if (remove) {
        this.scene?.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    this.updateCamera(dt);
    this.updateHud();
    this.sendTelemetry(dt);
  }

  private fireWeapon(ship: ShipState, enemy?: ShipState): void {
    const isTriple = ship.powerUp === 'triple';
    const isMissile = ship.powerUp === 'missile';
    ship.fireCooldown = isMissile ? 0.45 : 0.22;
    if (isMissile) {
      this.audio.playMissile();
    } else {
      this.audio.playLaser();
    }

    const angles = isTriple ? [ship.angle - 0.16, ship.angle, ship.angle + 0.16] : [ship.angle];
    const speed = isMissile ? 68 : 96;
    const color = isMissile ? '#facc15' : ship.player.color;

    for (const ang of angles) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(isMissile ? 0.7 : 0.45, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      const sx = ship.x + Math.cos(ang) * 3.8;
      const sz = ship.z + Math.sin(ang) * 3.8;
      mesh.position.set(sx, 0, sz);
      this.scene?.add(mesh);

      this.projectiles.push({
        ownerId: ship.player.id,
        x: sx,
        z: sz,
        vx: Math.cos(ang) * speed,
        vz: Math.sin(ang) * speed,
        damage: isMissile ? 24 : 12,
        ttl: isMissile ? 2.2 : 1.35,
        homing: isMissile,
        targetId: enemy?.player.id,
        mesh,
      });
    }
    this.sdk?.sendVibrate(ship.player.id, 12);
  }

  private spawnPowerUp(): void {
    const types: PowerUpType[] = ['triple', 'missile', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = (Math.random() - 0.5) * (ARENA_HALF_W * 1.4);
    const z = (Math.random() - 0.5) * (ARENA_HALF_H * 1.4);

    const color = type === 'triple' ? '#38bdf8' : type === 'missile' ? '#facc15' : '#4ade80';
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.14, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.65 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    group.position.set(x, 0, z);
    this.scene?.add(group);
    this.powerUps.push({ type, x, z, mesh: group });
  }

  private spawnExplosion(x: number, z: number, color: string, count: number): void {
    if (!this.scene) return;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.65, 0.65),
        new THREE.MeshBasicMaterial({ color })
      );
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      const spd = 8 + Math.random() * 26;
      this.particles.push({
        x,
        y: 0,
        z,
        vx: Math.cos(ang) * spd,
        vy: (Math.random() - 0.5) * 14,
        vz: Math.sin(ang) * spd,
        ttl: 0.45 + Math.random() * 0.3,
        maxTtl: 0.75,
        mesh,
      });
    }
  }

  private findNearestEnemy(ship: ShipState): ShipState | undefined {
    let best: ShipState | undefined;
    let bestDist = Infinity;
    for (const other of this.ships) {
      if (other.player.id === ship.player.id || other.hp <= 0) continue;
      const d = Math.hypot(other.x - ship.x, other.z - ship.z);
      if (d < bestDist) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  private handleShipDestroyed(victim: ShipState, killerId: string): void {
    victim.mesh.visible = false;
    this.spawnExplosion(victim.x, victim.z, victim.player.color, 26);
    this.sdk?.sendVibrate(victim.player.id, [120, 40, 160]);

    const alive = this.ships.filter((s) => s.hp > 0);
    if (alive.length > 1) {
      this.updateHud();
      return;
    }

    const killer = alive[0] ?? this.ships.find((s) => s.player.id === killerId);
    if (killer) {
      killer.score++;
      this.sdk?.sendVibrate(killer.player.id, [50, 30, 80]);
    }
    this.updateHud();

    if (killer && killer.score >= ROUNDS_TO_WIN) {
      this.phase = 'match_over';
      this.showMatchOver(killer);
    } else {
      this.phase = 'round_over';
      this.roundTimer = 2.2;
      if (this.countdownEl) {
        this.countdownEl.style.display = 'block';
        this.countdownEl.textContent = `${killer ? killer.player.name : 'P1'} MENANG RONDE!`;
        this.countdownEl.style.fontSize = '42px';
      }
    }
  }

  private showMatchOver(winner: ShipState): void {
    if (!this.overlayEl) return;
    this.overlayEl.style.display = 'flex';
    this.overlayEl.innerHTML = `
      <div style="background:linear-gradient(160deg,#0f172a,#1e293b);border:2px solid ${winner.player.color};border-radius:22px;padding:28px 36px;text-align:center;max-width:440px;color:#fff;box-shadow:0 24px 60px rgba(0,0,0,0.6);">
        <div style="font-size:13px;font-weight:800;letter-spacing:0.15em;color:#38bdf8;">PERTEMPURAN SELESAI</div>
        <h2 style="margin:10px 0 6px;font-size:32px;font-weight:900;">🏆 ${winner.player.name} Menang!</h2>
        <p style="margin:0 0 22px;color:#94a3b8;font-size:14px;">Skor Akhir: ${this.ships.map((s) => `${s.player.name} (${s.score})`).join(' vs ')}</p>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="df-rematch" class="btn btn-primary">Main Lagi</button>
          <button id="df-hub" class="btn btn-secondary">Kembali ke Hub</button>
        </div>
      </div>
    `;
    this.overlayEl.querySelector('#df-rematch')?.addEventListener('click', () => {
      if (this.overlayEl) this.overlayEl.style.display = 'none';
      if (this.countdownEl) this.countdownEl.style.fontSize = '72px';
      this.ships.forEach((s) => (s.score = 0));
      this.roundNumber = 1;
      this.resetRound();
    });
    this.overlayEl.querySelector('#df-hub')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });
  }

  private updateCamera(dt: number): void {
    if (!this.camera || this.ships.length === 0) return;
    const active = this.ships.filter((s) => s.hp > 0);
    const list = active.length > 0 ? active : this.ships;
    let cx = 0;
    let cz = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of list) {
      cx += s.x;
      cz += s.z;
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z;
      if (s.z > maxZ) maxZ = s.z;
    }
    cx /= list.length;
    cz /= list.length;

    const spread = list.length >= 2 ? Math.hypot(maxX - minX, maxZ - minZ) : 40;
    const camHeight = Math.max(76, Math.min(155, 62 + spread * 0.72));

    this.camera.position.x += (cx * 0.65 - this.camera.position.x) * Math.min(1, 5 * dt);
    this.camera.position.y += (camHeight - this.camera.position.y) * Math.min(1, 5 * dt);
    this.camera.position.z += (cz * 0.55 + 42 - this.camera.position.z) * Math.min(1, 5 * dt);
    this.camera.lookAt(cx * 0.5, 0, cz * 0.5);
  }

  private sendTelemetry(dt: number): void {
    this.telemetryTimer += dt;
    if (this.telemetryTimer < 1 / 15) return;
    this.telemetryTimer = 0;

    const blips = this.ships.map((s) => ({
      slot: s.player.slot,
      x: Math.max(0, Math.min(255, Math.round(((s.x + ARENA_HALF_W) / (ARENA_HALF_W * 2)) * 255))),
      z: Math.max(0, Math.min(255, Math.round(((s.z + ARENA_HALF_H) / (ARENA_HALF_H * 2)) * 255))),
    }));

    const sorted = [...this.ships].sort((a, b) => b.score - a.score || b.hp - a.hp);
    for (const ship of this.ships) {
      const rank = sorted.indexOf(ship) + 1;
      const speedKmh = Math.round(Math.hypot(ship.vx, ship.vz) * 3.5);
      const dodgeReadyPct = Math.round(Math.max(0, 1 - ship.dodgeCooldown / 1.9) * 100);
      this.sdk?.sendTelemetry(ship.player.id, {
        rank,
        totalPlayers: this.ships.length,
        lap: this.roundNumber,
        maxLaps: ROUNDS_TO_WIN,
        speedKmh,
        turboCharge: dodgeReadyPct,
        turboZone: dodgeReadyPct >= 100 ? 2 : 0,
        itemId: ship.powerUp === 'missile' ? 1 : ship.powerUp === 'shield' ? 4 : ship.powerUp === 'triple' ? 5 : 0,
        fruits: Math.round(ship.hp / 10),
        boostCooldownSec: Math.ceil(ship.boostCooldown),
        karts: blips,
      });
    }
  }
}
