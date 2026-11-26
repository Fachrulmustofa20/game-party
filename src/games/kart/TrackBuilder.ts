import * as THREE from 'three';
import { TrackMapId } from '../../sdk/GameSDK';

export interface TrackSample {
  t: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  distSq: number;
}

export interface ItemCrate {
  id: number;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  respawnTimer: number;
}

export interface BoostPad {
  position: THREE.Vector3;
  radius: number;
}

export interface JumpRamp {
  id: number;
  size: 'small' | 'medium' | 'large';
  position: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  halfWidth: number;
  halfLength: number;
  height: number;
  launchVel: number;
}

export interface FruitPickup {
  id: number;
  position: THREE.Vector3;
  mesh: THREE.Group;
  respawnTimer: number;
}

export interface TrackObstacle {
  id: number;
  type: 'oil' | 'barrel' | 'spinner' | 'nitro-crate';
  basePoint: THREE.Vector3;
  rightVec: THREE.Vector3;
  position: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
  respawnTimer: number;
  phase: number;
}

interface TropicalWaveRing {
  mesh: THREE.Mesh;
  geom: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  phaseOffset: number;
  seed: number;
}

export class TrackBuilder {
  readonly curve: THREE.CatmullRomCurve3;
  readonly roadHalfWidth: number;
  readonly difficulty: 'easy' | 'medium' | 'hard';
  readonly samples: { t: number; point: THREE.Vector3; tangent: THREE.Vector3 }[] = [];
  readonly crates: ItemCrate[] = [];
  readonly boostPads: BoostPad[] = [];
  readonly ramps: JumpRamp[] = [];
  readonly fruits: FruitPickup[] = [];
  readonly obstacles: TrackObstacle[] = [];
  readonly bounds = { minX: -320, maxX: 320, minZ: -320, maxZ: 320 };
  readonly mapId: TrackMapId;
  private waterMesh: THREE.Mesh | null = null;
  private wetShoreMat: THREE.MeshStandardMaterial | null = null;
  private tropicalWaves: TropicalWaveRing[] = [];
  private boostPadMat: THREE.MeshStandardMaterial | null = null;
  private snowPoints: THREE.Points | null = null;
  private lastVisualTime = 0;

  constructor(scene: THREE.Scene, mapId: TrackMapId = 'crash-cove') {
    this.mapId = mapId;
    this.difficulty =
      mapId === 'ice-peak' ? 'hard' : mapId === 'neon-canyon' ? 'medium' : 'easy';
    this.roadHalfWidth =
      mapId === 'ice-peak' ? 11.8 : mapId === 'neon-canyon' ? 13.5 : 15.5;
    const waypoints =
      mapId === 'neon-canyon'
        ? [
            new THREE.Vector3(0, 0.2, 220),
            new THREE.Vector3(180, 0.2, 210),
            new THREE.Vector3(265, 1.2, 110),
            new THREE.Vector3(195, 2.0, 0),
            new THREE.Vector3(260, 0.8, -120),
            new THREE.Vector3(140, 0.2, -210),
            new THREE.Vector3(0, 0.8, -145),
            new THREE.Vector3(-135, 0.2, -215),
            new THREE.Vector3(-265, 1.4, -125),
            new THREE.Vector3(-210, 0.6, -10),
            new THREE.Vector3(-275, 0.2, 115),
            new THREE.Vector3(-165, 0.2, 215),
          ]
        : mapId === 'ice-peak'
        ? [
            new THREE.Vector3(0, 0.2, 200),
            new THREE.Vector3(135, 0.6, 190),
            new THREE.Vector3(245, 1.6, 95),
            new THREE.Vector3(235, 2.2, -45),
            new THREE.Vector3(120, 1.0, -160),
            new THREE.Vector3(25, 0.4, -100),
            new THREE.Vector3(-75, 0.2, -195),
            new THREE.Vector3(-215, 1.4, -165),
            new THREE.Vector3(-265, 2.0, -35),
            new THREE.Vector3(-195, 0.8, 95),
            new THREE.Vector3(-135, 0.2, 195),
          ]
        : [
            new THREE.Vector3(0, 0.2, 210),
            new THREE.Vector3(145, 0.2, 205),
            new THREE.Vector3(245, 1.0, 130),
            new THREE.Vector3(270, 1.8, 25),
            new THREE.Vector3(215, 0.8, -90),
            new THREE.Vector3(120, 0.4, -140),
            new THREE.Vector3(45, 0.8, -75),
            new THREE.Vector3(-25, 0.2, -145),
            new THREE.Vector3(-125, 0.2, -205),
            new THREE.Vector3(-235, 1.2, -165),
            new THREE.Vector3(-275, 0.6, -55),
            new THREE.Vector3(-210, 0.2, 30),
            new THREE.Vector3(-255, 1.0, 135),
            new THREE.Vector3(-165, 0.2, 205),
          ];

    this.curve = new THREE.CatmullRomCurve3(waypoints, true, 'catmullrom', 0.5);

    const sampleCount = 520;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      this.samples.push({ t, point, tangent });
      minX = Math.min(minX, point.x - 30);
      maxX = Math.max(maxX, point.x + 30);
      minZ = Math.min(minZ, point.z - 30);
      maxZ = Math.max(maxZ, point.z + 30);
    }
    this.bounds = { minX, maxX, minZ, maxZ };

    this.buildSkyAndOcean(scene);
    this.buildIslandTerrain(scene);
    if (this.mapId === 'crash-cove') {
      this.buildTropicalBeachWaves(scene);
    }
    this.buildRoadAndCurbs(scene);
    this.buildTrackGuardrailsAndTunnel(scene);
    this.buildLandmarks(scene);
    this.buildPalmTrees(scene);
    this.buildRocksAndBushes(scene);
    this.buildBoostPads(scene);
    this.buildRamps(scene);
    this.buildItemCrates(scene);
    this.buildFruits(scene);
    this.buildObstacles(scene);
    if (this.mapId === 'ice-peak') {
      this.buildSnowfall(scene);
    }
  }

  private buildSkyAndOcean(scene: THREE.Scene): void {
    // Rich tropical sky gradient dome
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 16;
    skyCanvas.height = 256;
    const sctx = skyCanvas.getContext('2d')!;
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    if (this.mapId === 'neon-canyon') {
      grad.addColorStop(0.0, '#090d1f');
      grad.addColorStop(0.5, '#3b0764');
      grad.addColorStop(0.85, '#be185d');
      grad.addColorStop(1.0, '#f472b6');
    } else if (this.mapId === 'ice-peak') {
      grad.addColorStop(0.0, '#0369a1');
      grad.addColorStop(0.45, '#7dd3fc');
      grad.addColorStop(0.85, '#e0f2fe');
      grad.addColorStop(1.0, '#ffffff');
    } else {
      grad.addColorStop(0.0, '#0284c7');
      grad.addColorStop(0.45, '#38bdf8');
      grad.addColorStop(0.85, '#bae6fd');
      grad.addColorStop(1.0, '#fef08a');
    }
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 16, 256);

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 28, 18),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    scene.add(skyDome);

    // Stylized fluffy clouds
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.9,
      emissive: '#e0f2fe',
      emissiveIntensity: 0.2,
    });
    const puffGeo = new THREE.SphereGeometry(12, 10, 10);
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const dist = 340 + (i % 3) * 55;
      const cloud = new THREE.Group();
      cloud.position.set(Math.cos(ang) * dist, 75 + (i % 4) * 14, Math.sin(ang) * dist);
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set((p - 1) * 10, p === 1 ? 4 : 0, (p % 2) * 5);
        puff.scale.set(1.3, 0.75, 1.0);
        cloud.add(puff);
      }
      scene.add(cloud);
    }

    // Tropical Ocean around the island
    const waterTexCanvas = document.createElement('canvas');
    waterTexCanvas.width = 256;
    waterTexCanvas.height = 256;
    const wctx = waterTexCanvas.getContext('2d')!;
    wctx.fillStyle =
      this.mapId === 'neon-canyon' ? '#0f172a' : this.mapId === 'ice-peak' ? '#38bdf8' : '#0ea5e9';
    wctx.fillRect(0, 0, 256, 256);
    wctx.fillStyle =
      this.mapId === 'neon-canyon' ? 'rgba(56,189,248,0.22)' : 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 40; i++) {
      wctx.beginPath();
      wctx.ellipse(
        Math.random() * 256,
        Math.random() * 256,
        14 + Math.random() * 24,
        4 + Math.random() * 6,
        0,
        0,
        Math.PI * 2
      );
      wctx.fill();
    }
    const waterTex = new THREE.CanvasTexture(waterTexCanvas);
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(22, 22);
    waterTex.colorSpace = THREE.SRGBColorSpace;

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(3400, 3400),
      new THREE.MeshStandardMaterial({
        map: waterTex,
        roughness: 0.2,
        metalness: 0.15,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -2.2;
    scene.add(water);
    this.waterMesh = water;
  }

  private buildIslandTerrain(scene: THREE.Scene): void {
    const isTropical = this.mapId === 'crash-cove';
    const outerColor =
      this.mapId === 'neon-canyon' ? '#3b0764' : this.mapId === 'ice-peak' ? '#bae6fd' : '#f3d08a';
    const sandTopR = isTropical ? 350 : 360;
    const sandBotR = isTropical ? 388 : 390;
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(sandTopR, sandBotR, 2.6, isTropical ? 72 : 56),
      new THREE.MeshStandardMaterial({ color: outerColor, roughness: 0.92 })
    );
    sand.position.set(0, -1.35, 0);
    sand.receiveShadow = true;
    scene.add(sand);

    if (isTropical) {
      // Wet glistening shoreline sand apron where waves wash up and recede
      const wetShore = new THREE.Mesh(
        new THREE.RingGeometry(336, 351, 72),
        new THREE.MeshStandardMaterial({
          color: '#d6a960',
          roughness: 0.24,
          metalness: 0.12,
          transparent: true,
          opacity: 0.65,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        })
      );
      wetShore.rotation.x = -Math.PI / 2;
      wetShore.position.y = -0.03;
      wetShore.receiveShadow = true;
      scene.add(wetShore);
      this.wetShoreMat = wetShore.material;
    }

    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 256;
    grassCanvas.height = 256;
    const gctx = grassCanvas.getContext('2d')!;
    gctx.fillStyle =
      this.mapId === 'neon-canyon' ? '#1e1b4b' : this.mapId === 'ice-peak' ? '#f1f5f9' : '#228b3b';
    gctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 600; i++) {
      gctx.fillStyle =
        this.mapId === 'neon-canyon'
          ? i % 2 === 0
            ? '#312e81'
            : '#0f172a'
          : this.mapId === 'ice-peak'
          ? i % 2 === 0
            ? '#e2e8f0'
            : '#ffffff'
          : i % 2 === 0
          ? '#2ea043'
          : '#1b7330';
      gctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
    }
    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(32, 32);
    grassTex.colorSpace = THREE.SRGBColorSpace;

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(isTropical ? 318 : 325, isTropical ? 330 : 338, 0.7, isTropical ? 72 : 56),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9 })
    );
    grass.position.set(0, -0.35, 0);
    grass.receiveShadow = true;
    scene.add(grass);
  }

  private sampleTropicalShoreY(r: number): number {
    // Matches sand CylinderGeometry(350, 388, 2.6) centered at y = -1.35 and ocean at y = -2.2
    if (r <= 350) return -0.05;
    const slopeY = -0.05 - ((r - 350) / 38) * 2.6;
    return Math.max(-2.2, slopeY);
  }

  private buildTropicalBeachWaves(scene: THREE.Scene): void {
    // Procedural breaking-surf & lacy white seafoam texture (u = around shore, v = 0 leading foam -> 1 trailing turquoise body)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 256);

    // Base water-to-foam cross-section gradient
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, 256);
    bodyGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    bodyGrad.addColorStop(0.06, 'rgba(255, 255, 255, 0.98)');
    bodyGrad.addColorStop(0.28, 'rgba(240, 253, 255, 0.94)');
    bodyGrad.addColorStop(0.48, 'rgba(56, 189, 248, 0.82)');
    bodyGrad.addColorStop(0.76, 'rgba(14, 165, 233, 0.52)');
    bodyGrad.addColorStop(1.0, 'rgba(2, 132, 199, 0.0)');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, 0, 512, 256);

    // Frothy organic bubbles & scalloped foam lace along leading lip and surf body
    for (let i = 0; i < 260; i++) {
      const bx = Math.random() * 512;
      const by = 10 + Math.pow(Math.random(), 1.7) * 165;
      const rx = 6 + Math.random() * 20;
      const ry = 3 + Math.random() * 9;
      ctx.fillStyle =
        by < 75 ? 'rgba(255, 255, 255, 0.88)' : 'rgba(224, 242, 254, 0.42)';
      ctx.beginPath();
      ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const waveTex = new THREE.CanvasTexture(canvas);
    waveTex.wrapS = THREE.RepeatWrapping;
    waveTex.wrapT = THREE.ClampToEdgeWrapping;
    waveTex.repeat.set(20, 1);
    waveTex.colorSpace = THREE.SRGBColorSpace;

    const segTheta = 96;
    const segRad = 5; // 6 profile vertices from leading foam toe (0) to trailing wave back (5)
    const ringCount = 5;

    for (let w = 0; w < ringCount; w++) {
      const vertCount = (segTheta + 1) * (segRad + 1);
      const positions = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);
      const indices: number[] = [];

      for (let i = 0; i <= segTheta; i++) {
        const u = i / segTheta;
        for (let j = 0; j <= segRad; j++) {
          const v = j / segRad;
          const idx = i * (segRad + 1) + j;
          uvs[idx * 2 + 0] = u;
          uvs[idx * 2 + 1] = v;
        }
      }

      for (let i = 0; i < segTheta; i++) {
        for (let j = 0; j < segRad; j++) {
          const a = i * (segRad + 1) + j;
          const b = (i + 1) * (segRad + 1) + j;
          const c = a + 1;
          const d = b + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geom.setIndex(indices);

      const mat = new THREE.MeshStandardMaterial({
        map: waveTex,
        roughness: 0.18,
        metalness: 0.08,
        emissive: '#bae6fd',
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 4 + w;
      scene.add(mesh);

      this.tropicalWaves.push({
        mesh,
        geom,
        mat,
        phaseOffset: w / ringCount,
        seed: w * 1.93 + 0.7,
      });
    }

    this.updateTropicalWaves(0);
  }

  private updateTropicalWaves(timeSec: number): void {
    if (this.tropicalWaves.length === 0) return;

    const segTheta = 96;
    const segRad = 5;
    const profileHeights = [0.0, 0.84, 1.0, 0.66, 0.26, 0.0];
    const rOuter = 458; // Offshore swell spawn radius
    const rSwashMin = 335; // High-tide swash line on golden beach sand

    if (this.wetShoreMat) {
      this.wetShoreMat.opacity = 0.52 + Math.sin(timeSec * 1.35) * 0.16;
    }

    for (const wave of this.tropicalWaves) {
      // Full wave lifecycle ~6.25s; 5 staggered rings => a fresh wave rolls onto the beach every ~1.25s!
      const p = (timeSec * 0.16 + wave.phaseOffset) % 1;

      // Inward travel (0..0.85) with natural beach deceleration, followed by gentle backwash retreat (0.85..1.0)
      let travel: number;
      if (p < 0.85) {
        const t = p / 0.85;
        travel = 1 - Math.pow(1 - t, 1.42);
      } else {
        const back = (p - 0.85) / 0.15;
        travel = 1 - back * 0.085;
      }

      const baseFrontR = rOuter - (rOuter - rSwashMin) * travel;

      // 3D wave height peaks in the surf zone (p ~ 0.42) then flattens into lacy beach foam swash
      const swellBell = Math.sin(Math.min(1, p / 0.78) * Math.PI);
      const crestH =
        p < 0.78
          ? 0.25 + Math.pow(swellBell, 0.85) * 2.15
          : 0.18 * (1 - (p - 0.78) / 0.22);

      // Forward curl overhang when cresting in shallow surf
      const curlStrength = p > 0.22 && p < 0.68 ? Math.sin(((p - 0.22) / 0.46) * Math.PI) * 1.65 : 0;

      // Radial width of wave + foam apron
      const bandWidth = p < 0.55 ? 20 + p * 14 : 27.7 - (p - 0.55) * 18;

      // Smooth fade-in offshore and foam dissolve on wet sand
      let opacity = 0.94;
      if (p < 0.13) {
        opacity = (p / 0.13) * 0.94;
      } else if (p > 0.78) {
        opacity = (1 - (p - 0.78) / 0.22) * 0.94;
      }
      wave.mat.opacity = Math.max(0, Math.min(0.95, opacity));

      const posAttr = wave.geom.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i <= segTheta; i++) {
        const theta = (i / segTheta) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Natural coastal scalloping so wave fronts undulate organically along the beach
        const scallop =
          Math.sin(theta * 6 + wave.seed + timeSec * 0.35) * 3.6 +
          Math.cos(theta * 11 - wave.seed * 1.4 - timeSec * 0.55) * 1.9;
        const localHeightVar = 0.86 + 0.18 * Math.sin(theta * 5 + wave.seed * 2.1);

        const frontR = baseFrontR + scallop;

        for (let j = 0; j <= segRad; j++) {
          const s = j / segRad;
          const curlOffset = j === 1 || j === 2 ? -curlStrength : 0;
          const r = frontR + s * bandWidth + curlOffset;
          const groundY = this.sampleTropicalShoreY(r);
          const y = groundY + 0.11 + profileHeights[j] * crestH * localHeightVar;

          const idx = (i * (segRad + 1) + j) * 3;
          arr[idx + 0] = cosT * r;
          arr[idx + 1] = y;
          arr[idx + 2] = sinT * r;
        }
      }

      posAttr.needsUpdate = true;
      wave.geom.computeVertexNormals();
    }
  }

  private buildRoadAndCurbs(scene: THREE.Scene): void {
    const segments = 440;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segments; i++) {
      const t = (i % segments) / segments;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();

      const leftPt = p.clone().addScaledVector(right, -this.roadHalfWidth);
      const rightPt = p.clone().addScaledVector(right, this.roadHalfWidth);

      positions.push(leftPt.x, leftPt.y, leftPt.z);
      positions.push(rightPt.x, rightPt.y, rightPt.z);
      uvs.push(0, i * 0.35, 1, i * 0.35);

      if (i < segments) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // HD Procedural Asphalt + CTR Red/White Curbs + Shoulder Sand
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 512;
    texCanvas.height = 512;
    const ctx = texCanvas.getContext('2d')!;
    ctx.fillStyle = '#313744';
    ctx.fillRect(0, 0, 512, 512);

    // Asphalt grain
    for (let i = 0; i < 3500; i++) {
      const v = 40 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Crisp curbs & center line themed per map
    const curbA =
      this.mapId === 'neon-canyon' ? '#00e5ff' : this.mapId === 'ice-peak' ? '#38bdf8' : '#ef4444';
    const curbB = this.mapId === 'neon-canyon' ? '#ec4899' : '#f8fafc';
    ctx.fillStyle = curbA;
    ctx.fillRect(0, 0, 28, 256);
    ctx.fillRect(484, 0, 28, 256);
    ctx.fillStyle = curbB;
    ctx.fillRect(0, 256, 28, 256);
    ctx.fillRect(484, 256, 28, 256);

    // Racing line dashes
    ctx.fillStyle =
      this.mapId === 'neon-canyon' ? '#00e5ff' : this.mapId === 'ice-peak' ? '#bae6fd' : '#facc15';
    ctx.fillRect(250, 40, 12, 180);

    const tex = new THREE.CanvasTexture(texCanvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;

    const road = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.78,
        metalness: 0.08,
      })
    );
    road.receiveShadow = true;
    scene.add(road);

    // Continuous Wide Sloped Earth / Cliff Embankment + Underside Deck so elevated roads never float
    const embPos: number[] = [];
    const embUvs: number[] = [];
    const embIdx: number[] = [];
    const skirtWidth = 24.0;
    const baseY = -3.0;

    for (let i = 0; i <= segments; i++) {
      const t = (i % segments) / segments;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();

      const lEdge = p.clone().addScaledVector(right, -this.roadHalfWidth);
      const lShoulder = p.clone().addScaledVector(right, -(this.roadHalfWidth + 2.2));
      lShoulder.y = p.y - 0.9;
      const lBot = p.clone().addScaledVector(right, -(this.roadHalfWidth + skirtWidth));
      lBot.y = baseY;

      const rEdge = p.clone().addScaledVector(right, this.roadHalfWidth);
      const rShoulder = p.clone().addScaledVector(right, this.roadHalfWidth + 2.2);
      rShoulder.y = p.y - 0.9;
      const rBot = p.clone().addScaledVector(right, this.roadHalfWidth + skirtWidth);
      rBot.y = baseY;

      // 6 vertices per slice: [0]=lBot, [1]=lShoulder, [2]=lEdge, [3]=rEdge, [4]=rShoulder, [5]=rBot
      embPos.push(lBot.x, lBot.y, lBot.z);
      embPos.push(lShoulder.x, lShoulder.y, lShoulder.z);
      embPos.push(lEdge.x, lEdge.y - 0.05, lEdge.z);
      embPos.push(rEdge.x, rEdge.y - 0.05, rEdge.z);
      embPos.push(rShoulder.x, rShoulder.y, rShoulder.z);
      embPos.push(rBot.x, rBot.y, rBot.z);

      const vCoord = i * 0.4;
      embUvs.push(0, vCoord, 0.35, vCoord, 0.5, vCoord, 0.5, vCoord, 0.65, vCoord, 1, vCoord);

      if (i < segments) {
        const b = i * 6;
        const n = (i + 1) * 6;
        // Left outer slope
        embIdx.push(b + 0, b + 1, n + 0, b + 1, n + 1, n + 0);
        // Left inner shoulder
        embIdx.push(b + 1, b + 2, n + 1, b + 2, n + 2, n + 1);
        // Solid underside under the road
        embIdx.push(b + 1, b + 4, n + 1, b + 4, n + 4, n + 1);
        // Right inner shoulder
        embIdx.push(b + 3, b + 4, n + 3, b + 4, n + 4, n + 3);
        // Right outer slope
        embIdx.push(b + 4, b + 5, n + 4, b + 5, n + 5, n + 4);
      }
    }

    const embGeom = new THREE.BufferGeometry();
    embGeom.setAttribute('position', new THREE.Float32BufferAttribute(embPos, 3));
    embGeom.setAttribute('uv', new THREE.Float32BufferAttribute(embUvs, 2));
    embGeom.setIndex(embIdx);
    embGeom.computeVertexNormals();

    const embCanvas = document.createElement('canvas');
    embCanvas.width = 128;
    embCanvas.height = 128;
    const ectx = embCanvas.getContext('2d')!;
    const embBase =
      this.mapId === 'neon-canyon'
        ? '#4c1d95'
        : this.mapId === 'ice-peak'
        ? '#94a3b8'
        : '#8b5e3c';
    const embStreak =
      this.mapId === 'neon-canyon'
        ? '#7c3aed'
        : this.mapId === 'ice-peak'
        ? '#f8fafc'
        : '#228b3b';
    ectx.fillStyle = embBase;
    ectx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 320; i++) {
      ectx.fillStyle = i % 2 === 0 ? embStreak : 'rgba(0,0,0,0.22)';
      ectx.fillRect(Math.random() * 128, Math.random() * 128, 10, 6);
    }
    const embTex = new THREE.CanvasTexture(embCanvas);
    embTex.wrapS = THREE.RepeatWrapping;
    embTex.wrapT = THREE.RepeatWrapping;
    embTex.colorSpace = THREE.SRGBColorSpace;

    const embankment = new THREE.Mesh(
      embGeom,
      new THREE.MeshStandardMaterial({
        map: embTex,
        roughness: 0.92,
        side: THREE.DoubleSide,
      })
    );
    embankment.receiveShadow = true;
    embankment.castShadow = true;
    scene.add(embankment);

    // CTR-style Checkered Start/Finish Arch
    const startPt = this.curve.getPointAt(0);
    const startTan = this.curve.getTangentAt(0).normalize();
    const archGroup = new THREE.Group();
    archGroup.position.copy(startPt);
    archGroup.lookAt(startPt.clone().add(startTan));

    const pillarGeo = new THREE.CylinderGeometry(0.9, 1.2, 9.4, 10);
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#ff6b2b', roughness: 0.35 });
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-this.roadHalfWidth, 4.7, 0);
    leftPillar.castShadow = true;
    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(this.roadHalfWidth, 4.7, 0);
    rightPillar.castShadow = true;

    // Main Start/Finish Arch Banner Asset ("Fachrul butuh donasi" with checkered racing trim)
    const promoTex = this.createDonationPromoTexture(true);
    const bannerFrameMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45 });
    const bannerFaceMat = new THREE.MeshStandardMaterial({
      map: promoTex,
      emissive: '#ffffff',
      emissiveMap: promoTex,
      emissiveIntensity: 0.24,
      roughness: 0.32,
    });
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.roadHalfWidth * 2 + 2.4, 3.8, 1.2),
      [bannerFrameMat, bannerFrameMat, bannerFrameMat, bannerFrameMat, bannerFaceMat, bannerFaceMat]
    );
    banner.position.set(0, 7.6, 0);
    banner.castShadow = true;

    // Checkered Start/Finish Line painted on the road surface
    const lineCanvas = document.createElement('canvas');
    lineCanvas.width = 512;
    lineCanvas.height = 96;
    const lctx = lineCanvas.getContext('2d')!;
    const cols = 16;
    const rows = 3;
    const cellW = lineCanvas.width / cols;
    const cellH = lineCanvas.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        lctx.fillStyle = (r + c) % 2 === 0 ? '#0f172a' : '#ffffff';
        lctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    const lineTex = new THREE.CanvasTexture(lineCanvas);
    lineTex.colorSpace = THREE.SRGBColorSpace;
    lineTex.anisotropy = 4;

    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(this.roadHalfWidth * 2 - 0.6, 4.2),
      new THREE.MeshStandardMaterial({
        map: lineTex,
        roughness: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.08, 0);
    startLine.receiveShadow = true;

    // Bright accent border strips on front & back of the start line
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#facc15' });
    const edgeGeo = new THREE.PlaneGeometry(this.roadHalfWidth * 2 - 0.6, 0.28);
    const frontEdge = new THREE.Mesh(edgeGeo, edgeMat);
    frontEdge.rotation.x = -Math.PI / 2;
    frontEdge.position.set(0, 0.09, 2.15);
    const backEdge = new THREE.Mesh(edgeGeo, edgeMat);
    backEdge.rotation.x = -Math.PI / 2;
    backEdge.position.set(0, 0.09, -2.15);

    archGroup.add(leftPillar, rightPillar, banner, startLine, frontEdge, backEdge);
    scene.add(archGroup);

    // F1-style staggered starting grid boxes on the road behind the start line
    const trackLen = Math.max(1, this.curve.getLength());
    const gridMat = new THREE.MeshBasicMaterial({
      color: '#f8fafc',
      transparent: true,
      opacity: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    const frontBarGeo = new THREE.PlaneGeometry(3.2, 0.24);
    const sideBarGeo = new THREE.PlaneGeometry(0.24, 1.8);

    for (let idx = 0; idx < 10; idx++) {
      const col = idx % 2 === 0 ? -4.2 : 4.2;
      const backDist = 5.2 + idx * 3.8;
      const t = (((1 - backDist / trackLen) % 1) + 1) % 1;
      const pt = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

      const boxGroup = new THREE.Group();
      boxGroup.position.copy(pt).addScaledVector(right, col);
      boxGroup.position.y += 0.07;
      boxGroup.lookAt(boxGroup.position.clone().add(tan));

      const frontBar = new THREE.Mesh(frontBarGeo, gridMat);
      frontBar.rotation.x = -Math.PI / 2;
      frontBar.position.set(0, 0, 1.85);

      const leftBar = new THREE.Mesh(sideBarGeo, gridMat);
      leftBar.rotation.x = -Math.PI / 2;
      leftBar.position.set(-1.48, 0, 0.95);

      const rightBar = new THREE.Mesh(sideBarGeo, gridMat);
      rightBar.rotation.x = -Math.PI / 2;
      rightBar.position.set(1.48, 0, 0.95);

      boxGroup.add(frontBar, leftBar, rightBar);
      scene.add(boxGroup);
    }
  }

  private buildTrackGuardrailsAndTunnel(scene: THREE.Scene): void {
    const up = new THREE.Vector3(0, 1, 0);
    const postCount = 180;

    // Instanced wooden/metal guardrail posts & continuous barriers along both edges
    const postGeo = new THREE.CylinderGeometry(0.28, 0.32, 1.8, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.85 });
    const railGeo = new THREE.BoxGeometry(0.35, 0.45, 1.0);
    const railMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
    const redRailMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 });

    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount * 2);
    const railsWhite = new THREE.InstancedMesh(railGeo, railMat, postCount);
    const railsRed = new THREE.InstancedMesh(railGeo, redRailMat, postCount);
    posts.castShadow = true;
    railsWhite.castShadow = true;
    railsRed.castShadow = true;
    railsWhite.receiveShadow = true;
    railsRed.receiveShadow = true;

    const leftEdges: THREE.Vector3[] = [];
    const rightEdges: THREE.Vector3[] = [];
    for (let i = 0; i < postCount; i++) {
      const t = i / postCount;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      leftEdges.push(p.clone().addScaledVector(right, -(this.roadHalfWidth + 0.6)));
      rightEdges.push(p.clone().addScaledVector(right, this.roadHalfWidth + 0.6));
    }

    const dummy = new THREE.Object3D();
    let pIdx = 0;
    let wIdx = 0;
    let rIdx = 0;

    for (let i = 0; i < postCount; i++) {
      const nextIdx = (i + 1) % postCount;
      for (const [sideIdx, edges] of [
        [0, leftEdges],
        [1, rightEdges],
      ] as const) {
        const edgeA = edges[i];
        const edgeB = edges[nextIdx];

        // Post at edgeA
        dummy.position.set(edgeA.x, edgeA.y + 0.85, edgeA.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        posts.setMatrixAt(pIdx++, dummy.matrix);

        // Continuous rail segment spanning from edgeA to edgeB
        const midX = (edgeA.x + edgeB.x) * 0.5;
        const midY = (edgeA.y + edgeB.y) * 0.5 + 1.15;
        const midZ = (edgeA.z + edgeB.z) * 0.5;
        const segLen = edgeA.distanceTo(edgeB);

        dummy.position.set(midX, midY, midZ);
        dummy.lookAt(edgeB.x, edgeB.y + 1.15, edgeB.z);
        dummy.scale.set(1, 1, segLen + 0.35);
        dummy.updateMatrix();

        if ((i + sideIdx) % 2 === 0 && wIdx < postCount) {
          railsWhite.setMatrixAt(wIdx++, dummy.matrix);
        } else if (rIdx < postCount) {
          railsRed.setMatrixAt(rIdx++, dummy.matrix);
        }
      }
    }
    posts.count = pIdx;
    railsWhite.count = wIdx;
    railsRed.count = rIdx;
    scene.add(posts, railsWhite, railsRed);

    // Stone Tiki Tunnel Archways along backstretch (t = 0.68..0.74)
    const archMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.9 });
    const mossMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.8 });
    for (const t of [0.67, 0.70, 0.73]) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const arch = new THREE.Group();
      arch.position.copy(p);
      arch.lookAt(p.clone().add(tan));

      const leftRock = new THREE.Mesh(new THREE.BoxGeometry(3.2, 11, 5.5), archMat);
      leftRock.position.set(-this.roadHalfWidth - 1.2, 5.5, 0);
      leftRock.castShadow = true;
      const rightRock = new THREE.Mesh(new THREE.BoxGeometry(3.2, 11, 5.5), archMat);
      rightRock.position.set(this.roadHalfWidth + 1.2, 5.5, 0);
      rightRock.castShadow = true;
      const topRock = new THREE.Mesh(
        new THREE.BoxGeometry(this.roadHalfWidth * 2 + 5.6, 3.2, 5.5),
        archMat
      );
      topRock.position.set(0, 11.5, 0);
      topRock.castShadow = true;
      const moss = new THREE.Mesh(
        new THREE.BoxGeometry(this.roadHalfWidth * 2 + 6, 0.8, 5.8),
        mossMat
      );
      moss.position.set(0, 13.2, 0);

      arch.add(leftRock, rightRock, topRock, moss);
      scene.add(arch);
    }

    // Overhead Sponsor Promotion Gantries ("Fachrul butuh donasi" at driver eye-line height)
    const promoGantryTex = this.createDonationPromoTexture(false);
    const frameSideMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45 });
    const promoFaceMat = new THREE.MeshStandardMaterial({
      map: promoGantryTex,
      emissive: '#ffffff',
      emissiveMap: promoGantryTex,
      emissiveIntensity: 0.24,
      roughness: 0.32,
    });
    const promoBoxMats = [
      frameSideMat,
      frameSideMat,
      frameSideMat,
      frameSideMat,
      promoFaceMat,
      promoFaceMat,
    ];
    const gantryPillarMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.7,
      roughness: 0.35,
    });
    const gantryAccentMat = new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#ca8a04',
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });
    for (const gt of [0.36, 0.79]) {
      const gp = this.curve.getPointAt(gt);
      const gtan = this.curve.getTangentAt(gt).normalize();
      const gantry = new THREE.Group();
      gantry.position.copy(gp);
      gantry.lookAt(gp.clone().sub(gtan));

      for (const side of [-1, 1]) {
        const px = side * (this.roadHalfWidth + 1.1);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 8.8, 10), gantryPillarMat);
        col.position.set(px, 4.4, 0);
        col.castShadow = true;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.65, 10), gantryAccentMat);
        ring.position.set(px, 6.2, 0);
        gantry.add(col, ring);
      }

      const promoSign = new THREE.Mesh(
        new THREE.BoxGeometry(this.roadHalfWidth * 2 + 2.8, 3.6, 0.95),
        promoBoxMats
      );
      promoSign.position.set(0, 7.4, 0);
      promoSign.castShadow = true;
      gantry.add(promoSign);
      scene.add(gantry);
    }

    // Trackside CTR-style Billboards — In-Game "Fachrul butuh donasi" Banner Assets
    const billboardTs = [0.07, 0.20, 0.31, 0.47, 0.60, 0.75, 0.89];
    billboardTs.forEach((t, idx) => {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const sideDir = idx % 2 === 0 ? -1 : 1;
      const pos = p.clone().addScaledVector(right, sideDir * (this.roadHalfWidth + 5.2));

      const board = new THREE.Group();
      board.position.copy(pos);
      // Angle billboard toward oncoming drivers along the track
      board.lookAt(p.clone().addScaledVector(tan, -20));
      const sign = new THREE.Mesh(new THREE.BoxGeometry(13.2, 4.0, 0.55), promoBoxMats);
      sign.position.y = 3.5;
      sign.castShadow = true;
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 3.5, 6), postMat);
      legL.position.set(-4.5, 1.75, 0);
      const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 3.5, 6), postMat);
      legR.position.set(4.5, 1.75, 0);
      board.add(sign, legL, legR);
      scene.add(board);
    });
  }

  private createDonationPromoTexture(withCheckeredTrim = false): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d')!;

    // Rich racing-sponsor dark-navy to fiery-amber gradient
    const bg = ctx.createLinearGradient(0, 0, 1024, 256);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(0.5, '#9a3412');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);

    // Diagonal speed stripes
    ctx.fillStyle = 'rgba(250, 204, 21, 0.14)';
    for (let x = -120; x < 1100; x += 110) {
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.lineTo(x + 52, 256);
      ctx.lineTo(x + 122, 0);
      ctx.lineTo(x + 70, 0);
      ctx.closePath();
      ctx.fill();
    }

    if (withCheckeredTrim) {
      // Checkered racing strips along top & bottom edges for Start/Finish Arch banner
      const sq = 24;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < Math.ceil(1024 / sq); col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#0f172a';
          ctx.fillRect(col * sq, row * 14, sq, 14);
          ctx.fillRect(col * sq, 256 - (row + 1) * 14, sq, 14);
        }
      }
    } else {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 14;
      ctx.strokeRect(10, 10, 1004, 236);
      ctx.strokeStyle = '#ff6b2b';
      ctx.lineWidth = 4;
      ctx.strokeRect(24, 24, 976, 208);
    }

    // Top sponsor pill
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(332, 34, 360, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 21px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ OFFICIAL PROMOTION ★', 512, 55);

    // Main bold in-game banner headline: "Fachrul butuh donasi"
    ctx.font = '900 78px Inter, system-ui, sans-serif';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#090d16';
    ctx.strokeText('Fachrul butuh donasi', 512, 148);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Fachrul butuh donasi', 512, 148);

    // Subtitle accent
    ctx.fillStyle = '#fde047';
    ctx.font = '800 23px Inter, system-ui, sans-serif';
    ctx.fillText('💸 SUPPORT SERVER & KOPI DEVELOPER ☕', 512, 208);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildRocksAndBushes(scene: THREE.Scene): void {
    const rockGeo = new THREE.DodecahedronGeometry(2.6, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.9 });
    const bushGeo = new THREE.SphereGeometry(2.1, 8, 8);
    const bushMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.8 });

    const count = 75;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, count);
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, count);
    rocks.castShadow = true;
    bushes.castShadow = true;

    const dummy = new THREE.Object3D();
    let rPlaced = 0;
    let bPlaced = 0;

    for (let i = 0; i < 320 && (rPlaced < count || bPlaced < count); i++) {
      const x = (Math.random() - 0.5) * 430;
      const z = (Math.random() - 0.5) * 380;
      const distFromCenter = Math.hypot(x, z);
      if (distFromCenter > 225) continue;
      const sample = this.sampleNearestSpline(x, z);
      if (sample.distSq < (this.roadHalfWidth + 7) ** 2) continue;

      if (distFromCenter > 265 && rPlaced < count) {
        dummy.position.set(x, 0.4, z);
        dummy.rotation.set(Math.random(), Math.random(), Math.random());
        dummy.scale.set(0.8 + Math.random() * 1.4, 0.6 + Math.random() * 0.9, 0.8 + Math.random() * 1.3);
        dummy.updateMatrix();
        rocks.setMatrixAt(rPlaced++, dummy.matrix);
      } else if (bPlaced < count) {
        dummy.position.set(x, 0.8, z);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(1 + Math.random() * 0.8, 0.65 + Math.random() * 0.4, 1 + Math.random() * 0.8);
        dummy.updateMatrix();
        bushes.setMatrixAt(bPlaced++, dummy.matrix);
      }
    }
    rocks.count = rPlaced;
    bushes.count = bPlaced;
    scene.add(rocks, bushes);

    // Tropical Hibiscus Flower Clusters on Bushes
    const flowerGeo = new THREE.SphereGeometry(0.42, 6, 6);
    const flowerMat = new THREE.MeshStandardMaterial({ color: '#f43f5e', emissive: '#be123c', emissiveIntensity: 0.25 });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, bPlaced * 2);
    const fDummy = new THREE.Object3D();
    const bMat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    let fIdx = 0;
    for (let i = 0; i < bPlaced; i++) {
      bushes.getMatrixAt(i, bMat);
      pos.setFromMatrixPosition(bMat);
      for (let k = 0; k < 2; k++) {
        fDummy.position.set(pos.x + (k === 0 ? -0.9 : 0.9), pos.y + 1.25, pos.z + (k === 0 ? 0.5 : -0.6));
        fDummy.scale.setScalar(1);
        fDummy.updateMatrix();
        flowers.setMatrixAt(fIdx++, fDummy.matrix);
      }
    }
    flowers.count = fIdx;
    scene.add(flowers);
  }

  private buildLandmarks(scene: THREE.Scene): void {
    if (this.mapId === 'neon-canyon') {
      // 1. Glowing Neon Highway Portal Arches spanning over the track
      const cyanNeon = new THREE.MeshBasicMaterial({ color: '#00e5ff' });
      const pinkNeon = new THREE.MeshBasicMaterial({ color: '#ec4899' });
      const darkFrame = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.8, roughness: 0.25 });

      for (const [idx, t] of [0.16, 0.42, 0.68, 0.88].entries()) {
        const p = this.curve.getPointAt(t);
        const tan = this.curve.getTangentAt(t).normalize();
        const arch = new THREE.Group();
        arch.position.copy(p);
        arch.lookAt(p.clone().add(tan));

        const torus = new THREE.Mesh(
          new THREE.TorusGeometry(this.roadHalfWidth + 2.5, 0.75, 8, 24, Math.PI),
          idx % 2 === 0 ? cyanNeon : pinkNeon
        );
        torus.position.y = 0.5;
        torus.castShadow = true;
        const outerFrame = new THREE.Mesh(
          new THREE.TorusGeometry(this.roadHalfWidth + 3.4, 0.55, 8, 24, Math.PI),
          darkFrame
        );
        outerFrame.position.y = 0.5;
        outerFrame.castShadow = true;
        arch.add(torus, outerFrame);
        scene.add(arch);
      }

      // 2. Futuristic Canyon Mesas with Neon Rim Lines
      const mesaMat = new THREE.MeshStandardMaterial({ color: '#3b0764', roughness: 0.85 });
      for (const [mx, mz, mr, mh] of [
        [-75, 45, 28, 38],
        [95, -55, 34, 46],
        [-115, -80, 26, 34],
        [75, 95, 24, 30],
      ]) {
        if (this.sampleNearestSpline(mx, mz).distSq < (this.roadHalfWidth + mr + 6) ** 2) continue;
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(mr * 0.72, mr, mh, 8), mesaMat);
        mesa.position.set(mx, mh * 0.48, mz);
        mesa.castShadow = true;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(mr * 0.74, 0.7, 6, 8),
          cyanNeon
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(mx, mh * 0.94, mz);
        scene.add(mesa, ring);
      }

      // 3. Tall Canyon Cliffs Flanking Both Sides of the Road (InstancedMesh for 60 FPS)
      const cliffSteps = 72;
      const maxCliffs = cliffSteps * 2;
      const cliffGeo = new THREE.CylinderGeometry(0.62, 1.0, 1.0, 7);
      const cliffMat = new THREE.MeshStandardMaterial({
        color: '#4c1d95',
        emissive: '#1e1b4b',
        emissiveIntensity: 0.25,
        roughness: 0.85,
        flatShading: true,
      });
      const cliffMesh = new THREE.InstancedMesh(cliffGeo, cliffMat, maxCliffs);
      cliffMesh.castShadow = true;
      cliffMesh.receiveShadow = true;

      const stripGeo = new THREE.CylinderGeometry(0.76, 0.8, 0.06, 7);
      const cyanStripMesh = new THREE.InstancedMesh(stripGeo, cyanNeon, maxCliffs);
      const pinkStripMesh = new THREE.InstancedMesh(stripGeo, pinkNeon, maxCliffs);

      const up = new THREE.Vector3(0, 1, 0);
      const dummy = new THREE.Object3D();
      let cliffCount = 0;
      let cyanCount = 0;
      let pinkCount = 0;

      for (let i = 0; i < cliffSteps; i++) {
        const t = i / cliffSteps;
        const pt = this.curve.getPointAt(t);
        const tan = this.curve.getTangentAt(t).normalize();
        const right = new THREE.Vector3().crossVectors(tan, up).normalize();

        for (const side of [-1, 1] as const) {
          // Deterministic variation per segment & side
          const seed = Math.sin(i * 12.9898 + side * 78.233) * 43758.5453;
          const rand = seed - Math.floor(seed);
          const seed2 = Math.sin(i * 39.346 + side * 19.13) * 24634.6345;
          const rand2 = seed2 - Math.floor(seed2);

          const width = 8 + rand2 * 6;
          const depth = 8 + rand * 6;
          const maxRadius = Math.max(width, depth);
          const lateralDist = this.roadHalfWidth + maxRadius + 6.5 + rand * 8;
          const cx = pt.x + right.x * side * lateralDist;
          const cz = pt.z + right.z * side * lateralDist;

          // Ensure cliff base (radius = maxRadius) stays well clear of all road segments
          const minClearanceSq = (this.roadHalfWidth + maxRadius + 5.5) ** 2;
          const nearest = this.sampleNearestSpline(cx, cz);
          if (nearest.distSq < minClearanceSq) continue;

          const height = 24 + rand * 36; // 24..60m tall cliffs
          const baseY = pt.y - 4;

          dummy.position.set(cx, baseY + height * 0.5, cz);
          dummy.rotation.set(0, rand * Math.PI * 2, 0);
          dummy.scale.set(width, height, depth);
          dummy.updateMatrix();
          cliffMesh.setMatrixAt(cliffCount++, dummy.matrix);

          // Glowing neon strata band near upper-mid cliff face
          dummy.position.set(cx, baseY + height * (0.62 + rand2 * 0.14), cz);
          dummy.scale.set(width * 1.02, height, depth * 1.02);
          dummy.updateMatrix();
          if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
            cyanStripMesh.setMatrixAt(cyanCount++, dummy.matrix);
          } else {
            pinkStripMesh.setMatrixAt(pinkCount++, dummy.matrix);
          }
        }
      }

      cliffMesh.count = cliffCount;
      cyanStripMesh.count = cyanCount;
      pinkStripMesh.count = pinkCount;
      scene.add(cliffMesh, cyanStripMesh, pinkStripMesh);
      return;
    }

    if (this.mapId === 'ice-peak') {
      // 1. Cozy Snowmen with Top Hats, Carrot Noses & Scarves
      const snowMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.75 });
      const hatMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.6 });
      const carrotMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.5 });
      const scarfMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.6 });

      for (const [sx, sz, rot] of [
        [-45, 35, 0.4],
        [65, -25, -0.6],
        [-95, -55, 1.1],
        [85, 75, -1.2],
        [0, -40, 0.1],
      ]) {
        const sm = new THREE.Group();
        sm.position.set(sx, 0, sz);
        sm.rotation.y = rot;
        const b1 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 12), snowMat);
        b1.position.y = 2.0;
        b1.castShadow = true;
        const b2 = new THREE.Mesh(new THREE.SphereGeometry(1.75, 12, 12), snowMat);
        b2.position.y = 5.0;
        b2.castShadow = true;
        const b3 = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 12), snowMat);
        b3.position.y = 7.2;
        b3.castShadow = true;
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.28, 6, 12), scarfMat);
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = 6.1;
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 6), carrotMat);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 7.2, 1.5);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.22, 12), hatMat);
        brim.position.y = 8.3;
        const topHat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12), hatMat);
        topHat.position.y = 9.1;
        sm.add(b1, b2, b3, scarf, nose, brim, topHat);
        scene.add(sm);
      }

      // 2. Igloos (Snow-block dome huts with entrance tunnel)
      const iceBlockMat = new THREE.MeshStandardMaterial({ color: '#e0f2fe', roughness: 0.65 });
      for (const [ix, iz, rot] of [
        [-130, 85, 0.8],
        [145, -95, -0.5],
        [-25, 110, 0.2],
      ]) {
        const igloo = new THREE.Group();
        igloo.position.set(ix, -0.2, iz);
        igloo.rotation.y = rot;
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(7.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          iceBlockMat
        );
        dome.castShadow = true;
        const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 5.5, 10), iceBlockMat);
        tunnel.rotation.x = Math.PI / 2;
        tunnel.position.set(0, 2.0, 6.8);
        igloo.add(dome, tunnel);
        scene.add(igloo);
      }

      // 3. Translucent Frozen Iceberg Spires & Warm Ski-Lodge Cabin
      const glacierMat = new THREE.MeshPhysicalMaterial({
        color: '#7dd3fc',
        roughness: 0.15,
        metalness: 0.1,
        transmission: 0.45,
        transparent: true,
        opacity: 0.88,
      });
      for (const [gx, gz, gh] of [
        [240, 140, 38],
        [-250, -135, 44],
        [210, -155, 32],
        [-225, 155, 36],
      ]) {
        const berg = new THREE.Mesh(new THREE.ConeGeometry(16, gh, 6), glacierMat);
        berg.position.set(gx, gh * 0.45, gz);
        berg.rotation.y = gx * 0.1;
        scene.add(berg);
      }

      // Cozy Ski-Lodge Cabin with glowing warm windows & snow roof
      const lodge = new THREE.Group();
      lodge.position.set(35, 0, 140);
      const cabinBody = new THREE.Mesh(
        new THREE.BoxGeometry(20, 10, 14),
        new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.85 })
      );
      cabinBody.position.y = 5;
      cabinBody.castShadow = true;
      const snowRoof = new THREE.Mesh(
        new THREE.ConeGeometry(16, 7.5, 4),
        snowMat
      );
      snowRoof.rotation.y = Math.PI / 4;
      snowRoof.position.y = 13.5;
      const winMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
      for (const wx of [-5, 5]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.4), winMat);
        win.position.set(wx, 5.5, 7.1);
        lodge.add(win);
      }
      lodge.add(cabinBody, snowRoof);
      scene.add(lodge);
      return;
    }

    // Pantai Tropis (Crash Cove): Detailed Pirate Ship + Beach Ornaments
    const ship = new THREE.Group();
    ship.position.set(-70, -0.5, 35);
    ship.rotation.y = 0.6;
    ship.rotation.z = 0.06;

    const woodDark = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.85 });
    const woodLight = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.75 });
    const ironMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.35 });
    const sailMat = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.65, side: THREE.DoubleSide });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 6.5, 34), woodDark);
    hull.position.y = 3.2;
    hull.castShadow = true;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.6, 33), woodLight);
    deck.position.y = 6.6;
    const sternCabin = new THREE.Mesh(new THREE.BoxGeometry(13.5, 5.2, 9), woodDark);
    sternCabin.position.set(0, 9.0, -12.5);
    sternCabin.castShadow = true;
    const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 13, 8), woodDark);
    bowsprit.rotation.x = Math.PI / 2.4;
    bowsprit.position.set(0, 8.2, 21);
    ship.add(hull, deck, sternCabin, bowsprit);

    // Side Cannons
    for (const cz of [-6, 0, 6]) {
      for (const side of [-1, 1]) {
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 2.4, 8), ironMat);
        cannon.rotation.z = Math.PI / 2;
        cannon.position.set(side * 7.4, 5.2, cz);
        ship.add(cannon);
      }
    }

    // Twin Masts, Crow's Nests & Sails
    for (const [mz, h, sw, sh] of [
      [-2, 26, 15, 12],
      [10, 20, 11, 9],
    ] as const) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, h, 8), woodDark);
      mast.position.set(0, 6 + h / 2, mz);
      mast.castShadow = true;
      const nest = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.4, 1.4, 10), woodLight);
      nest.position.set(0, 6 + h - 4, mz);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), sailMat);
      sail.position.set(0, 6 + h * 0.55, mz + 1.0);
      ship.add(mast, nest, sail);
    }
    scene.add(ship);

    // Detailed Coastal Lighthouse
    const lh = new THREE.Group();
    lh.position.set(275, -0.5, 150);
    const lhTower = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 5.4, 28, 16),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 })
    );
    lhTower.position.y = 14;
    lhTower.castShadow = true;
    const lhBand1 = new THREE.Mesh(
      new THREE.CylinderGeometry(4.3, 4.7, 5.5, 16),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 })
    );
    lhBand1.position.y = 11;
    const lhBand2 = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.9, 5.0, 16),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 })
    );
    lhBand2.position.y = 22;
    const lhBalcony = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 1.0, 16), ironMat);
    lhBalcony.position.y = 28.2;
    const lhGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 2.8, 4.2, 16),
      new THREE.MeshPhysicalMaterial({
        color: '#fef08a',
        emissive: '#facc15',
        emissiveIntensity: 0.8,
        roughness: 0.1,
        transmission: 0.5,
      })
    );
    lhGlass.position.y = 30.8;
    const lhCap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 3.4, 16), ironMat);
    lhCap.position.y = 34.5;
    lh.add(lhTower, lhBand1, lhBand2, lhBalcony, lhGlass, lhCap);
    scene.add(lh);

    // Detailed Tiered Grandstand with Crowd Spectators
    const stand = new THREE.Group();
    const startPt = this.curve.getPointAt(0.02);
    stand.position.set(startPt.x, 0, startPt.z + 28);
    for (let tier = 0; tier < 3; tier++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(38, 2.5, 12 - tier * 3.2),
        new THREE.MeshStandardMaterial({ color: tier % 2 === 0 ? '#334155' : '#475569', roughness: 0.7 })
      );
      step.position.set(0, 1.25 + tier * 2.5, -tier * 1.4);
      step.castShadow = true;
      stand.add(step);
    }
    const specColors = ['#ef4444', '#38bdf8', '#facc15', '#22c55e', '#f472b6'];
    for (let s = 0; s < 24; s++) {
      const spec = new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 8, 8),
        new THREE.MeshStandardMaterial({ color: specColors[s % specColors.length], roughness: 0.5 })
      );
      const tier = s % 3;
      spec.position.set(-16 + (s / 24) * 32, 3.2 + tier * 2.5, 2.5 - tier * 3.0);
      stand.add(spec);
    }
    for (const px of [-17, 0, 17]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 14, 8), ironMat);
      pillar.position.set(px, 7, -4.5);
      stand.add(pillar);
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(40, 1.1, 14),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.35 })
    );
    roof.position.set(0, 14.2, -1);
    roof.rotation.x = 0.12;

    // Stadium Fascia Banner Asset on the Grandstand ("Fachrul butuh donasi")
    const standPromoTex = this.createDonationPromoTexture(false);
    const standBanner = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 4.2),
      new THREE.MeshStandardMaterial({
        map: standPromoTex,
        emissive: '#ffffff',
        emissiveMap: standPromoTex,
        emissiveIntensity: 0.22,
        roughness: 0.35,
        side: THREE.DoubleSide,
      })
    );
    standBanner.position.set(0, 12.1, -7.8);
    standBanner.rotation.y = Math.PI;

    stand.add(roof, standBanner);
    scene.add(stand);

    // Carved Tiki Totems with Glowing Eyes & Flame Torches
    const totemGeo = new THREE.CylinderGeometry(1.6, 2.0, 11, 10);
    const totemMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.85 });
    const eyeGlowMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
    const flameMat = new THREE.MeshBasicMaterial({ color: '#f97316' });
    for (const [tx, tz] of [
      [115, 65],
      [145, -30],
      [-125, -55],
      [-145, 95],
    ]) {
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, 0, tz);
      const totem = new THREE.Mesh(totemGeo, totemMat);
      totem.position.y = 5.5;
      totem.castShadow = true;
      const brow = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 3.4), woodDark);
      brow.position.y = 8.4;
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.38, 6, 6), eyeGlowMat);
      eyeL.position.set(-0.75, 7.3, 1.55);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.38, 6, 6), eyeGlowMat);
      eyeR.position.set(0.75, 7.3, 1.55);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 8), flameMat);
      fire.position.y = 12.2;
      tGroup.add(totem, brow, eyeL, eyeR, fire);
      scene.add(tGroup);
    }

    // Pantai Tropis Beach Ornaments: Striped Umbrellas, Lounge Chairs, Surfboards & Lifeguard Tower
    const umbrellaColors = ['#ef4444', '#0ea5e9', '#facc15', '#ec4899', '#22c55e'];
    const poleMat = new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.7 });
    const chairMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });

    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + 0.2;
      const dist = 295 + (i % 3) * 18;
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist;
      if (this.sampleNearestSpline(bx, bz).distSq < (this.roadHalfWidth + 12) ** 2) continue;

      const spot = new THREE.Group();
      spot.position.set(bx, -0.5, bz);
      spot.rotation.y = -ang;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.6, 6), poleMat);
      pole.position.y = 2.3;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(3.2, 1.3, 8),
        new THREE.MeshStandardMaterial({ color: umbrellaColors[i % umbrellaColors.length], roughness: 0.5 })
      );
      canopy.position.y = 4.6;
      canopy.castShadow = true;

      const chair = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 3.2), chairMat);
      chair.position.set(1.6, 0.5, 0);
      chair.rotation.x = -0.15;

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 3.8, 0.18),
        new THREE.MeshStandardMaterial({ color: umbrellaColors[(i + 2) % umbrellaColors.length], roughness: 0.3 })
      );
      board.position.set(-1.8, 1.6, 0.5);
      board.rotation.z = 0.18;

      spot.add(pole, canopy, chair, board);
      scene.add(spot);
    }

    // Wooden Lifeguard Watchtower on the Beach
    const lg = new THREE.Group();
    lg.position.set(-285, -0.5, 195);
    for (const [lx, lz] of [
      [-2.2, -2.2],
      [2.2, -2.2],
      [-2.2, 2.2],
      [2.2, 2.2],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 8, 6), woodDark);
      leg.position.set(lx, 4, lz);
      lg.add(leg);
    }
    const lgDeck = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.6, 6.2), woodLight);
    lgDeck.position.y = 8;
    const lgHut = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.0, 4.8), chairMat);
    lgHut.position.y = 10.2;
    const lgRoof = new THREE.Mesh(
      new THREE.ConeGeometry(4.6, 2.4, 4),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 })
    );
    lgRoof.rotation.y = Math.PI / 4;
    lgRoof.position.y = 13.4;
    lg.add(lgDeck, lgHut, lgRoof);
    scene.add(lg);
  }

  private buildPalmTrees(scene: THREE.Scene): void {
    if (this.mapId === 'neon-canyon') {
      const spireGeo = new THREE.ConeGeometry(2.2, 16, 5);
      const spireMat = new THREE.MeshStandardMaterial({
        color: '#06b6d4',
        emissive: '#0891b2',
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.6,
      });
      const count = 85;
      const spires = new THREE.InstancedMesh(spireGeo, spireMat, count);
      spires.castShadow = true;
      spires.receiveShadow = true;
      const dummy = new THREE.Object3D();
      let placed = 0;
      for (let i = 0; i < 650 && placed < count; i++) {
        const x = (Math.random() - 0.5) * 580;
        const z = (Math.random() - 0.5) * 540;
        if (Math.hypot(x, z) > 315) continue;
        if (this.sampleNearestSpline(x, z).distSq < (this.roadHalfWidth + 11) ** 2) continue;
        const s = 0.7 + Math.random() * 1.1;
        dummy.position.set(x, 7.5 * s, z);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        spires.setMatrixAt(placed++, dummy.matrix);
      }
      spires.count = placed;
      scene.add(spires);
      return;
    }

    if (this.mapId === 'ice-peak') {
      const trunkGeo = new THREE.CylinderGeometry(0.45, 0.75, 5, 7);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.9 });
      const pineLowerGeo = new THREE.ConeGeometry(4.5, 7.2, 7);
      const pineGeo = new THREE.ConeGeometry(3.5, 8.8, 7);
      const pineMat = new THREE.MeshStandardMaterial({ color: '#0f766e', roughness: 0.75 });
      const snowGeo = new THREE.ConeGeometry(2.2, 4.2, 7);
      const snowMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 });
      const count = 90;
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const pinesLower = new THREE.InstancedMesh(pineLowerGeo, pineMat, count);
      const pines = new THREE.InstancedMesh(pineGeo, pineMat, count);
      const snows = new THREE.InstancedMesh(snowGeo, snowMat, count);
      trunks.castShadow = true;
      pinesLower.castShadow = true;
      pines.castShadow = true;
      snows.castShadow = true;
      trunks.receiveShadow = true;
      pinesLower.receiveShadow = true;
      pines.receiveShadow = true;
      snows.receiveShadow = true;
      const dummy = new THREE.Object3D();
      let placed = 0;
      for (let i = 0; i < 650 && placed < count; i++) {
        const x = (Math.random() - 0.5) * 580;
        const z = (Math.random() - 0.5) * 540;
        if (Math.hypot(x, z) > 315) continue;
        if (this.sampleNearestSpline(x, z).distSq < (this.roadHalfWidth + 11) ** 2) continue;
        const s = 0.85 + Math.random() * 0.75;
        dummy.position.set(x, 2.4 * s, z);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        trunks.setMatrixAt(placed, dummy.matrix);
        dummy.position.set(x, 5.1 * s, z);
        dummy.updateMatrix();
        pinesLower.setMatrixAt(placed, dummy.matrix);
        dummy.position.set(x, 8.2 * s, z);
        dummy.updateMatrix();
        pines.setMatrixAt(placed, dummy.matrix);
        dummy.position.set(x, 10.9 * s, z);
        dummy.updateMatrix();
        snows.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
      trunks.count = placed;
      pinesLower.count = placed;
      pines.count = placed;
      snows.count = placed;
      scene.add(trunks, pinesLower, pines, snows);
      return;
    }

    // Procedural Ringed Palm Bark Texture
    const barkCanvas = document.createElement('canvas');
    barkCanvas.width = 64;
    barkCanvas.height = 128;
    const bctx = barkCanvas.getContext('2d')!;
    bctx.fillStyle = '#78350f';
    bctx.fillRect(0, 0, 64, 128);
    bctx.fillStyle = '#451a03';
    for (let y = 0; y < 128; y += 12) {
      bctx.fillRect(0, y, 64, 4);
    }
    const barkTex = new THREE.CanvasTexture(barkCanvas);
    barkTex.wrapS = THREE.RepeatWrapping;
    barkTex.wrapT = THREE.RepeatWrapping;
    barkTex.repeat.set(1, 5);
    barkTex.colorSpace = THREE.SRGBColorSpace;

    // Procedural Feathery Palm Frond Texture
    const leafCanvas = document.createElement('canvas');
    leafCanvas.width = 128;
    leafCanvas.height = 256;
    const lctx = leafCanvas.getContext('2d')!;
    lctx.clearRect(0, 0, 128, 256);
    lctx.fillStyle = '#15803d';
    lctx.fillRect(60, 0, 8, 256);
    for (let y = 12; y < 248; y += 12) {
      const span = 56 * Math.sin((y / 256) * Math.PI);
      lctx.fillStyle = y % 24 === 0 ? '#16a34a' : '#22c55e';
      lctx.beginPath();
      lctx.moveTo(64, y);
      lctx.lineTo(64 - span, y + 10);
      lctx.lineTo(64 - span * 0.85, y + 16);
      lctx.lineTo(64, y + 6);
      lctx.lineTo(64 + span * 0.85, y + 16);
      lctx.lineTo(64 + span, y + 10);
      lctx.closePath();
      lctx.fill();
    }
    const leafTex = new THREE.CanvasTexture(leafCanvas);
    leafTex.colorSpace = THREE.SRGBColorSpace;

    // Curved Palm Trunk via TubeGeometry
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.4, 3.5, 0.2),
      new THREE.Vector3(1.1, 7.2, 0.4),
      new THREE.Vector3(1.5, 10.2, 0.5),
    ]);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 10, 0.55, 8, false);
    const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.9 });

    const frondGeo = new THREE.PlaneGeometry(4.6, 8.6, 2, 5);
    frondGeo.rotateX(Math.PI / 2);
    frondGeo.translate(0, 0, 4.1);
    // Curve the frond tip downward and give it a V-fold for 3D volume
    const fPos = frondGeo.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      const x = fPos.getX(i);
      const z = fPos.getZ(i);
      fPos.setY(i, fPos.getY(i) - z * z * 0.036 - Math.abs(x) * 0.2);
    }
    frondGeo.computeVertexNormals();

    const frondMat = new THREE.MeshStandardMaterial({
      map: leafTex,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      roughness: 0.5,
    });

    const coconutGeo = new THREE.SphereGeometry(0.45, 8, 8);
    const coconutMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.8 });

    const count = 95;
    const frondsPerTree = 21;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, count * frondsPerTree);
    const coconuts = new THREE.InstancedMesh(coconutGeo, coconutMat, count * 3);
    trunks.castShadow = true;
    fronds.castShadow = true;

    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YXZ';
    let placed = 0;
    let frondIdx = 0;
    let cocoIdx = 0;
    let attempts = 0;
    while (placed < count && attempts < 800) {
      attempts++;
      const x = (Math.random() - 0.5) * 580;
      const z = (Math.random() - 0.5) * 540;
      if (Math.hypot(x, z) > 315) continue;
      const sample = this.sampleNearestSpline(x, z);
      if (sample.distSq < (this.roadHalfWidth + 11) ** 2) continue;

      const scale = 0.85 + Math.random() * 0.65;
      const yaw = Math.random() * Math.PI * 2;

      dummy.position.set(x, -0.2, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);

      // Crown offset matches top of curved trunk rotated by yaw
      const crownLocal = new THREE.Vector3(1.5 * scale, 10.0 * scale, 0.5 * scale).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw
      );
      const cx = x + crownLocal.x;
      const cy = crownLocal.y - 0.2;
      const cz = z + crownLocal.z;

      for (let c = 0; c < 3; c++) {
        const ang = (c / 3) * Math.PI * 2 + yaw;
        dummy.position.set(cx + Math.cos(ang) * 0.45, cy - 0.45, cz + Math.sin(ang) * 0.45);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        coconuts.setMatrixAt(cocoIdx++, dummy.matrix);
      }

      for (let f = 0; f < frondsPerTree; f++) {
        const tier = Math.floor(f / 7); // 0 = upper, 1 = mid, 2 = lower drooping shade
        const ringIdx = f % 7;
        const fYaw = yaw + (ringIdx / 7) * Math.PI * 2 + tier * 0.3;
        const pitch = tier === 0 ? -0.32 : tier === 1 ? 0.04 : 0.32;
        const yOff = tier === 0 ? 0.45 * scale : tier === 1 ? 0.1 * scale : -0.25 * scale;
        const fScale = tier === 0 ? 0.82 : tier === 1 ? 1.05 : 1.18;
        dummy.position.set(cx, cy + yOff, cz);
        dummy.rotation.set(pitch, fYaw, 0);
        dummy.scale.setScalar(scale * fScale);
        dummy.updateMatrix();
        fronds.setMatrixAt(frondIdx++, dummy.matrix);
      }
      placed++;
    }
    trunks.count = placed;
    fronds.count = frondIdx;
    coconuts.count = cocoIdx;
    scene.add(trunks, fronds, coconuts);
  }

  private buildBoostPads(scene: THREE.Scene): void {
    const padTs = [0.09, 0.24, 0.41, 0.56, 0.74, 0.91];
    const padCanvas = document.createElement('canvas');
    padCanvas.width = 128;
    padCanvas.height = 128;
    const pctx = padCanvas.getContext('2d')!;
    pctx.fillStyle = '#064e3b';
    pctx.fillRect(0, 0, 128, 128);
    pctx.fillStyle = '#22c55e';
    pctx.beginPath();
    pctx.moveTo(64, 16);
    pctx.lineTo(114, 72);
    pctx.lineTo(88, 72);
    pctx.lineTo(88, 112);
    pctx.lineTo(40, 112);
    pctx.lineTo(40, 72);
    pctx.lineTo(14, 72);
    pctx.closePath();
    pctx.fill();

    const padTex = new THREE.CanvasTexture(padCanvas);
    padTex.center.set(0.5, 0.5);
    padTex.rotation = Math.PI;
    padTex.colorSpace = THREE.SRGBColorSpace;

    const padGeo = new THREE.BoxGeometry(6.8, 0.18, 9.5);
    this.boostPadMat = new THREE.MeshStandardMaterial({
      map: padTex,
      emissive: '#22c55e',
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });

    for (const t of padTs) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const mesh = new THREE.Mesh(padGeo, this.boostPadMat);
      mesh.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
      mesh.lookAt(p.clone().add(tan));
      scene.add(mesh);
      this.boostPads.push({ position: p, radius: 5.8 });
    }
  }

  private buildRamps(scene: THREE.Scene): void {
    const specs: { t: number; size: 'small' | 'medium' | 'large' }[] = [
      { t: 0.14, size: 'small' },
      { t: 0.30, size: 'medium' },
      { t: 0.48, size: 'large' },
      { t: 0.66, size: 'medium' },
      { t: 0.85, size: 'large' },
    ];

    const makeWedgeGeometry = (w: number, h: number, l: number): THREE.BufferGeometry => {
      const hw = w / 2;
      const hl = l / 2;
      // Sloped wedge rising from -hl (y=0) to +hl (y=h) with outward CCW normals
      const verts = new Float32Array([
        // Sloped top deck (+Y/+Z normal)
        -hw, 0, -hl,   hw, h, hl,    hw, 0, -hl,
        -hw, 0, -hl,  -hw, h, hl,    hw, h, hl,
        // Vertical back face (+Z normal)
        -hw, 0, hl,    hw, h, hl,   -hw, h, hl,
        -hw, 0, hl,    hw, 0, hl,    hw, h, hl,
        // Left side triangle (-X normal)
        -hw, 0, -hl,  -hw, 0, hl,   -hw, h, hl,
        // Right side triangle (+X normal)
        hw, 0, -hl,    hw, h, hl,    hw, 0, hl,
      ]);
      const uvs = new Float32Array([
        0, 0,  1, 1,  1, 0,
        0, 0,  0, 1,  1, 1,
        0, 0,  1, 1,  0, 1,
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  1, 0,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      return g;
    };

    const makeRampTex = (colorA: string, colorB: string): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 3; i++) {
        const y = 22 + i * 34;
        ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
        ctx.beginPath();
        ctx.moveTo(16, y + 20);
        ctx.lineTo(64, y);
        ctx.lineTo(112, y + 20);
        ctx.lineTo(112, y + 30);
        ctx.lineTo(64, y + 10);
        ctx.lineTo(16, y + 30);
        ctx.closePath();
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const mats = {
      small: new THREE.MeshStandardMaterial({
        map: makeRampTex('#facc15', '#eab308'),
        emissive: '#ca8a04',
        emissiveIntensity: 0.25,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
      medium: new THREE.MeshStandardMaterial({
        map: makeRampTex('#fb923c', '#f97316'),
        emissive: '#ea580c',
        emissiveIntensity: 0.35,
        roughness: 0.35,
        side: THREE.DoubleSide,
      }),
      large: new THREE.MeshStandardMaterial({
        map: makeRampTex('#00e5ff', '#ef4444'),
        emissive: '#ef4444',
        emissiveIntensity: 0.45,
        roughness: 0.3,
        side: THREE.DoubleSide,
      }),
    };

    const up = new THREE.Vector3(0, 1, 0);
    specs.forEach((s, idx) => {
      const p = this.curve.getPointAt(s.t);
      const tan = this.curve.getTangentAt(s.t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const dims =
        s.size === 'small'
          ? { w: 9.0, h: 1.5, l: 7.0, vel: 5.5 }
          : s.size === 'medium'
          ? { w: 10.5, h: 2.5, l: 9.0, vel: 8.5 }
          : { w: 12.0, h: 3.8, l: 11.5, vel: 11.8 };

      const mesh = new THREE.Mesh(makeWedgeGeometry(dims.w, dims.h, dims.l), mats[s.size]);
      mesh.position.copy(p).add(new THREE.Vector3(0, 0.04, 0));
      mesh.lookAt(p.clone().add(tan));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      this.ramps.push({
        id: idx,
        size: s.size,
        position: p,
        forward: tan,
        right,
        halfWidth: dims.w / 2,
        halfLength: dims.l / 2,
        height: dims.h,
        launchVel: dims.vel,
      });
    });
  }

  private buildItemCrates(scene: THREE.Scene): void {
    const rowTs = [0.13, 0.33, 0.52, 0.71, 0.87];

    // CTR Wooden "?" Crate Texture
    const cCanvas = document.createElement('canvas');
    cCanvas.width = 128;
    cCanvas.height = 128;
    const ctx = cCanvas.getContext('2d')!;
    ctx.fillStyle = '#b45309';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 114, 114);
    ctx.fillStyle = '#fde047';
    ctx.font = '900 84px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 68);

    const crateTex = new THREE.CanvasTexture(cCanvas);
    crateTex.colorSpace = THREE.SRGBColorSpace;

    const boxGeo = new THREE.BoxGeometry(2.3, 2.3, 2.3);
    const boxMat = new THREE.MeshStandardMaterial({
      map: crateTex,
      roughness: 0.45,
      emissive: '#f59e0b',
      emissiveIntensity: 0.15,
    });

    const up = new THREE.Vector3(0, 1, 0);
    let id = 0;

    for (const t of rowTs) {
      const center = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();

      for (const offset of [-6.5, 0, 6.5]) {
        const pos = center.clone().addScaledVector(right, offset).add(new THREE.Vector3(0, 1.5, 0));
        const mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.copy(pos);
        mesh.castShadow = true;
        scene.add(mesh);
        this.crates.push({ id: id++, position: pos, mesh, respawnTimer: 0 });
      }
    }
  }

  private buildFruits(scene: THREE.Scene): void {
    const fruitTs = [0.05, 0.16, 0.27, 0.38, 0.49, 0.61, 0.72, 0.83, 0.94];
    const bodyGeo = new THREE.SphereGeometry(0.9, 12, 12);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#fb923c',
      emissive: '#ea580c',
      emissiveIntensity: 0.45,
      roughness: 0.3,
    });
    const leafGeo = new THREE.ConeGeometry(0.45, 0.8, 5);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#22c55e' });

    let id = 0;
    for (const t of fruitTs) {
      const pos = this.curve.getPointAt(t).add(new THREE.Vector3(0, 1.3, 0));
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 1.0;
      group.add(body, leaf);
      group.position.copy(pos);
      scene.add(group);
      this.fruits.push({ id: id++, position: pos, mesh: group, respawnTimer: 0 });
    }
  }

  private buildObstacles(scene: THREE.Scene): void {
    const up = new THREE.Vector3(0, 1, 0);
    let id = 0;

    // 1. Irregular Organic Oil Spill Puddles + Splatter Droplets
    const oilCanvas = document.createElement('canvas');
    oilCanvas.width = 256;
    oilCanvas.height = 256;
    const octx = oilCanvas.getContext('2d')!;
    octx.fillStyle = '#09090f';
    octx.fillRect(0, 0, 256, 256);
    // Subtle iridescent motor-oil rainbow sheen swirls
    const sheenColors = [
      'rgba(88, 28, 135, 0.34)',
      'rgba(15, 118, 110, 0.28)',
      'rgba(30, 58, 138, 0.32)',
      'rgba(120, 53, 15, 0.22)',
    ];
    for (let s = 0; s < 14; s++) {
      const gx = 40 + ((s * 53) % 176);
      const gy = 40 + ((s * 79) % 176);
      const rad = 32 + (s % 4) * 18;
      const g = octx.createRadialGradient(gx, gy, 4, gx, gy, rad);
      g.addColorStop(0, sheenColors[s % sheenColors.length]);
      g.addColorStop(1, 'rgba(9, 9, 15, 0)');
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(gx, gy, rad, 0, Math.PI * 2);
      octx.fill();
    }
    const oilTex = new THREE.CanvasTexture(oilCanvas);
    oilTex.wrapS = THREE.RepeatWrapping;
    oilTex.wrapT = THREE.RepeatWrapping;
    oilTex.repeat.set(0.14, 0.14);
    oilTex.colorSpace = THREE.SRGBColorSpace;

    const oilMat = new THREE.MeshPhysicalMaterial({
      color: '#111322',
      map: oilTex,
      roughness: 0.05,
      metalness: 0.55,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    const createIrregularOilGroup = (seed: number): THREE.Group => {
      const oilGroup = new THREE.Group();
      const lobeCount = 22;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < lobeCount; i++) {
        const a = (i / lobeCount) * Math.PI * 2;
        // Multi-harmonic wave produces asymmetric spilled-liquid lobes & fingers
        const r =
          2.55 +
          0.68 * Math.sin(a * 2 + seed * 1.7) +
          0.54 * Math.cos(a * 3 - seed * 2.3) +
          0.38 * Math.sin(a * 5 + seed * 3.1) +
          0.22 * Math.cos(a * 7 - seed * 0.9);
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      const spline = new THREE.SplineCurve(pts);
      const smoothPts = spline.getPoints(64);
      const mainShape = new THREE.Shape(smoothPts);
      const mainGeo = new THREE.ExtrudeGeometry(mainShape, {
        depth: 0.055,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.14,
        bevelSegments: 2,
        curveSegments: 16,
      });
      mainGeo.rotateX(-Math.PI / 2);
      const mainMesh = new THREE.Mesh(mainGeo, oilMat);
      oilGroup.add(mainMesh);

      // Detached splash droplets & drips around the spill perimeter
      const dropCount = 5;
      for (let d = 0; d < dropCount; d++) {
        const da = seed * 1.3 + d * ((Math.PI * 2) / dropCount) + Math.sin(d + seed) * 0.35;
        const dist = 3.25 + ((d * 37 + Math.round(seed * 10)) % 9) * 0.11;
        const dropR = 0.26 + (d % 3) * 0.14;
        const dropPts: THREE.Vector2[] = [];
        for (let k = 0; k < 10; k++) {
          const ka = (k / 10) * Math.PI * 2;
          const stretch = 1 + 0.28 * Math.cos(ka - da);
          const kr = dropR * stretch * (1 + 0.15 * Math.sin(ka * 3 + d));
          dropPts.push(new THREE.Vector2(Math.cos(ka) * kr, Math.sin(ka) * kr));
        }
        const dShape = new THREE.Shape(new THREE.SplineCurve(dropPts).getPoints(20));
        const dGeo = new THREE.ExtrudeGeometry(dShape, {
          depth: 0.04,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.06,
          bevelSegments: 1,
        });
        dGeo.rotateX(-Math.PI / 2);
        const dropMesh = new THREE.Mesh(dGeo, oilMat);
        dropMesh.position.set(Math.cos(da) * dist, 0, Math.sin(da) * dist);
        oilGroup.add(dropMesh);
      }

      return oilGroup;
    };

    const oilPairs: readonly (readonly [number, number])[] =
      this.difficulty === 'hard'
        ? [
            [0.14, -3.5],
            [0.24, 3.8],
            [0.39, -3.2],
            [0.51, 3.5],
            [0.64, -3.5],
            [0.76, 3.2],
            [0.88, -3.0],
          ]
        : this.difficulty === 'medium'
        ? [
            [0.17, -4.2],
            [0.35, 4.5],
            [0.54, -4.0],
            [0.72, 4.2],
            [0.86, -3.5],
          ]
        : [
            [0.22, -4.5],
            [0.58, 5.0],
            [0.81, 4.0],
          ];
    for (const [idx, [t, offset]] of oilPairs.entries()) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const roadNormal = new THREE.Vector3().crossVectors(right, tan).normalize();
      const pos = p.clone().addScaledVector(right, offset).add(new THREE.Vector3(0, 0.06, 0));

      const oilGroup = createIrregularOilGroup(idx * 2.41 + 1.15);
      oilGroup.position.copy(pos);
      oilGroup.quaternion.setFromUnitVectors(up, roadNormal);
      oilGroup.rotateY(idx * 1.1);
      scene.add(oilGroup);

      this.obstacles.push({
        id: id++,
        type: 'oil',
        basePoint: pos.clone(),
        rightVec: right.clone(),
        position: pos,
        radius: 3.1,
        mesh: oilGroup,
        respawnTimer: 0,
        phase: 0,
      });
    }

    // 2. Rolling Pirate Barrels (sweep side-to-side across the track)
    const barrelGeo = new THREE.CylinderGeometry(1.3, 1.3, 2.3, 12);
    barrelGeo.rotateZ(Math.PI / 2);
    const barrelMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.75 });
    const bandGeo = new THREE.CylinderGeometry(1.34, 1.34, 0.25, 12);
    bandGeo.rotateZ(Math.PI / 2);
    const bandMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7 });

    const barrelTs =
      this.difficulty === 'hard'
        ? [0.18, 0.31, 0.48, 0.62, 0.79, 0.91]
        : this.difficulty === 'medium'
        ? [0.23, 0.43, 0.61, 0.80]
        : [0.29, 0.65];
    for (const [idx, t] of barrelTs.entries()) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const group = new THREE.Group();
      const body = new THREE.Mesh(barrelGeo, barrelMat);
      body.castShadow = true;
      const band1 = new THREE.Mesh(bandGeo, bandMat);
      band1.position.x = -0.65;
      const band2 = new THREE.Mesh(bandGeo, bandMat);
      band2.position.x = 0.65;
      group.add(body, band1, band2);
      const pos = p.clone().add(new THREE.Vector3(0, 1.3, 0));
      group.position.copy(pos);
      group.lookAt(pos.clone().add(tan));
      scene.add(group);
      this.obstacles.push({
        id: id++,
        type: 'barrel',
        basePoint: pos.clone(),
        rightVec: right.clone(),
        position: pos.clone(),
        radius: 1.9,
        mesh: group,
        respawnTimer: 0,
        phase: idx * 2.1,
      });
    }

    // 3. Rotating Tiki Hammer Spinners
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.8 });
    const beamMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#991b1b',
      emissiveIntensity: 0.25,
    });
    const spinnerTs =
      this.difficulty === 'hard'
        ? [0.27, 0.45, 0.68, 0.84]
        : this.difficulty === 'medium'
        ? [0.33, 0.56, 0.75]
        : [0.42];
    for (const [idx, t] of spinnerTs.entries()) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const group = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.5, 10), pillarMat);
      pillar.position.y = 2.25;
      pillar.castShadow = true;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(11.5, 1.1, 1.1), beamMat);
      beam.position.y = 1.6;
      beam.castShadow = true;
      group.add(pillar, beam);
      group.position.copy(p);
      scene.add(group);
      this.obstacles.push({
        id: id++,
        type: 'spinner',
        basePoint: p.clone(),
        rightVec: right.clone(),
        position: p.clone().add(new THREE.Vector3(0, 1.2, 0)),
        radius: 3.4,
        mesh: group,
        respawnTimer: 0,
        phase: idx * 1.5,
      });
    }

    // 4. Iconic CTR Green Explosive NITRO Crates
    const nCanvas = document.createElement('canvas');
    nCanvas.width = 128;
    nCanvas.height = 128;
    const nctx = nCanvas.getContext('2d')!;
    nctx.fillStyle = '#15803d';
    nctx.fillRect(0, 0, 128, 128);
    nctx.strokeStyle = '#052e16';
    nctx.lineWidth = 12;
    nctx.strokeRect(6, 6, 116, 116);
    nctx.fillStyle = '#bef264';
    nctx.font = '900 30px sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText('NITRO', 64, 64);
    const nitroTex = new THREE.CanvasTexture(nCanvas);
    nitroTex.colorSpace = THREE.SRGBColorSpace;

    const nitroGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const nitroMat = new THREE.MeshStandardMaterial({
      map: nitroTex,
      emissive: '#22c55e',
      emissiveIntensity: 0.25,
      roughness: 0.35,
    });
    for (const [idx, [t, offset]] of [
      [0.11, 5.5],
      [0.21, -5.5],
      [0.46, 0],
      [0.54, 6.0],
      [0.74, -5.0],
      [0.89, 4.5],
    ].entries()) {
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tan, up).normalize();
      const pos = p.clone().addScaledVector(right, offset).add(new THREE.Vector3(0, 1.2, 0));
      const mesh = new THREE.Mesh(nitroGeo, nitroMat);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      scene.add(mesh);
      this.obstacles.push({
        id: id++,
        type: 'nitro-crate',
        basePoint: pos.clone(),
        rightVec: right.clone(),
        position: pos,
        radius: 2.0,
        mesh,
        respawnTimer: 0,
        phase: idx * 0.9,
      });
    }
  }

  private buildSnowfall(scene: THREE.Scene): void {
    const count = 2400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 680;
      positions[i * 3 + 1] = Math.random() * 140;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 680;
    }

    const sCanvas = document.createElement('canvas');
    sCanvas.width = 32;
    sCanvas.height = 32;
    const sctx = sCanvas.getContext('2d')!;
    const grad = sctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 32, 32);

    const snowTex = new THREE.CanvasTexture(sCanvas);
    snowTex.colorSpace = THREE.SRGBColorSpace;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      map: snowTex,
      size: 2.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    this.snowPoints = new THREE.Points(geom, mat);
    scene.add(this.snowPoints);
  }

  updateVisuals(timeSec: number): void {
    const dt = Math.min(0.05, Math.max(0.001, timeSec - this.lastVisualTime));
    this.lastVisualTime = timeSec;

    if (this.snowPoints) {
      const posAttr = this.snowPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= (14 + (i % 7)) * dt;
        arr[i + 0] += Math.sin(timeSec * 1.5 + i) * 2.2 * dt;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 140;
        }
      }
      posAttr.needsUpdate = true;
    }
    if (this.waterMesh) {
      const mat = this.waterMesh.material as THREE.MeshStandardMaterial;
      if (mat.map) {
        mat.map.offset.x = timeSec * 0.035;
        mat.map.offset.y = timeSec * 0.018 + Math.sin(timeSec * 0.6) * 0.02;
      }
    }
    if (this.mapId === 'crash-cove') {
      this.updateTropicalWaves(timeSec);
    }
    if (this.boostPadMat) {
      this.boostPadMat.emissiveIntensity = 0.55 + Math.sin(timeSec * 8) * 0.25;
    }
    for (const f of this.fruits) {
      if (f.respawnTimer <= 0) {
        f.mesh.rotation.y = timeSec * 2.5;
        f.mesh.position.y = f.position.y + Math.sin(timeSec * 4 + f.id) * 0.25;
      }
    }
    const barrelSpeed = this.difficulty === 'hard' ? 2.8 : this.difficulty === 'medium' ? 2.2 : 1.5;
    const spinnerSpeed = this.difficulty === 'hard' ? 3.2 : this.difficulty === 'medium' ? 2.5 : 1.7;
    for (const obs of this.obstacles) {
      if (obs.respawnTimer > 0) continue;
      if (obs.type === 'barrel') {
        const lateral = Math.sin(timeSec * barrelSpeed + obs.phase) * (this.roadHalfWidth - 3.0);
        obs.position.copy(obs.basePoint).addScaledVector(obs.rightVec, lateral);
        obs.mesh.position.copy(obs.position);
      } else if (obs.type === 'spinner') {
        obs.mesh.rotation.y = timeSec * spinnerSpeed + obs.phase;
      } else if (obs.type === 'nitro-crate') {
        const hop = Math.abs(Math.sin(timeSec * 5 + obs.phase)) * 0.45;
        obs.mesh.position.y = obs.basePoint.y + hop;
      }
    }
  }

  sampleNearestSpline(x: number, z: number): TrackSample {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i].point;
      const dx = x - p.x;
      const dz = z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    // Smoothly project onto the local segment so elevation (y) never steps/jitters
    const n = this.samples.length;
    const prev = this.samples[(bestIdx - 1 + n) % n];
    const curr = this.samples[bestIdx];
    const next = this.samples[(bestIdx + 1) % n];

    const seg = new THREE.Vector3().subVectors(next.point, prev.point);
    const segLenSq = seg.lengthSq() || 1;
    const rel = new THREE.Vector3(x - prev.point.x, 0, z - prev.point.z);
    const alpha = Math.max(0, Math.min(1, (rel.x * seg.x + rel.z * seg.z) / segLenSq));

    const smoothPoint = new THREE.Vector3().lerpVectors(prev.point, next.point, alpha);
    const dx = x - smoothPoint.x;
    const dz = z - smoothPoint.z;

    return {
      t: curr.t,
      point: smoothPoint,
      tangent: curr.tangent,
      distSq: dx * dx + dz * dz,
    };
  }
}
