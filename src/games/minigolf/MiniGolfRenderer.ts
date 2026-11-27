import * as THREE from 'three';
import { GolfHoleDef } from './GolfCourses';
import {
  GOLF_BALL_RADIUS,
  GOLF_MAX_PARTICLES,
  GolfBallState,
  GolfHazardType,
} from './MiniGolfState';

export interface GolfRenderPlayer {
  slot: number;
  color: string;
  x: number;
  z: number;
  aim: number;
  state: GolfBallState;
  chargePower: number;
}

export interface GolfRenderFrame {
  players: GolfRenderPlayer[];
  time: number;
}

interface BallVisual {
  group: THREE.Group;
  ball: THREE.Mesh;
  shadow: THREE.Mesh;
  aimLine: THREE.Line;
  powerRing: THREE.Mesh;
  trail: THREE.Line;
  trailPositions: Float32Array;
  trailCount: number;
}

interface GolfParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

function safeColor(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#94a3b8';
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class MiniGolfRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hole: GolfHoleDef | null = null;
  private center = new THREE.Vector3();
  private cameraGoal = new THREE.Vector3();
  private cameraIntroFrom = new THREE.Vector3();
  private introStart = 0;
  private ballVisuals = new Map<number, BallVisual>();
  private particles: GolfParticle[] = [];
  private particleGeometry: THREE.SphereGeometry | null = null;
  private flag: THREE.Mesh | null = null;
  private lavaMaterials: THREE.MeshStandardMaterial[] = [];
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
    this.resize();
  }

  setHole(hole: GolfHoleDef): void {
    this.hole = hole;
    this.disposeSceneContents();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(hole.palette.sky);
    this.scene.fog = new THREE.Fog(
      hole.palette.fog,
      Math.max(18, (hole.bounds.maxX - hole.bounds.minX) * 1.2),
      Math.max(90, (hole.bounds.maxX - hole.bounds.minX) * 4)
    );
    this.buildScene(hole);
    this.fitCamera();
    this.cameraIntroFrom.copy(this.cameraGoal).add(
      new THREE.Vector3(0, 10, 12)
    );
    this.camera.position.copy(this.cameraIntroFrom);
    this.camera.lookAt(this.center);
    this.introStart = performance.now();
    this.lastTime = performance.now() / 1000;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width) || 900);
    const height = Math.max(1, Math.round(rect.height) || 620);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    if (this.introStart <= 0) {
      this.camera.position.copy(this.cameraGoal);
      this.camera.lookAt(this.center);
    }
  }

  update(frame: GolfRenderFrame): void {
    if (!this.hole) return;
    const now = performance.now();
    const introT = Math.min(1, (now - this.introStart) / 1200);
    if (introT < 1) {
      const t = easeOutCubic(introT);
      this.camera.position.lerpVectors(
        this.cameraIntroFrom,
        this.cameraGoal,
        t
      );
      this.camera.lookAt(this.center);
    } else {
      this.camera.position.copy(this.cameraGoal);
      this.camera.lookAt(this.center);
    }

    if (this.flag) {
      this.flag.rotation.y = Math.sin(frame.time * 2.2) * 0.16;
    }
    for (let i = 0; i < this.lavaMaterials.length; i++) {
      this.lavaMaterials[i].emissiveIntensity =
        0.55 + 0.25 * Math.sin(frame.time * 2.4 + i * 1.7);
    }

    const activeSlots = new Set<number>();
    for (const player of frame.players) {
      activeSlots.add(player.slot);
      this.updateBallVisual(player);
    }
    for (const [slot, visual] of this.ballVisuals) {
      if (activeSlots.has(slot)) continue;
      visual.group.visible = false;
      visual.aimLine.visible = false;
      visual.powerRing.visible = false;
      visual.trail.visible = false;
    }

    const dt = Math.min(0.05, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
  }

  emitPutt(x: number, z: number, color: string): void {
    this.spawnParticles(x, 0.18, z, color, 5, 1.2);
  }

  emitHole(x: number, z: number, color: string): void {
    const palette = this.hole?.palette;
    const colors = [color, palette?.accent ?? '#fbbf24', '#f8fafc'];
    for (let i = 0; i < 24; i++) {
      this.spawnParticles(
        x,
        0.25,
        z,
        colors[i % colors.length],
        1,
        2.8
      );
    }
  }

  emitHazard(
    x: number,
    z: number,
    hazard: GolfHazardType,
    color: string
  ): void {
    this.spawnParticles(
      x,
      0.2,
      z,
      hazard === 'lava' ? color : this.hole?.palette.water ?? color,
      14,
      2.4
    );
  }

  dispose(): void {
    this.disposeSceneContents();
    this.renderer.dispose();
  }

  private buildScene(hole: GolfHoleDef): void {
    const palette = hole.palette;
    const { minX, minZ, maxX, maxZ } = hole.bounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    this.center.set(cx, 0, cz);

    const hemi = new THREE.HemisphereLight(palette.sky, palette.ground, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(cx - width * 0.3, Math.max(width, depth) * 1.2, cz + depth);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(palette.accent, 0.35);
    fill.position.set(cx + width, 10, cz - depth);
    this.scene.add(fill);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 34, depth + 34),
      new THREE.MeshStandardMaterial({
        color: palette.ground,
        roughness: 1,
      })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(cx, -0.12, cz);
    this.scene.add(outer);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({
        color: palette.floor,
        roughness: 0.9,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    this.scene.add(floor);

    this.addFloorGrid(hole);

    for (const wall of hole.walls) {
      this.addWall(wall.ax, wall.az, wall.bx, wall.bz, wall.thickness, palette);
    }
    this.addPerimeterWalls(hole);

    for (const rock of hole.rocks) {
      this.addRock(rock.x, rock.z, rock.r, palette);
    }

    for (const zone of hole.zones) {
      this.addZone(hole, zone);
    }

    this.addHoleAndFlag(hole);
    this.addTee(hole);

    for (const decor of hole.decor) {
      this.addDecor(hole, decor.type, decor.x, decor.z, decor.scale, decor.rotation);
    }
  }

  private addFloorGrid(hole: GolfHoleDef): void {
    const { minX, minZ, maxX, maxZ } = hole.bounds;
    const positions: number[] = [];
    const step = 2;
    for (let x = minX + step; x < maxX; x += step) {
      positions.push(x, 0.012, minZ, x, 0.012, maxZ);
    }
    for (let z = minZ + step; z < maxZ; z += step) {
      positions.push(minX, 0.012, z, maxX, 0.012, z);
    }
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: hole.palette.floorAlt,
      transparent: true,
      opacity: hole.theme === 'neon' ? 0.65 : 0.24,
    });
    const lines = new THREE.LineSegments(geometry, material);
    this.scene.add(lines);
  }

  private addWall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    thickness: number,
    palette: GolfHoleDef['palette']
  ): void {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return;
    const angle = -Math.atan2(dz, dx);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(length + thickness, 0.6, thickness),
      new THREE.MeshStandardMaterial({
        color: palette.wall,
        roughness: 0.8,
      })
    );
    base.position.set((ax + bx) / 2, 0.3, (az + bz) / 2);
    base.rotation.y = angle;
    this.scene.add(base);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(length + thickness, 0.08, thickness + 0.03),
      new THREE.MeshStandardMaterial({
        color: palette.wallTop,
        roughness: 0.55,
        emissive: palette.wallTop,
        emissiveIntensity: 0.12,
      })
    );
    trim.position.set((ax + bx) / 2, 0.64, (az + bz) / 2);
    trim.rotation.y = angle;
    this.scene.add(trim);
  }

  private addPerimeterWalls(hole: GolfHoleDef): void {
    const { minX, minZ, maxX, maxZ } = hole.bounds;
    const t = 0.34;
    this.addWall(minX, minZ, maxX, minZ, t, hole.palette);
    this.addWall(maxX, minZ, maxX, maxZ, t, hole.palette);
    this.addWall(maxX, maxZ, minX, maxZ, t, hole.palette);
    this.addWall(minX, maxZ, minX, minZ, t, hole.palette);
  }

  private addRock(
    x: number,
    z: number,
    radius: number,
    palette: GolfHoleDef['palette']
  ): void {
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
    const material = new THREE.MeshStandardMaterial({
      color: palette.wall,
      roughness: 0.95,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, radius * 0.72, z);
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    this.scene.add(mesh);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.2, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x + radius * 0.12, 0.015, z + radius * 0.12);
    this.scene.add(shadow);
  }

  private addZone(hole: GolfHoleDef, zone: GolfHoleDef['zones'][number]): void {
    const palette = hole.palette;
    let geometry: THREE.BufferGeometry;
    let centerX = zone.x;
    let centerZ = zone.z;
    if (zone.shape === 'rect') {
      geometry = new THREE.PlaneGeometry(zone.w ?? 0, zone.h ?? 0);
      centerX = zone.x + (zone.w ?? 0) / 2;
      centerZ = zone.z + (zone.h ?? 0) / 2;
    } else {
      geometry = new THREE.CircleGeometry(zone.r ?? 0, 32);
    }

    if (zone.type === 'wind') {
      const material = new THREE.MeshBasicMaterial({
        color: palette.accent,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(centerX, 0.02, centerZ);
      this.scene.add(mesh);

      const force = new THREE.Vector3(
        zone.forceX ?? 0,
        0,
        zone.forceZ ?? 0
      );
      if (force.lengthSq() > 0) {
        force.normalize();
        const length = Math.min(zone.w ?? 3, zone.h ?? 3) * 0.35;
        for (let i = -1; i <= 1; i++) {
          const origin = new THREE.Vector3(
            centerX + force.z * i * 1.4,
            0.35,
            centerZ - force.x * i * 1.4
          );
          const arrow = new THREE.ArrowHelper(
            force,
            origin,
            length,
            new THREE.Color(palette.accent),
            length * 0.45,
            length * 0.28
          );
          this.scene.add(arrow);
        }
      }
      return;
    }

    const color =
      zone.type === 'sand'
        ? palette.sand
        : zone.type === 'water'
        ? palette.water
        : palette.hazard;
    const material =
      zone.type === 'lava'
        ? new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.7,
            roughness: 0.5,
          })
        : new THREE.MeshStandardMaterial({
            color,
            roughness: zone.type === 'water' ? 0.18 : 1,
            metalness: zone.type === 'water' ? 0.1 : 0,
            transparent: zone.type === 'water',
            opacity: zone.type === 'water' ? 0.86 : 1,
          });
    if (material instanceof THREE.MeshStandardMaterial && zone.type === 'lava') {
      this.lavaMaterials.push(material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centerX, zone.type === 'sand' ? 0.018 : 0.025, centerZ);
    this.scene.add(mesh);
  }

  private addHoleAndFlag(hole: GolfHoleDef): void {
    const palette = hole.palette;
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.06, 28),
      new THREE.MeshBasicMaterial({ color: palette.hole })
    );
    cup.position.set(hole.hole.x, 0.03, hole.hole.z);
    this.scene.add(cup);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.68, 32),
      new THREE.MeshBasicMaterial({
        color: palette.flag,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(hole.hole.x, 0.035, hole.hole.z);
    this.scene.add(ring);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.4,
        metalness: 0.3,
      })
    );
    pole.position.set(hole.hole.x, 0.9, hole.hole.z);
    this.scene.add(pole);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.4),
      new THREE.MeshStandardMaterial({
        color: palette.flag,
        side: THREE.DoubleSide,
        roughness: 0.7,
      })
    );
    flag.position.set(hole.hole.x + 0.38, 1.55, hole.hole.z);
    this.scene.add(flag);
    this.flag = flag;
  }

  private addTee(hole: GolfHoleDef): void {
    const tee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.035, 24),
      new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        transparent: true,
        opacity: 0.75,
      })
    );
    tee.position.set(hole.tee.x, 0.03, hole.tee.z);
    this.scene.add(tee);
  }

  private addDecor(
    hole: GolfHoleDef,
    type: GolfHoleDef['decor'][number]['type'],
    x: number,
    z: number,
    scale: number,
    rotation: number
  ): void {
    const palette = hole.palette;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    group.rotation.y = rotation;

    if (type === 'palm' || type === 'tree') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 2.2, 7),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 })
      );
      trunk.position.y = 1.1;
      group.add(trunk);
      const leafColor = type === 'palm' ? 0x2f9e44 : 0x166534;
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(
          new THREE.ConeGeometry(0.55, 1.3, 6),
          new THREE.MeshStandardMaterial({
            color: leafColor,
            roughness: 0.9,
            flatShading: true,
          })
        );
        const angle = (i / 5) * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.42, 2.15, Math.sin(angle) * 0.42);
        leaf.rotation.z = Math.PI / 2.7;
        leaf.rotation.y = -angle;
        group.add(leaf);
      }
    } else if (type === 'neon-pylon') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.8, 0.5),
        new THREE.MeshStandardMaterial({
          color: palette.wall,
          roughness: 0.5,
          metalness: 0.5,
        })
      );
      base.position.y = 0.9;
      group.add(base);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 1.2, 0.56),
        new THREE.MeshStandardMaterial({
          color: palette.accent,
          emissive: palette.accent,
          emissiveIntensity: 1.2,
          roughness: 0.3,
        })
      );
      glow.position.y = 0.95;
      group.add(glow);
    } else if (type === 'ice-crystal') {
      const crystal = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 2.1, 6),
        new THREE.MeshStandardMaterial({
          color: palette.wallTop,
          emissive: palette.accent,
          emissiveIntensity: 0.25,
          roughness: 0.2,
          metalness: 0.1,
          transparent: true,
          opacity: 0.92,
        })
      );
      crystal.position.y = 1.05;
      crystal.rotation.z = 0.12;
      group.add(crystal);
    } else {
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.65, 0),
        new THREE.MeshStandardMaterial({
          color: palette.wall,
          roughness: 0.95,
          flatShading: true,
        })
      );
      rock.position.y = 0.45;
      group.add(rock);
      const ember = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({
          color: palette.hazard,
          emissive: palette.hazard,
          emissiveIntensity: 1.2,
        })
      );
      ember.position.set(0.32, 0.75, 0.1);
      group.add(ember);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    group.add(shadow);

    this.scene.add(group);
  }

  private ensureBallVisual(slot: number, color: string): BallVisual {
    const existing = this.ballVisuals.get(slot);
    if (existing) return existing;

    const safe = safeColor(color);
    const group = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(GOLF_BALL_RADIUS, 20, 14),
      new THREE.MeshStandardMaterial({
        color: safe,
        roughness: 0.32,
        metalness: 0.15,
      })
    );
    ball.position.y = GOLF_BALL_RADIUS;
    group.add(ball);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(GOLF_BALL_RADIUS * 1.45, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);
    this.scene.add(group);

    const aimGeometry = new THREE.BufferGeometry();
    aimGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(6), 3)
    );
    const aimLine = new THREE.Line(
      aimGeometry,
      new THREE.LineBasicMaterial({
        color: safe,
        transparent: true,
        opacity: 0.9,
      })
    );
    aimLine.visible = false;
    this.scene.add(aimLine);

    const powerRing = new THREE.Mesh(
      new THREE.RingGeometry(
        GOLF_BALL_RADIUS * 1.45,
        GOLF_BALL_RADIUS * 1.85,
        32
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    powerRing.rotation.x = -Math.PI / 2;
    powerRing.visible = false;
    this.scene.add(powerRing);

    const trailPositions = new Float32Array(24 * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(trailPositions, 3)
    );
    trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: safe,
        transparent: true,
        opacity: 0.35,
      })
    );
    trail.visible = false;
    this.scene.add(trail);

    const visual: BallVisual = {
      group,
      ball,
      shadow,
      aimLine,
      powerRing,
      trail,
      trailPositions,
      trailCount: 0,
    };
    this.ballVisuals.set(slot, visual);
    return visual;
  }

  private updateBallVisual(player: GolfRenderPlayer): void {
    const visual = this.ensureBallVisual(player.slot, player.color);
    const holed = player.state === 'holed';
    visual.group.visible = !holed;
    visual.group.position.set(player.x, 0, player.z);
    visual.ball.visible = !holed;
    visual.shadow.visible = !holed;

    const showAim =
      !holed && (player.state === 'aiming' || player.state === 'charging');
    visual.aimLine.visible = showAim;
    if (showAim) {
      const positions = visual.aimLine.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      const dx = Math.cos(player.aim) * 3.2;
      const dz = Math.sin(player.aim) * 3.2;
      positions.setXYZ(0, player.x, 0.28, player.z);
      positions.setXYZ(1, player.x + dx, 0.28, player.z + dz);
      positions.needsUpdate = true;
      visual.aimLine.geometry.computeBoundingSphere();
    }

    const charging = player.state === 'charging';
    visual.powerRing.visible = charging && !holed;
    if (charging) {
      visual.powerRing.position.set(player.x, 0.04, player.z);
      const scale = 0.9 + Math.max(0, Math.min(1, player.chargePower)) * 0.6;
      visual.powerRing.scale.setScalar(scale);
      const material = visual.powerRing.material as THREE.MeshBasicMaterial;
      material.opacity = 0.35 + Math.max(0, Math.min(1, player.chargePower)) * 0.45;
      material.color.set(player.chargePower >= 0.98 ? '#facc15' : '#ffffff');
    }

    const rolling = player.state === 'rolling' && !holed;
    visual.trail.visible = rolling;
    if (rolling) {
      const arr = visual.trailPositions;
      if (visual.trailCount === 0) {
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] = player.x;
          arr[i + 1] = 0.12;
          arr[i + 2] = player.z;
        }
        visual.trailCount = 1;
      } else {
        for (let i = 0; i < arr.length - 3; i += 3) {
          arr[i] = arr[i + 3];
          arr[i + 1] = arr[i + 4];
          arr[i + 2] = arr[i + 5];
        }
        arr[arr.length - 3] = player.x;
        arr[arr.length - 2] = 0.12;
        arr[arr.length - 1] = player.z;
        visual.trailCount = Math.min(24, visual.trailCount + 1);
      }
      const attribute = visual.trail.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      attribute.needsUpdate = true;
      visual.trail.geometry.setDrawRange(
        0,
        Math.max(0, visual.trailCount)
      );
      visual.trail.geometry.computeBoundingSphere();
    } else {
      visual.trailCount = 0;
      visual.trail.geometry.setDrawRange(0, 0);
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    color: string,
    count: number,
    power: number
  ): void {
    if (!this.particleGeometry) {
      this.particleGeometry = new THREE.SphereGeometry(0.075, 6, 5);
    }
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: safeColor(color),
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(this.particleGeometry, material);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.3,
        y + Math.random() * 0.2,
        z + (Math.random() - 0.5) * 0.3
      );
      this.scene.add(mesh);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * power;
      const life = 0.5 + Math.random() * 0.6;
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 1.2 + Math.random() * power,
        vz: Math.sin(angle) * speed,
        life,
        maxLife: life,
      });
    }
    while (this.particles.length > GOLF_MAX_PARTICLES) {
      const oldest = this.particles.shift();
      if (oldest) {
        this.scene.remove(oldest.mesh);
        (oldest.mesh.material as THREE.Material).dispose();
      }
    }
  }

  private updateParticles(dt: number): void {
    const remaining: GolfParticle[] = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        (particle.mesh.material as THREE.Material).dispose();
        continue;
      }
      particle.vy -= 5.5 * dt;
      particle.mesh.position.x += particle.vx * dt;
      particle.mesh.position.y += particle.vy * dt;
      particle.mesh.position.z += particle.vz * dt;
      if (particle.mesh.position.y < 0.03) {
        particle.mesh.position.y = 0.03;
        particle.vy = Math.abs(particle.vy) * 0.35;
        particle.vx *= 0.8;
        particle.vz *= 0.8;
      }
      const t = particle.life / particle.maxLife;
      particle.mesh.scale.setScalar(0.35 + t * 0.9);
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      remaining.push(particle);
    }
    this.particles = remaining;
  }

  private fitCamera(): void {
    if (!this.hole) return;
    const { minX, minZ, maxX, maxZ } = this.hole.bounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const radius = Math.max(4, Math.hypot(width, depth) / 2);
    const fovY = (this.camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(0.4, this.camera.aspect));
    const fit = (radius / Math.sin(Math.min(fovY, fovX) / 2)) * 0.8;
    const direction = new THREE.Vector3(0, 0.78, 1).normalize();
    this.cameraGoal
      .set((minX + maxX) / 2, 0, (minZ + maxZ) / 2)
      .add(direction.multiplyScalar(fit));
    this.center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.camera.lookAt(this.center);
  }

  private disposeSceneContents(): void {
    for (const particle of this.particles) {
      (particle.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    if (this.particleGeometry) {
      this.particleGeometry.dispose();
      this.particleGeometry = null;
    }
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh | THREE.Line;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const material = (mesh as THREE.Mesh).material;
      if (Array.isArray(material)) {
        material.forEach((item) => materials.add(item));
      } else if (material) {
        materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.scene.clear();
    this.ballVisuals.clear();
    this.flag = null;
    this.lavaMaterials = [];
  }
}
