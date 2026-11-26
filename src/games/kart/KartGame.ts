import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { KartAudioEngine } from '../../audio/KartAudioEngine';
import { HostSDKContext, PlatformGame, TrackMapId } from '../../sdk/GameSDK';
import {
  KartState,
  computeBotInput,
  createKartMesh,
  stepKartPhysics,
} from './KartPhysics';
import { TrackBuilder } from './TrackBuilder';

interface Projectile {
  type: 'missile' | 'bomb' | 'tnt';
  ownerId: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  targetId?: string;
  ttl: number;
  mesh: THREE.Mesh;
}

export class KartGame implements PlatformGame {
  id = 'nitro-kart-3d';
  title = 'Nitro Kart 3D (CTR Edition)';
  subtitle =
    'Balapan 3D HD ala Crash Team Racing untuk 1–10 pemain! Karakter CTR unik, Crash Cove Island, 3-Stage Turbo Boost, dan Hybrid Split-Screen / Stadium Camera.';
  badge = 'GAME UTAMA • 3D HD RACING';
  accentColor = '#ff6b2b';
  coverImage = '/images/nitro-kart-cover.png';
  minPlayers = 1;
  maxPlayers = 10;
  controllerLayout: 'racing-ctr' = 'racing-ctr';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private cameras: THREE.PerspectiveCamera[] = [];
  private camTargets: THREE.Vector3[] = [];
  private stadiumCam: THREE.PerspectiveCamera | null = null;
  private stadiumTarget = new THREE.Vector3();
  private track: TrackBuilder | null = null;
  private audio = new KartAudioEngine();
  private lastCountdownBeep = 4;
  private karts: KartState[] = [];
  private projectiles: Projectile[] = [];
  private crashSparks: { mesh: THREE.Mesh; vel: THREE.Vector3; ttl: number }[] = [];

  private rafId: number | null = null;
  private lastTime = 0;
  private frameDt = 1 / 60;
  private accumulator = 0;
  private raceTime = 0;
  private telemetryTimer = 0;
  private forceSplitScreen = false;
  maxLaps = 3;
  selectedMap: TrackMapId = 'crash-cove';

  private racePhase: 'countdown' | 'racing' | 'celebrating' | 'finished' = 'countdown';
  private countdownTimer = 3.5;

  private hudEl: HTMLElement | null = null;
  private lapHudEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;
  private startLayerEl: HTMLElement | null = null;
  private finishLayerEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private leaderboardEl: HTMLElement | null = null;
  private minimapCanvas: HTMLCanvasElement | null = null;
  private warningEl: HTMLElement | null = null;
  private finishShownForSlots = new Set<number>();
  private finishResultsTimeout: number | null = null;
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private prevPosMap = new Map<string, THREE.Vector3>();
  private prevHeadingMap = new Map<string, number>();
  private tmpDesiredPos = new THREE.Vector3();
  private tmpDesiredTgt = new THREE.Vector3();
  private tmpRenderPos = new THREE.Vector3();
  private lastLeaderboardHtml = '';

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.karts = [];
    this.projectiles = [];
    this.crashSparks = [];
    this.raceTime = 0;
    this.accumulator = 0;
    this.racePhase = 'countdown';
    this.countdownTimer = 3.5;
    this.finishShownForSlots.clear();
    if (this.finishResultsTimeout !== null) {
      clearTimeout(this.finishResultsTimeout);
      this.finishResultsTimeout = null;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setScissorTest(true);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const bgHex =
      this.selectedMap === 'neon-canyon'
        ? '#1e1b4b'
        : this.selectedMap === 'ice-peak'
        ? '#e0f2fe'
        : '#7dd3fc';
    const fogHex =
      this.selectedMap === 'neon-canyon'
        ? '#311042'
        : this.selectedMap === 'ice-peak'
        ? '#f0f9ff'
        : '#bae6fd';
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(fogHex, 360, 1300);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene = scene;

    // HD Three-Point Lighting
    const hemiIntensity = this.selectedMap === 'neon-canyon' ? 0.75 : 1.0;
    const hemi = new THREE.HemisphereLight(
      this.selectedMap === 'neon-canyon' ? '#c084fc' : '#e0f2fe',
      this.selectedMap === 'neon-canyon' ? '#0f172a' : this.selectedMap === 'ice-peak' ? '#94a3b8' : '#14532d',
      hemiIntensity
    );
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(
      this.selectedMap === 'neon-canyon' ? '#f472b6' : '#fffbeb',
      this.selectedMap === 'neon-canyon' ? 1.4 : 1.85
    );
    sun.position.set(140, 210, 110);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 650;
    const d = 340;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);

    this.track = new TrackBuilder(scene, this.selectedMap);
    this.spawnKarts(sdk);
    this.buildOverlayUI(container);
    this.audio.unlock();
    this.lastCountdownBeep = 4;

    window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true });
    window.addEventListener('keydown', this.unlockAudioOnce, { once: true });
    window.addEventListener('resize', this.onResize);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private spawnKarts(sdk: HostSDKContext): void {
    if (!this.scene || !this.track) return;
    const players = sdk.getPlayers();
    const trackLength = Math.max(1, this.track.curve.getLength());
    const startPt = this.track.curve.getPointAt(0);
    const startTan = this.track.curve.getTangentAt(0).normalize();
    const baseHeading = Math.atan2(startTan.x, startTan.z);

    this.cameras = [];
    this.camTargets = [];

    players.forEach((p, idx) => {
      // F1 / Kart staggered 2-column starting grid along the track curve
      const col = idx % 2 === 0 ? -4.2 : 4.2;
      const backDist = 5.2 + idx * 3.8;
      const spawnT = (((1 - backDist / trackLength) % 1) + 1) % 1;
      const lanePt = this.track!.curve.getPointAt(spawnT);
      const laneTan = this.track!.curve.getTangentAt(spawnT).normalize();
      const laneRight = new THREE.Vector3().crossVectors(laneTan, new THREE.Vector3(0, 1, 0)).normalize();
      const laneHeading = Math.atan2(laneTan.x, laneTan.z);
      const pos = lanePt.clone().addScaledVector(laneRight, col);

      const {
        group,
        flameLeft,
        flameRight,
        sparkMesh,
        shieldMesh,
        frontWheels,
        allWheels,
        driverGroup,
        headGroup,
        steerWheel,
        wrongWaySprite,
      } = createKartMesh(p.color, p.slot, p.characterId, p.name);
      group.position.copy(pos);
      group.rotation.y = laneHeading;
      this.scene!.add(group);

      const spawnSample = this.track!.sampleNearestSpline(pos.x, pos.z);

      this.karts.push({
        id: p.id,
        slot: p.slot,
        name: p.name,
        color: p.color,
        isBot: p.isBot,
        position: pos,
        heading: laneHeading,
        speed: 0,
        verticalVel: 0,
        grounded: true,
        drifting: false,
        driftDir: 0,
        turboCharge: 0,
        turboReserve: 0,
        boostCooldown: 15,
        prevBoostPressed: false,
        prevItemPressed: false,
        splineT: spawnSample.t,
        furthestCheckpoint: 0,
        lap: 1,
        totalProgress: spawnSample.t > 0.8 ? spawnSample.t - 1 : spawnSample.t,
        rank: idx + 1,
        finished: false,
        finishTime: 0,
        eliminated: false,
        offCameraTimer: 0,
        heldItem: 0,
        fruits: 0,
        shieldTimer: 0,
        spinoutTimer: 0,
        spinoutDuration: 0.9,
        obstacleCooldown: 0,
        mesh: group,
        flameLeft,
        flameRight,
        sparkMesh,
        shieldMesh,
        frontWheels,
        allWheels,
        driverGroup,
        headGroup,
        steerWheel,
        wrongWaySprite,
      });

      const splitFov = players.length >= 5 ? 76 : 68;
      const cam = new THREE.PerspectiveCamera(splitFov, 1, 0.5, 2400);
      const backX = Math.sin(laneHeading) * 9.8;
      const backZ = Math.cos(laneHeading) * 9.8;
      cam.position.set(pos.x - backX, pos.y + 4.8, pos.z - backZ);
      const tgt = new THREE.Vector3(pos.x, pos.y + 1.5, pos.z);
      cam.lookAt(tgt);
      this.cameras.push(cam);
      this.camTargets.push(tgt);
    });

    const stadiumFov = players.length >= 5 ? 78 : 58;
    const stadiumBack = players.length >= 5 ? 44 : 26;
    const stadiumHeight = players.length >= 5 ? 32 : 18;
    this.stadiumCam = new THREE.PerspectiveCamera(stadiumFov, 1, 0.5, 2400);
    const backX = Math.sin(baseHeading) * stadiumBack;
    const backZ = Math.cos(baseHeading) * stadiumBack;
    this.stadiumCam.position.set(startPt.x - backX, startPt.y + stadiumHeight, startPt.z - backZ);
    this.stadiumTarget.set(startPt.x, startPt.y + 1.5, startPt.z);
    this.stadiumCam.lookAt(this.stadiumTarget);
  }

  private buildOverlayUI(container: HTMLElement): void {
    const topbar = document.createElement('div');
    topbar.className = 'game-topbar';
    topbar.innerHTML = `
      <div class="hud-pill">
        <span style="color:var(--accent);">NITRO KART 3D</span>
        <span id="lap-hud-label" style="color:var(--warn);">LAP 1 / ${this.maxLaps}</span>
        <span id="race-mode-label"></span>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="btn-sound-toggle" class="btn btn-secondary" style="padding:7px 12px;font-size:12px;">
          Suara: ON
        </button>
        <button id="btn-cam-toggle" class="btn btn-secondary" style="padding:7px 12px;font-size:12px;">
          Ganti Kamera (Split / Stadium)
        </button>
        <button id="btn-exit-game" class="btn btn-danger" style="padding:7px 12px;font-size:12px;">
          Keluar ke Lobby
        </button>
      </div>
    `;
    container.appendChild(topbar);

    this.hudEl = topbar.querySelector('#race-mode-label');
    this.lapHudEl = topbar.querySelector('#lap-hud-label');

    const soundBtn = topbar.querySelector('#btn-sound-toggle') as HTMLButtonElement | null;
    soundBtn?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.isMuted());
      soundBtn.textContent = this.audio.isMuted() ? 'Suara: OFF' : 'Suara: ON';
    });

    const cd = document.createElement('div');
    cd.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:28;pointer-events:none;font-size:96px;font-weight:900;color:#fde047;text-shadow:0 8px 32px rgba(0,0,0,0.75);';
    container.appendChild(cd);
    this.countdownEl = cd;

    const startLayer = document.createElement('div');
    startLayer.className = 'kart-start-layer';
    startLayer.style.cssText =
      'position:absolute;inset:0;z-index:27;pointer-events:none;overflow:hidden;';
    container.appendChild(startLayer);
    this.startLayerEl = startLayer;
    this.showStartPlayerNames();

    const finishLayer = document.createElement('div');
    finishLayer.style.cssText =
      'position:absolute;inset:0;z-index:26;pointer-events:none;overflow:hidden;';
    container.appendChild(finishLayer);
    this.finishLayerEl = finishLayer;

    const res = document.createElement('div');
    res.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:40;background:rgba(8,12,23,0.82);backdrop-filter:blur(8px);';
    container.appendChild(res);
    this.resultsEl = res;
    topbar.querySelector('#btn-cam-toggle')?.addEventListener('click', () => {
      this.forceSplitScreen = !this.forceSplitScreen;
    });
    topbar.querySelector('#btn-exit-game')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    const lb = document.createElement('div');
    lb.style.cssText =
      'position:absolute;bottom:14px;left:14px;z-index:25;background:rgba(8,12,23,0.75);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:10px 14px;font-size:12px;min-width:210px;pointer-events:none;';
    container.appendChild(lb);
    this.leaderboardEl = lb;

    const mm = document.createElement('canvas');
    mm.width = 176;
    mm.height = 144;
    mm.style.cssText =
      'position:absolute;top:62px;left:14px;z-index:25;background:rgba(8,12,23,0.78);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.18);border-radius:14px;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    container.appendChild(mm);
    this.minimapCanvas = mm;

    const warn = document.createElement('div');
    warn.style.cssText =
      'position:absolute;top:64px;right:14px;z-index:25;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
    container.appendChild(warn);
    this.warningEl = warn;
  }

  private loop = (now: number): void => {
    const frameDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.frameDt = frameDt;
    this.accumulator += frameDt;

    const FIXED_DT = 1 / 60;
    while (this.accumulator >= FIXED_DT) {
      for (const k of this.karts) {
        let prev = this.prevPosMap.get(k.id);
        if (!prev) {
          prev = new THREE.Vector3();
          this.prevPosMap.set(k.id, prev);
        }
        prev.copy(k.position);
        this.prevHeadingMap.set(k.id, k.heading);
      }
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    const renderAlpha = Math.max(0, Math.min(1, this.accumulator / FIXED_DT));
    this.track?.updateVisuals(this.raceTime);
    this.renderScene(renderAlpha);
    this.renderMinimap();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private fixedUpdate(dt: number): void {
    if (!this.track || !this.sdk || !this.scene) return;

    if (this.racePhase === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownEl) {
        if (this.countdownTimer > 2.5) {
          this.countdownEl.textContent = '3';
          this.countdownEl.style.color = '#ef4444';
          if (this.lastCountdownBeep > 3) {
            this.lastCountdownBeep = 3;
            this.audio.playTone(440, 0.14, 'sine', 0.14);
          }
        } else if (this.countdownTimer > 1.5) {
          this.countdownEl.textContent = '2';
          this.countdownEl.style.color = '#facc15';
          if (this.lastCountdownBeep > 2) {
            this.lastCountdownBeep = 2;
            this.audio.playTone(440, 0.14, 'sine', 0.14);
          }
        } else if (this.countdownTimer > 0.5) {
          this.countdownEl.textContent = '1';
          this.countdownEl.style.color = '#22c55e';
          if (this.lastCountdownBeep > 1) {
            this.lastCountdownBeep = 1;
            this.audio.playTone(440, 0.14, 'sine', 0.14);
          }
        } else {
          this.countdownEl.textContent = 'GO!';
          this.countdownEl.style.color = '#00e5ff';
          this.startLayerEl?.classList.add('leaving');
          if (this.lastCountdownBeep > 0) {
            this.lastCountdownBeep = 0;
            this.audio.playTone(880, 0.28, 'triangle', 0.18);
          }
        }
      }
      if (this.countdownTimer <= 0) {
        this.racePhase = 'racing';
        if (this.countdownEl) this.countdownEl.textContent = '';
        if (this.startLayerEl) {
          this.startLayerEl.innerHTML = '';
          this.startLayerEl.classList.remove('leaving');
        }
        this.sdk.sendVibrate('*', [60]);
      }
      return;
    }

    if (this.racePhase === 'finished') {
      return;
    }

    if (this.racePhase === 'racing') {
      this.raceTime += dt;
    }

    const neutralInput = {
      seq: 0,
      steer: 0,
      gas: false,
      brake: false,
      drift: false,
      item: false,
      boost: false,
      timestamp: 0,
    };

    for (const kart of this.karts) {
      if (kart.eliminated) continue;

      if (kart.finished) {
        // Finished karts can no longer be controlled; smoothly bring them to a stop
        kart.turboReserve = 0;
        kart.drifting = false;
        kart.turboCharge = 0;
        kart.speed *= Math.max(0, 1 - 6 * dt);
        if (Math.abs(kart.speed) < 0.25) kart.speed = 0;
        stepKartPhysics(kart, neutralInput, this.track, dt, () => {}, () => {});
        continue;
      }

      const input = kart.isBot
        ? computeBotInput(kart, this.track)
        : this.sdk.getInput(kart.id) ?? neutralInput;

      stepKartPhysics(
        kart,
        input,
        this.track,
        dt,
        (k) => {
          this.sdk?.sendVibrate(k.id, [35]);
          this.audio.playTone(620, 0.12, 'sawtooth', 0.08);
        },
        (k) => this.spawnItemEffect(k)
      );

      if (!kart.isBot) {
        this.audio.updatePlayerEngine(
          kart.id,
          kart.slot,
          input.gas,
          Math.abs(kart.speed) / 40,
          kart.turboReserve > 0
        );
      }

      if (!kart.finished && kart.lap > this.maxLaps) {
        kart.finished = true;
        kart.finishTime = this.raceTime;
        kart.turboReserve = 0;
        kart.drifting = false;
        kart.turboCharge = 0;
        this.sdk.sendVibrate(kart.id, [100, 50, 100]);
      }

      for (const pad of this.track.boostPads) {
        if (kart.position.distanceToSquared(pad.position) < pad.radius * pad.radius) {
          kart.turboReserve = Math.max(kart.turboReserve, 1.15);
          this.sdk.sendVibrate(kart.id, [25]);
        }
      }

      for (const crate of this.track.crates) {
        if (crate.respawnTimer <= 0) {
          crate.mesh.rotation.y += 2 * dt;
          if (kart.position.distanceToSquared(crate.position) < 6.5) {
            crate.respawnTimer = 4.0;
            crate.mesh.visible = false;
            if (kart.heldItem === 0) {
              kart.heldItem = 1 + Math.floor(Math.random() * 5);
              this.sdk.sendVibrate(kart.id, [20]);
            }
          }
        }
      }

      for (const f of this.track.fruits) {
        if (f.respawnTimer <= 0 && kart.position.distanceToSquared(f.position) < 5.5) {
          f.respawnTimer = 5.0;
          f.mesh.visible = false;
          kart.fruits = Math.min(10, kart.fruits + 1);
        }
      }

      for (const obs of this.track.obstacles) {
        if (obs.respawnTimer > 0) continue;
        if (kart.position.distanceToSquared(obs.position) < obs.radius * obs.radius) {
          if (obs.type === 'nitro-crate') {
            obs.respawnTimer = 6.0;
            obs.mesh.visible = false;
          }
          if (kart.shieldTimer <= 0 && kart.spinoutTimer <= 0 && kart.obstacleCooldown <= 0) {
            const dur = obs.type === 'nitro-crate' ? 1.1 : 0.9;
            kart.spinoutDuration = dur;
            kart.spinoutTimer = dur;
            kart.obstacleCooldown = dur + 1.2;
            kart.speed = Math.max(12, kart.speed * 0.55);
            this.sdk.sendVibrate(kart.id, [160]);
          }
        }
      }
    }

    for (const obs of this.track.obstacles) {
      if (obs.respawnTimer > 0) {
        obs.respawnTimer -= dt;
        if (obs.respawnTimer <= 0) obs.mesh.visible = true;
      }
    }

    for (const crate of this.track.crates) {
      if (crate.respawnTimer > 0) {
        crate.respawnTimer -= dt;
        if (crate.respawnTimer <= 0) crate.mesh.visible = true;
      }
    }
    for (const f of this.track.fruits) {
      if (f.respawnTimer > 0) {
        f.respawnTimer -= dt;
        if (f.respawnTimer <= 0) f.mesh.visible = true;
      }
    }

    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i];
        const b = this.karts[j];
        if (a.eliminated || b.eliminated) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 2.6;
        if (distSq > 0.001 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.65;
          const nx = dx / dist;
          const nz = dz / dist;
          a.position.x -= nx * overlap;
          a.position.z -= nz * overlap;
          b.position.x += nx * overlap;
          b.position.z += nz * overlap;

          // Shield knockback or mutual impact bounce + sparks + sound + haptics
          if ((a.collisionCooldown ?? 0) <= 0 || (b.collisionCooldown ?? 0) <= 0) {
            a.collisionCooldown = 0.35;
            b.collisionCooldown = 0.35;

            if (a.shieldTimer > 0 && b.shieldTimer <= 0) {
              b.spinoutDuration = 0.7;
              b.spinoutTimer = 0.7;
              b.speed *= 0.5;
            } else if (b.shieldTimer > 0 && a.shieldTimer <= 0) {
              a.spinoutDuration = 0.7;
              a.spinoutTimer = 0.7;
              a.speed *= 0.5;
            } else {
              a.speed *= 0.9;
              b.speed *= 0.9;
            }

            const mid = new THREE.Vector3(
              (a.position.x + b.position.x) * 0.5,
              Math.max(a.position.y, b.position.y) + 0.9,
              (a.position.z + b.position.z) * 0.5
            );
            this.spawnCollisionSparks(mid);

            if (!a.isBot || !b.isBot) {
              this.audio.playTone(135, 0.12, 'sawtooth', 0.14);
              if (!a.isBot) this.sdk.sendVibrate(a.id, [80]);
              if (!b.isBot) this.sdk.sendVibrate(b.id, [80]);
            }
          }
        }
      }
    }

    // Update collision sparks
    for (let i = this.crashSparks.length - 1; i >= 0; i--) {
      const sp = this.crashSparks[i];
      sp.ttl -= dt;
      if (sp.ttl <= 0) {
        this.scene.remove(sp.mesh);
        this.crashSparks.splice(i, 1);
        continue;
      }
      sp.mesh.position.addScaledVector(sp.vel, dt);
      sp.vel.y -= 24 * dt;
      const scale = Math.max(0.1, sp.ttl / 0.35);
      sp.mesh.scale.setScalar(scale);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.ttl -= dt;
      if (pr.ttl <= 0) {
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (pr.type === 'missile' && pr.targetId) {
        const target = this.karts.find((k) => k.id === pr.targetId);
        if (target) {
          const dir = target.position.clone().sub(pr.position).normalize();
          pr.velocity.lerp(dir.multiplyScalar(58), 6 * dt);
        }
      }

      pr.position.addScaledVector(pr.velocity, dt);
      pr.mesh.position.copy(pr.position);

      for (const k of this.karts) {
        if (k.id === pr.ownerId || k.eliminated || k.finished) continue;
        if (k.position.distanceToSquared(pr.position) < 6.2) {
          if (k.shieldTimer <= 0) {
            k.spinoutTimer = 1.1;
            this.sdk.sendVibrate(k.id, [180]);
          }
          this.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }

    const splitTargets = this.getSplitTargets();
    const useSplit = this.forceSplitScreen || splitTargets.length <= 4;

    // 5-10 Player Mode: 10-Second Off-Camera Elimination Timer
    if (!useSplit && this.stadiumCam && this.raceTime > 3.0) {
      this.stadiumCam.updateMatrixWorld();
      this.projScreenMatrix.multiplyMatrices(
        this.stadiumCam.projectionMatrix,
        this.stadiumCam.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

      for (const k of this.karts) {
        if (k.eliminated || k.finished) continue;
        const inView =
          this.frustum.containsPoint(k.position) &&
          k.position.distanceTo(this.stadiumCam.position) < 185;

        if (inView) {
          k.offCameraTimer = 0;
        } else {
          k.offCameraTimer += dt;
          if (k.offCameraTimer >= 10.0) {
            k.eliminated = true;
            k.mesh.visible = false;
            this.sdk.sendVibrate(k.id, [250, 80, 250]);
          }
        }
      }
    } else {
      for (const k of this.karts) k.offCameraTimer = 0;
    }

    const sorted = [...this.karts].sort((a, b) => {
      if (a.eliminated && !b.eliminated) return 1;
      if (!a.eliminated && b.eliminated) return -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
    sorted.forEach((k, idx) => {
      k.rank = idx + 1;
    });

    if (useSplit && splitTargets.length >= 1 && splitTargets.length <= 4) {
      splitTargets.forEach((k, viewportIdx) => {
        if (k.finished && !this.finishShownForSlots.has(k.slot)) {
          this.finishShownForSlots.add(k.slot);
          this.showViewportFinishAnimation(k, viewportIdx, splitTargets.length);
        }
      });
    }

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 1 / 15) {
      this.telemetryTimer = 0;
      this.sendAllTelemetry();
      this.updateLeaderboard(sorted);
      this.updateOffCameraWarnings(useSplit);
      const leadLap = Math.min(this.maxLaps, sorted[0]?.lap ?? 1);
      if (this.lapHudEl) this.lapHudEl.textContent = `LAP ${leadLap} / ${this.maxLaps}`;
    }

    // Check Race Finish Condition (Win / Loss)
    const activeKarts = this.karts.filter((k) => !k.eliminated);
    const activeHumans = activeKarts.filter((k) => !k.isBot);
    const allHumansDone =
      activeHumans.length > 0
        ? activeHumans.every((k) => k.finished)
        : activeKarts.some((k) => k.finished);
    const lastSurvivor = !useSplit && this.karts.length > 1 && activeKarts.length <= 1;

    if ((allHumansDone || lastSurvivor) && this.racePhase === 'racing') {
      if (useSplit && splitTargets.length >= 1 && splitTargets.length <= 4) {
        this.racePhase = 'celebrating';
        const finalSorted = [...sorted];
        this.finishResultsTimeout = window.setTimeout(() => {
          this.finishResultsTimeout = null;
          this.finishRace(finalSorted);
        }, 1600);
      } else {
        this.finishRace(sorted);
      }
    }
  }

  private getSplitTargets(): KartState[] {
    const humans = this.karts.filter((k) => !k.isBot);
    return humans.length > 0 ? humans : this.karts;
  }

  private showStartPlayerNames(): void {
    if (!this.startLayerEl) return;
    this.startLayerEl.innerHTML = '';
    this.startLayerEl.classList.remove('leaving');

    const targets = this.getSplitTargets();
    // Only show big player name intro for 1-4 players (skip for 5-10 players)
    if (targets.length < 1 || targets.length > 4) return;

    const count = targets.length;
    const cols = count === 1 ? 1 : 2;
    const rows = Math.ceil(count / cols);

    targets.forEach((kart, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const cell = document.createElement('div');
      cell.className = `kart-start-viewport${count === 1 ? ' single-player' : ''}`;
      cell.style.left = `${(col / cols) * 100}%`;
      cell.style.top = `${(row / rows) * 100}%`;
      cell.style.width = `${100 / cols}%`;
      cell.style.height = `${100 / rows}%`;
      cell.style.setProperty('--player-color', kart.color);

      const banner = document.createElement('div');
      banner.className = 'kart-start-banner';
      banner.style.animationDelay = `${index * 0.08}s, ${0.65 + index * 0.08}s`;

      const slotEl = document.createElement('div');
      slotEl.className = 'kart-start-slot';
      slotEl.textContent = `PLAYER ${kart.slot + 1}`;

      const nameEl = document.createElement('div');
      nameEl.className = 'kart-start-name';
      nameEl.textContent = kart.name;

      banner.appendChild(slotEl);
      banner.appendChild(nameEl);
      cell.appendChild(banner);
      this.startLayerEl?.appendChild(cell);
    });
  }

  private showViewportFinishAnimation(kart: KartState, index: number, totalViewports: number): void {
    if (!this.finishLayerEl) return;
    const count = totalViewports;
    const cols = count === 1 ? 1 : 2;
    const rows = Math.ceil(count / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);

    const cell = document.createElement('div');
    cell.className = 'kart-finish-viewport';
    cell.style.left = `${(col / cols) * 100}%`;
    cell.style.top = `${(row / rows) * 100}%`;
    cell.style.width = `${100 / cols}%`;
    cell.style.height = `${100 / rows}%`;

    const confettiColors = ['#facc15', '#ff6b2b', '#00e5ff', '#22c55e', '#f472b6', '#ffffff'];
    let confettiHtml = '';
    for (let c = 0; c < 14; c++) {
      const angle = (c / 14) * Math.PI * 2;
      const dist = 75 + (c % 3) * 40;
      const tx = Math.round(Math.cos(angle) * dist);
      const ty = Math.round(Math.sin(angle) * dist);
      const rot = `${(c * 67) % 360}deg`;
      const color = confettiColors[c % confettiColors.length];
      confettiHtml += `<span class="kart-confetti" style="--tx:${tx}px;--ty:${ty}px;--rot:${rot};background:${color};"></span>`;
    }

    const medal = kart.rank === 1 ? '🏆' : kart.rank === 2 ? '🥈' : kart.rank === 3 ? '🥉' : '🏁';
    cell.innerHTML = `
      ${confettiHtml}
      <div class="kart-finish-banner">
        <div style="font-size:clamp(26px,3.2vw,42px);line-height:1;">${medal}</div>
        <div class="kart-finish-title">FINISH!</div>
        <div class="kart-finish-meta">
          <span style="color:${kart.color};">#${kart.rank}</span> ${kart.name} • ${kart.finishTime.toFixed(1)}s
        </div>
      </div>
    `;
    this.finishLayerEl.appendChild(cell);
  }

  private finishRace(sorted: KartState[]): void {
    if (this.racePhase === 'finished') return;
    this.racePhase = 'finished';
    if (!this.resultsEl) return;

    const winner = sorted[0];
    const rowsHtml = sorted
      .map((k, i) => {
        const status = k.eliminated
          ? '<span style="color:#ef4444;font-weight:800;">ELIMINATED</span>'
          : i === 0
          ? '<span style="color:#facc15;font-weight:900;">🏆 MENANG!</span>'
          : k.finished
          ? `<span style="color:#22c55e;">${k.finishTime.toFixed(1)}s</span>`
          : '<span style="color:var(--muted);">KALAH</span>';

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.05);border-radius:10px;">
            <span style="font-weight:800;"><span style="color:${k.color};">#${i + 1}</span> ${k.name}</span>
            ${status}
          </div>
        `;
      })
      .join('');

    this.resultsEl.style.display = 'flex';
    this.resultsEl.innerHTML = `
      <div style="width:min(92%,460px);background:var(--panel);border:2px solid var(--accent);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 50px rgba(0,0,0,0.6);">
        <div style="text-align:center;">
          <div style="font-size:13px;color:var(--accent-2);font-weight:800;">BALAPAN SELESAI</div>
          <h2 style="margin:4px 0;font-size:28px;font-weight:900;">🏆 ${winner?.name ?? 'Juara'} Menang!</h2>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;">
          ${rowsHtml}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
          <button id="btn-rematch" class="btn btn-primary" style="padding:12px;">Balapan Lagi</button>
          <button id="btn-back-lobby" class="btn btn-secondary" style="padding:12px;">Keluar ke Lobby</button>
        </div>
      </div>
    `;

    this.resultsEl.querySelector('#btn-rematch')?.addEventListener('click', () => {
      if (this.container && this.sdk) {
        const c = this.container;
        const s = this.sdk;
        this.unmount();
        this.mount(c, s);
      }
    });
    this.resultsEl.querySelector('#btn-back-lobby')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });
  }

  private spawnCollisionSparks(origin: THREE.Vector3): void {
    if (!this.scene) return;
    const sparkGeo = new THREE.SphereGeometry(0.24, 6, 6);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? '#fde047' : '#f97316',
      });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.position.copy(origin);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      const spd = 6 + Math.random() * 10;
      this.crashSparks.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * spd, 4 + Math.random() * 7, Math.sin(ang) * spd),
        ttl: 0.35,
      });
    }
  }

  private spawnItemEffect(kart: KartState): void {
    if (!this.scene) return;
    const item = kart.heldItem;
    kart.heldItem = 0;

    if (item === 5) {
      kart.turboReserve = Math.min(4.0, kart.turboReserve + 2.0);
      return;
    }
    if (item === 4) {
      kart.shieldTimer = 6.0;
      return;
    }

    const fwd = new THREE.Vector3(Math.sin(kart.heading), 0, Math.cos(kart.heading));
    const color = item === 1 ? '#ef4444' : item === 2 ? '#0f172a' : '#dc2626';
    const mesh = new THREE.Mesh(
      item === 3 ? new THREE.BoxGeometry(1.8, 1.8, 1.8) : new THREE.SphereGeometry(0.9, 10, 10),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45 })
    );
    const pos = kart.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (item === 3) {
      pos.addScaledVector(fwd, -3.5);
    } else {
      pos.addScaledVector(fwd, 3.2);
    }
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const ahead = this.karts.find((k) => k.rank === Math.max(1, kart.rank - 1) && k.id !== kart.id);
    this.projectiles.push({
      type: item === 1 ? 'missile' : item === 2 ? 'bomb' : 'tnt',
      ownerId: kart.id,
      position: pos,
      velocity: item === 3 ? new THREE.Vector3() : fwd.multiplyScalar(55),
      targetId: item === 1 ? ahead?.id : undefined,
      ttl: item === 3 ? 18 : 4.5,
      mesh,
    });
  }

  private sendAllTelemetry(): void {
    if (!this.sdk || !this.track) return;
    const { minX, maxX, minZ, maxZ } = this.track.bounds;
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;

    const kartsBlip = this.karts.map((k) => ({
      slot: k.slot,
      x: ((k.position.x - minX) / spanX) * 255,
      z: ((k.position.z - minZ) / spanZ) * 255,
    }));

    for (const k of this.karts) {
      if (k.isBot) continue;
      this.sdk.sendTelemetry(k.id, {
        rank: k.rank,
        totalPlayers: this.karts.length,
        lap: Math.min(this.maxLaps, k.lap),
        maxLaps: this.maxLaps,
        speedKmh: Math.round(Math.abs(k.speed) * 3.1),
        turboCharge: k.turboCharge,
        turboZone: k.turboCharge >= 60 ? 2 : 0,
        itemId: k.heldItem,
        fruits: k.fruits,
        boostCooldownSec: Math.ceil(Math.max(0, k.boostCooldown ?? 0)),
        karts: kartsBlip,
      });
    }
  }

  private updateLeaderboard(sorted: KartState[]): void {
    if (!this.leaderboardEl) return;
    const rows = sorted
      .slice(0, 10)
      .map((k) => {
        const rightText = k.eliminated
          ? '<span style="color:#ef4444;font-weight:800;">ELIMINATED</span>'
          : k.finished
          ? `<span style="color:#22c55e;font-weight:800;">FINIS (${k.finishTime.toFixed(1)}s)</span>`
          : `<span style="color:var(--muted);">Lap ${Math.min(this.maxLaps, k.lap)}/${this.maxLaps}</span>`;
        return `
      <div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;opacity:${k.eliminated ? 0.45 : 1};">
        <span><strong style="color:${k.color};">#${k.rank}</strong> ${k.name}</span>
        ${rightText}
      </div>`;
      })
      .join('');
    if (rows !== this.lastLeaderboardHtml) {
      this.lastLeaderboardHtml = rows;
      this.leaderboardEl.innerHTML = rows;
    }
  }

  private updateOffCameraWarnings(useSplit: boolean): void {
    if (!this.warningEl) return;
    if (useSplit) {
      this.warningEl.innerHTML = '';
      return;
    }
    const offList = this.karts.filter((k) => !k.eliminated && !k.finished && k.offCameraTimer > 0.25);
    this.warningEl.innerHTML = offList
      .map((k) => {
        const rem = Math.max(0, 10 - k.offCameraTimer).toFixed(1);
        return `<div style="background:rgba(239,68,68,0.88);color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
          ⚠️ ${k.name} di luar kamera! Eliminasi: ${rem}s
        </div>`;
      })
      .join('');
  }

  private renderScene(alpha = 1): void {
    if (!this.renderer || !this.scene || this.karts.length === 0) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;

    // Interpolate kart visual transforms between previous and current physics states
    if (this.racePhase === 'racing' || this.racePhase === 'celebrating') {
      for (const k of this.karts) {
        if (k.eliminated) continue;
        const prevPos = this.prevPosMap.get(k.id);
        const prevHead = this.prevHeadingMap.get(k.id);
        if (prevPos) {
          this.tmpRenderPos.lerpVectors(prevPos, k.position, alpha);
          k.mesh.position.copy(this.tmpRenderPos);
        }
        if (prevHead !== undefined) {
          let diff = k.heading - prevHead;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          k.mesh.rotation.y = prevHead + diff * alpha;
        }
      }
    }

    const splitTargets = this.getSplitTargets();
    const useSplit = this.forceSplitScreen || splitTargets.length <= 4;

    if (this.hudEl) {
      this.hudEl.textContent = useSplit
        ? splitTargets.length === 1
          ? `1P Chase Cam (${this.karts.length} Kart — Kamera Mengikuti Pemain)`
          : `Split-Screen (${splitTargets.length}P — Kamera Mengikuti Pemain)`
        : `Stadium Cam (${this.karts.length}P — Keluar Kamera 10s = Eliminasi!)`;
    }

    const camLerp = 1 - Math.exp(-14 * this.frameDt);

    if (useSplit) {
      const count = splitTargets.length;
      const cols = count === 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 5;
      const rows = Math.ceil(count / cols);
      const cellW = Math.floor(w / cols);
      const cellH = Math.floor(h / rows);

      for (let i = 0; i < count; i++) {
        const k = splitTargets[i];
        const kartIdx = this.karts.indexOf(k);
        const cam = this.cameras[kartIdx];
        const tgt = this.camTargets[kartIdx];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const vx = col * cellW;
        const vy = h - (row + 1) * cellH;

        const kp = k.mesh.position;
        const kh = k.mesh.rotation.y;
        const camDist = count >= 5 ? 11.8 : 9.8;
        const camHeight = count >= 5 ? 5.8 : 4.8;
        const backX = Math.sin(kh) * camDist;
        const backZ = Math.cos(kh) * camDist;
        this.tmpDesiredPos.set(kp.x - backX, kp.y + camHeight, kp.z - backZ);
        this.tmpDesiredTgt.set(kp.x, kp.y + 1.5, kp.z);

        cam.position.lerp(this.tmpDesiredPos, camLerp);
        tgt.lerp(this.tmpDesiredTgt, camLerp);
        cam.lookAt(tgt);
        cam.aspect = cellW / cellH;
        cam.updateProjectionMatrix();

        this.renderer.setViewport(vx, vy, cellW, cellH);
        this.renderer.setScissor(vx, vy, cellW, cellH);
        this.renderer.render(this.scene, cam);
      }
    } else if (this.stadiumCam) {
      const leader =
        this.karts.find((k) => !k.eliminated && k.rank === 1) ??
        this.karts.find((k) => !k.eliminated) ??
        this.karts[0];
      const lp = leader.mesh.position;
      const lh = leader.mesh.rotation.y;
      const extraPlayers = Math.max(0, this.karts.length - 5);
      const stadiumBack = 42 + extraPlayers * 2.5;
      const stadiumHeight = 30 + extraPlayers * 1.8;
      const backX = Math.sin(lh) * stadiumBack;
      const backZ = Math.cos(lh) * stadiumBack;
      const fwdX = Math.sin(lh) * 8;
      const fwdZ = Math.cos(lh) * 8;
      this.tmpDesiredPos.set(lp.x - backX, lp.y + stadiumHeight, lp.z - backZ);
      this.tmpDesiredTgt.set(lp.x + fwdX, lp.y + 1.5, lp.z + fwdZ);

      this.stadiumCam.position.lerp(this.tmpDesiredPos, 1 - Math.exp(-8 * this.frameDt));
      this.stadiumTarget.lerp(this.tmpDesiredTgt, 1 - Math.exp(-10 * this.frameDt));
      this.stadiumCam.lookAt(this.stadiumTarget);
      this.stadiumCam.aspect = w / h;
      this.stadiumCam.updateProjectionMatrix();

      this.renderer.setViewport(0, 0, w, h);
      this.renderer.setScissor(0, 0, w, h);
      this.renderer.render(this.scene, this.stadiumCam);
    }
  }

  private renderMinimap(): void {
    if (!this.minimapCanvas || !this.track) return;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const pad = 14;
    const { minX, maxX, minZ, maxZ } = this.track.bounds;
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;

    const toX = (wx: number) => pad + ((wx - minX) / spanX) * (w - pad * 2);
    const toY = (wz: number) => pad + ((wz - minZ) / spanZ) * (h - pad * 2);

    ctx.clearRect(0, 0, w, h);

    // Draw track outline
    const samples = this.track.samples;
    if (samples.length > 1) {
      ctx.beginPath();
      ctx.moveTo(toX(samples[0].point.x), toY(samples[0].point.z));
      for (let i = 1; i < samples.length; i += 2) {
        ctx.lineTo(toX(samples[i].point.x), toY(samples[i].point.z));
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 9;
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Start/Finish marker
      const sp = samples[0].point;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(toX(sp.x) - 4, toY(sp.z) - 4, 8, 8);
    }

    // Draw karts + P1/P2... labels
    ctx.font = '800 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const k of this.karts) {
      if (k.eliminated) continue;
      const kx = toX(k.position.x);
      const ky = toY(k.position.z);
      const r = k.rank === 1 ? 5.2 : 4.2;

      ctx.beginPath();
      ctx.arc(kx, ky, r, 0, Math.PI * 2);
      ctx.fillStyle = k.color;
      ctx.fill();
      ctx.lineWidth = k.rank === 1 ? 2 : 1.2;
      ctx.strokeStyle = k.rank === 1 ? '#facc15' : '#ffffff';
      ctx.stroke();

      const tag = `P${k.slot + 1}`;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(8,12,23,0.92)';
      ctx.strokeText(tag, kx, ky - r - 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tag, kx, ky - r - 1);
    }
  }

  private unlockAudioOnce = (): void => {
    this.audio.unlock();
  };

  private onResize = (): void => {
    if (!this.renderer || !this.container) return;
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.finishResultsTimeout !== null) {
      clearTimeout(this.finishResultsTimeout);
      this.finishResultsTimeout = null;
    }
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerdown', this.unlockAudioOnce);
    window.removeEventListener('keydown', this.unlockAudioOnce);
    this.audio.destroy();
    this.renderer?.dispose();
    if (this.container) this.container.innerHTML = '';
  }
}
