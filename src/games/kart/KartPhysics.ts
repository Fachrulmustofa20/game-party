import * as THREE from 'three';
import { ControllerInputState } from '../../net/BinaryProtocol';
import { getKartCharacter } from '../../sdk/KartCharacters';
import { TrackBuilder } from './TrackBuilder';

export interface KartState {
  id: string;
  slot: number;
  name: string;
  color: string;
  isBot: boolean;
  position: THREE.Vector3;
  heading: number; // radians
  speed: number; // m/s
  verticalVel: number;
  grounded: boolean;

  // CTR Drift & Turbo Reserve system
  drifting: boolean;
  driftDir: number; // -1 left, +1 right
  turboCharge: number; // 0..100
  turboReserve: number; // seconds of active boost
  boostCooldown?: number; // seconds until next standalone nitro boost
  prevBoostPressed: boolean;
  prevDriftPressed?: boolean;
  prevItemPressed: boolean;

  // Race state
  splineT: number;
  furthestCheckpoint: number; // 0..3 must be visited in order before lap++
  lap: number; // 1..maxLaps
  totalProgress: number; // (lap - 1) + splineT
  rank: number;
  finished: boolean;
  finishTime: number;
  eliminated: boolean;
  offCameraTimer: number; // 0..10 seconds off-camera in 5-10P mode

  // Items & Hits
  heldItem: number; // 0=none, 1=missile, 2=bomb, 3=tnt, 4=shield, 5=turbo
  fruits: number; // 0..10
  shieldTimer: number;
  spinoutTimer: number;
  spinoutDuration: number;
  obstacleCooldown: number;
  rampCooldown?: number;
  collisionCooldown?: number;

  // 3D Mesh & Animated Subparts
  mesh: THREE.Group;
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
  sparkMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  frontWheels: THREE.Group[];
  allWheels: THREE.Mesh[];
  driverGroup?: THREE.Group;
  headGroup?: THREE.Group;
  steerWheel?: THREE.Mesh;
  lookBackTimer?: number;
}

function createNameplateSprite(name: string, accentColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(8, 12, 23, 0.8)';
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
  ctx.fillText(name.slice(0, 12), 44, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 3.2, 0);
  sprite.scale.set(3.4, 0.85, 1);
  return sprite;
}

function createKartLiveryTexture(
  baseColor: string,
  accentColor: string,
  slot: number
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle carbon-fiber / metallic weave
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < 256; y += 8) {
    for (let x = (y % 16 === 0 ? 0 : 4); x < 256; x += 8) {
      ctx.fillRect(x, y, 4, 4);
    }
  }

  // Dual Racing Stripes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(102, 0, 18, 256);
  ctx.fillRect(136, 0, 18, 256);
  ctx.fillStyle = accentColor;
  ctx.fillRect(120, 0, 16, 256);

  // Panel seam lines
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 244, 244);

  // Racing Number Badge
  ctx.beginPath();
  ctx.arc(128, 128, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 36px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(slot + 1), 128, 130);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTireTreadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#334155';
  for (let y = 0; y < 128; y += 16) {
    ctx.fillRect(0, y, 128, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createKartMesh(
  kartColor: string,
  slot: number,
  characterId?: string,
  playerName?: string
): {
  group: THREE.Group;
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
  sparkMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  frontWheels: THREE.Group[];
  allWheels: THREE.Mesh[];
  driverGroup?: THREE.Group;
  headGroup?: THREE.Group;
  steerWheel?: THREE.Mesh;
  lookBackTimer?: number;
} {
  const group = new THREE.Group();
  const char = getKartCharacter(characterId, slot);
  const liveryTex = createKartLiveryTexture(kartColor, char.accent, slot);

  const paintMat = new THREE.MeshPhysicalMaterial({
    map: liveryTex,
    roughness: 0.22,
    metalness: 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.35,
    metalness: 0.78,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#f1f5f9',
    roughness: 0.12,
    metalness: 0.95,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: char.accent,
    roughness: 0.3,
    metalness: 0.4,
    emissive: char.carStyle === 'hover' ? char.accent : '#000000',
    emissiveIntensity: char.carStyle === 'hover' ? 0.35 : 0,
  });

  // 1. Car Chassis by Character CarStyle
  if (char.carStyle === 'formula') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.46, 3.1), paintMat);
    body.position.set(0, 0.52, 0.1);
    body.castShadow = true;
    group.add(body);

    const noseCone = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 1.35), paintMat);
    noseCone.position.set(0, 0.46, 1.95);
    noseCone.rotation.x = 0.08;
    noseCone.castShadow = true;
    group.add(noseCone);

    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.1, 0.52), accentMat);
    frontWing.position.set(0, 0.32, 2.38);
    frontWing.castShadow = true;
    group.add(frontWing);

    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.55), paintMat);
    rearWing.position.set(0, 1.48, -1.55);
    rearWing.castShadow = true;
    group.add(rearWing);
  } else if (char.carStyle === 'monster') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.72, 2.95), paintMat);
    body.position.set(0, 0.88, 0.05);
    body.castShadow = true;
    group.add(body);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, 1.4), darkMetal);
    cab.position.set(0, 1.32, -0.15);
    group.add(cab);

    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.32, 0.24), chromeMat);
    bullBar.position.set(0, 0.68, 1.65);
    group.add(bullBar);
  } else if (char.carStyle === 'buggy') {
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, 2.75), paintMat);
    tub.position.set(0, 0.56, 0.05);
    tub.castShadow = true;
    group.add(tub);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 1.05), paintMat);
    hood.position.set(0, 0.58, 1.55);
    hood.rotation.x = 0.18;
    group.add(hood);

    for (const rx of [-0.68, 0.68]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 8), accentMat);
      bar.rotation.x = Math.PI / 3;
      bar.position.set(rx, 1.18, -0.35);
      group.add(bar);
    }
  } else if (char.carStyle === 'hover') {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 0.48, 12), paintMat);
    hull.scale.set(1, 1, 1.45);
    hull.position.set(0, 0.62, 0.05);
    hull.castShadow = true;
    group.add(hull);

    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 8, 20), accentMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.scale.set(1, 1.4, 1);
    glowRing.position.set(0, 0.42, 0.05);
    group.add(glowRing);
  } else if (char.carStyle === 'tank') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.68, 3.0), paintMat);
    hull.position.set(0, 0.66, 0.05);
    hull.castShadow = true;
    group.add(hull);

    const ram = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.65), darkMetal);
    ram.position.set(0, 0.52, 1.72);
    ram.rotation.x = 0.25;
    group.add(ram);

    for (const sx of [-1.05, 1.05]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 2.35), darkMetal);
      plate.position.set(sx, 0.62, 0);
      group.add(plate);
    }
  } else {
    // Classic CTR Sport Kart
    const mainTub = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.7), paintMat);
    mainTub.position.set(0, 0.58, 0.05);
    mainTub.castShadow = true;
    group.add(mainTub);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 1.0), paintMat);
    nose.position.set(0, 0.54, 1.55);
    nose.rotation.x = 0.12;
    nose.castShadow = true;
    group.add(nose);

    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.85, 8), chromeMat);
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, 0.42, 2.02);
    group.add(bumper);

    for (const sx of [-0.95, 0.95]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 1.55), paintMat);
      pod.position.set(sx, 0.52, -0.05);
      pod.castShadow = true;
      group.add(pod);
    }

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.14, 0.55), paintMat);
    spoiler.position.set(0, 1.38, -1.45);
    spoiler.rotation.x = -0.18;
    spoiler.castShadow = true;
    group.add(spoiler);

    for (const sx of [-0.65, 0.65]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.35), darkMetal);
      strut.position.set(sx, 1.12, -1.4);
      group.add(strut);
    }
  }

  // Bucket Racing Seat + Headlights + Taillights
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.18), darkMetal);
  seatBack.position.set(0, 1.05, -0.58);
  seatBack.rotation.x = -0.18;
  group.add(seatBack);

  const headLightMat = new THREE.MeshBasicMaterial({ color: '#fef9c3' });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
  for (const lx of [-0.45, 0.45]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), headLightMat);
    hl.scale.set(1, 0.8, 0.5);
    hl.position.set(lx, 0.62, 1.98);
    group.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.08), tailLightMat);
    tl.position.set(lx, 0.72, -1.62);
    group.add(tl);
  }

  // Rear Engine
  const engine = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.75), darkMetal);
  engine.position.set(0, 0.85, -1.25);
  engine.castShadow = true;
  group.add(engine);

  // Twin Angled CTR Exhaust Pipes + Flames
  const pipeGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.75, 10);
  const flameGeo = new THREE.ConeGeometry(0.28, 1.45, 8);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#00e5ff' });

  const flameLeft = new THREE.Mesh(flameGeo, flameMat);
  const flameRight = new THREE.Mesh(flameGeo, flameMat);

  for (const [px, flame] of [
    [-0.45, flameLeft],
    [0.45, flameRight],
  ] as const) {
    const pipe = new THREE.Mesh(pipeGeo, chromeMat);
    pipe.rotation.x = Math.PI / 2 - 0.3;
    pipe.position.set(px, 0.95, -1.68);
    group.add(pipe);

    flame.position.set(px, 1.05, -2.55);
    flame.visible = false;
    group.add(flame);
  }

  // Steering Wheel
  const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 12), darkMetal);
  steerWheel.position.set(0, 1.05, 0.65);
  steerWheel.rotation.x = -0.5;
  group.add(steerWheel);

  // 2. CTR Character Driver
  const driver = new THREE.Group();
  driver.position.set(0, 0.85, -0.15);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.38, 6, 12),
    new THREE.MeshStandardMaterial({ color: char.outfit, roughness: 0.55 })
  );
  torso.position.y = 0.38;
  torso.castShadow = true;
  driver.add(torso);

  // Driver Arms & Gloves reaching toward the steering wheel
  const armMat = new THREE.MeshStandardMaterial({ color: char.outfit, roughness: 0.55 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4 });
  for (const ax of [-0.36, 0.36]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), armMat);
    arm.position.set(ax, 0.48, 0.32);
    arm.rotation.x = Math.PI / 2.6;
    arm.rotation.z = ax > 0 ? 0.25 : -0.25;
    driver.add(arm);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), gloveMat);
    glove.position.set(ax * 0.65, 0.28, 0.68);
    driver.add(glove);
  }

  // Head Group (pivots at neck so driver can look back or into corners)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.0, 0);

  // Glossy Tinted Racing Visor
  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.47, 0.22, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
    new THREE.MeshPhysicalMaterial({
      color: '#0f172a',
      roughness: 0.08,
      metalness: 0.2,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
  );
  visor.position.set(0, 0.04, 0.03);
  headGroup.add(visor);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 14, 14),
    new THREE.MeshStandardMaterial({ color: char.skin, roughness: 0.45 })
  );
  head.castShadow = true;
  headGroup.add(head);

  // Expressive Eyes / Goggles
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
  for (const ex of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeWhiteMat);
    eye.position.set(ex, 0.06, 0.4);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), pupilMat);
    pupil.position.set(ex, 0.06, 0.47);
    headGroup.add(eye, pupil);
  }

  // Character-specific Silhouette Ears / Hair / Horns
  const earMat = new THREE.MeshStandardMaterial({ color: char.accent, roughness: 0.4 });
  if (char.earType === 'bandicoot' || char.earType === 'bear') {
    for (const ex of [-0.32, 0.32]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 6), earMat);
      ear.position.set(ex, 0.46, -0.05);
      ear.rotation.z = ex > 0 ? -0.35 : 0.35;
      headGroup.add(ear);
    }
  } else if (char.earType === 'ponytail') {
    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 7), earMat);
    hair.position.set(0, 0.32, -0.38);
    hair.rotation.x = -0.8;
    headGroup.add(hair);
  } else if (char.earType === 'cortex') {
    const flatTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.65), earMat);
    flatTop.position.set(0, 0.44, 0);
    headGroup.add(flatTop);
  } else if (char.earType === 'alien') {
    for (const ex of [-0.22, 0.22]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6), earMat);
      ant.position.set(ex, 0.52, 0);
      headGroup.add(ant);
    }
  } else {
    for (const ex of [-0.34, 0.34]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), earMat);
      horn.position.set(ex, 0.42, 0.1);
      horn.rotation.x = 0.4;
      headGroup.add(horn);
    }
  }
  driver.add(headGroup);
  group.add(driver);

  if (playerName) {
    group.add(createNameplateSprite(playerName, kartColor));
  }

  // 3. Detailed Wheels with Rims (Front steer + All spin)
  const tireGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 14);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    map: createTireTreadTexture(),
    roughness: 0.85,
  });
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.45, 10);
  rimGeo.rotateZ(Math.PI / 2);

  const frontWheels: THREE.Group[] = [];
  const allWheels: THREE.Mesh[] = [];

  for (const [wx, wz, isFront] of [
    [-1.18, 1.15, true],
    [1.18, 1.15, true],
    [-1.24, -1.08, false],
    [1.24, -1.08, false],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.46, wz);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    tire.add(rim);
    pivot.add(tire);
    group.add(pivot);
    allWheels.push(tire);
    if (isFront) frontWheels.push(pivot);
  }

  // Enable shadows on all solid car & driver parts
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  // Ground contact shadow directly underneath each player's car
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d');
  if (sctx) {
    const grad = sctx.createRadialGradient(32, 32, 6, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
  }
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 4.4),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.05, 0.05);
  group.add(contactShadow);

  // Drift Spark Halo behind rear wheels
  const sparkMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 8),
    new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.85 })
  );
  sparkMesh.position.set(0, 0.35, -1.65);
  sparkMesh.visible = false;
  group.add(sparkMesh);

  // Shield Bubble
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#22c55e', wireframe: true, transparent: true, opacity: 0.5 })
  );
  shieldMesh.position.y = 1.1;
  shieldMesh.visible = false;
  group.add(shieldMesh);

  return {
    group,
    flameLeft,
    flameRight,
    sparkMesh,
    shieldMesh,
    frontWheels,
    allWheels,
    driverGroup: driver,
    headGroup,
    steerWheel,
  };
}

export function stepKartPhysics(
  kart: KartState,
  input: ControllerInputState,
  track: TrackBuilder,
  dt: number,
  onTriggerBoost: (kart: KartState) => void,
  onUseItem: (kart: KartState) => void
): void {
  if (kart.obstacleCooldown > 0) {
    kart.obstacleCooldown = Math.max(0, kart.obstacleCooldown - dt);
  }
  if ((kart.rampCooldown ?? 0) > 0) {
    kart.rampCooldown = Math.max(0, (kart.rampCooldown ?? 0) - dt);
  }
  if ((kart.collisionCooldown ?? 0) > 0) {
    kart.collisionCooldown = Math.max(0, (kart.collisionCooldown ?? 0) - dt);
  }

  if (kart.spinoutTimer > 0) {
    kart.spinoutTimer = Math.max(0, kart.spinoutTimer - dt);
    kart.speed *= 1 - 1.4 * dt; // Gentle slowdown while sliding through
    const fwdX = Math.sin(kart.heading);
    const fwdZ = Math.cos(kart.heading);
    kart.position.x += fwdX * kart.speed * dt;
    kart.position.z += fwdZ * kart.speed * dt;

    const sample = track.sampleNearestSpline(kart.position.x, kart.position.z);
    kart.position.y = Math.max(kart.position.y, sample.point.y);
    kart.mesh.position.copy(kart.position);

    const dur = kart.spinoutDuration || 0.9;
    const progress = 1 - kart.spinoutTimer / dur;
    kart.mesh.rotation.y = kart.heading + progress * Math.PI * 4; // Exact 2 full spins (720°)
    return;
  }

  if (kart.shieldTimer > 0) {
    kart.shieldTimer -= dt;
    kart.shieldMesh.visible = kart.shieldTimer > 0;
    kart.shieldMesh.rotation.y += 2.5 * dt;
  } else {
    kart.shieldMesh.visible = false;
  }

  const baseTop = track.difficulty === 'hard' ? 40 : track.difficulty === 'medium' ? 39 : 37;
  const botMod = kart.isBot
    ? track.difficulty === 'hard'
      ? 1.06
      : track.difficulty === 'medium'
      ? 0.99
      : 0.91
    : 1.0;
  const maxBaseSpeed = (baseTop + kart.fruits * 0.6) * botMod;
  const boostBonus = kart.turboReserve > 0 ? 18 : 0;
  if (kart.turboReserve > 0) {
    kart.turboReserve = Math.max(0, kart.turboReserve - dt);
  }
  if ((kart.boostCooldown ?? 0) > 0) {
    kart.boostCooldown = Math.max(0, (kart.boostCooldown ?? 0) - dt);
  }

  const targetMax = maxBaseSpeed + boostBonus;

  if (input.gas || kart.turboReserve > 0) {
    kart.speed += 32 * dt;
  } else if (input.brake) {
    kart.speed -= 34 * dt;
  } else {
    kart.speed *= 1 - 1.8 * dt;
  }
  kart.speed = Math.max(-14, Math.min(targetMax, kart.speed));

  const driftJustPressed = input.drift && !kart.prevDriftPressed;
  if (driftJustPressed && kart.grounded && !kart.drifting) {
    // Always hop on press; enter drift immediately if steering with speed
    kart.verticalVel = 5.4;
    kart.grounded = false;
    if (kart.speed > 8 && Math.abs(input.steer) > 0.12) {
      kart.drifting = true;
      kart.driftDir = input.steer > 0 ? 1 : -1;
      kart.turboCharge = 0;
    }
  } else if (input.drift && !kart.drifting && kart.speed > 8 && Math.abs(input.steer) > 0.12) {
    // Allow initiating drift mid-hold once player steers
    kart.drifting = true;
    kart.driftDir = input.steer > 0 ? 1 : -1;
    kart.turboCharge = 0;
  } else if (!input.drift && kart.drifting) {
    kart.drifting = false;
    kart.turboCharge = 0;
  }
  kart.prevDriftPressed = input.drift;

  // Hard (Polar Peak) has icier, wider-arc steering; Easy has crisp high grip
  const turnRate = track.difficulty === 'hard' ? 1.85 : track.difficulty === 'medium' ? 2.15 : 2.3;
  if (kart.drifting) {
    const steerMod = kart.driftDir * 0.75 + input.steer * 0.55;
    kart.heading -= steerMod * turnRate * dt;
    kart.turboCharge = 0;
  } else {
    const speedFactor = Math.min(1, Math.abs(kart.speed) / 12);
    kart.heading -= input.steer * turnRate * speedFactor * dt;
  }

  if (input.boost && !kart.prevBoostPressed && (kart.boostCooldown ?? 0) <= 0) {
    kart.turboReserve = Math.min(4.0, Math.max(kart.turboReserve, 1.25));
    kart.boostCooldown = 15.0;
    onTriggerBoost(kart);
  }
  kart.prevBoostPressed = input.boost;

  if (input.item && !kart.prevItemPressed && kart.heldItem > 0) {
    onUseItem(kart);
  }
  kart.prevItemPressed = input.item;

  const forwardX = Math.sin(kart.heading);
  const forwardZ = Math.cos(kart.heading);
  kart.position.x += forwardX * kart.speed * dt;
  kart.position.z += forwardZ * kart.speed * dt;

  const sample = track.sampleNearestSpline(kart.position.x, kart.position.z);
  const dist = Math.sqrt(sample.distSq);
  if (dist > track.roadHalfWidth - 1.4) {
    const toCenterX = sample.point.x - kart.position.x;
    const toCenterZ = sample.point.z - kart.position.z;
    const len = Math.hypot(toCenterX, toCenterZ) || 1;
    const overlap = dist - (track.roadHalfWidth - 1.4);
    kart.position.x += (toCenterX / len) * overlap;
    kart.position.z += (toCenterZ / len) * overlap;
    kart.speed *= 0.85;
  }

  // Check if kart is riding on any Jump Ramp surface
  let groundY = sample.point.y;
  let onRampPitch = 0;

  for (const ramp of track.ramps) {
    const rx = kart.position.x - ramp.position.x;
    const rz = kart.position.z - ramp.position.z;
    const fwdDist = rx * ramp.forward.x + rz * ramp.forward.z;
    const latDist = rx * ramp.right.x + rz * ramp.right.z;

    if (
      Math.abs(latDist) <= ramp.halfWidth + 0.6 &&
      fwdDist >= -ramp.halfLength &&
      fwdDist <= ramp.halfLength
    ) {
      const progress = (fwdDist + ramp.halfLength) / (ramp.halfLength * 2);
      const rampSurfaceY = ramp.position.y + progress * ramp.height;
      if (rampSurfaceY > groundY) {
        groundY = rampSurfaceY;
        onRampPitch = -Math.atan2(ramp.height, ramp.halfLength * 2);
      }

      // Launch cleanly ONLY when reaching the top lip of the ramp!
      if (
        progress >= 0.82 &&
        (kart.rampCooldown ?? 0) <= 0 &&
        kart.speed > 10 &&
        kart.position.y <= rampSurfaceY + 0.6
      ) {
        const speedScale = 0.72 + 0.35 * Math.min(1, kart.speed / 36);
        kart.position.y = rampSurfaceY;
        kart.verticalVel = ramp.launchVel * speedScale;
        kart.grounded = false;
        kart.rampCooldown = 0.75;
      }
      break;
    }
  }

  kart.verticalVel -= 22 * dt;
  kart.position.y += kart.verticalVel * dt;
  if (kart.position.y <= groundY) {
    kart.position.y = groundY;
    kart.verticalVel = 0;
    kart.grounded = true;
  }

  // Checkpoint-validated Lap & Progress tracking
  const prevT = kart.splineT;
  const newT = sample.t;

  if (newT >= 0.15 && newT < 0.42 && kart.furthestCheckpoint === 0) {
    kart.furthestCheckpoint = 1;
  } else if (newT >= 0.42 && newT < 0.68 && kart.furthestCheckpoint === 1) {
    kart.furthestCheckpoint = 2;
  } else if (newT >= 0.68 && newT <= 0.95 && kart.furthestCheckpoint === 2) {
    kart.furthestCheckpoint = 3;
  }

  if (prevT > 0.85 && newT < 0.15 && kart.furthestCheckpoint === 3) {
    kart.lap++;
    kart.furthestCheckpoint = 0;
  }

  kart.splineT = newT;
  // If kart hasn't crossed start line yet on Lap 1 (still behind t=0 at t>0.85), keep progress <= 0
  const lapFraction =
    kart.lap === 1 && kart.furthestCheckpoint === 0 && newT > 0.8 ? newT - 1 : newT;
  kart.totalProgress = kart.lap - 1 + lapFraction;

  // Update 3D mesh & animations (including flying pitch tilt when airborne!)
  kart.mesh.position.copy(kart.position);
  const visualDriftYaw = kart.drifting ? -kart.driftDir * 0.36 : 0;
  kart.mesh.rotation.y = kart.heading + visualDriftYaw;
  const targetPitch = kart.grounded
    ? onRampPitch
    : THREE.MathUtils.clamp(-kart.verticalVel * 0.028, -0.45, 0.35);
  kart.mesh.rotation.x += (targetPitch - kart.mesh.rotation.x) * Math.min(1, 10 * dt);

  // Wheel spin & front wheel steering visual
  for (const w of kart.allWheels) {
    w.rotation.x += kart.speed * dt * 1.4;
  }
  for (const fw of kart.frontWheels) {
    fw.rotation.y = -input.steer * 0.42;
  }
  if (kart.steerWheel) {
    kart.steerWheel.rotation.z = -input.steer * 0.6;
  }

  // Driver body counter-lean (turn right -> lean left, turn left -> lean right) & look back
  if (kart.driverGroup && kart.headGroup) {
    const leanFactor = kart.drifting ? 0.32 : 0.24;
    const speedRatio = Math.min(1, Math.abs(kart.speed) / 25);
    const targetRoll = -input.steer * leanFactor * speedRatio;
    const targetShiftX = input.steer * 0.14 * speedRatio;
    const targetBodyPitch = kart.turboReserve > 0 ? -0.16 : input.gas ? -0.05 : 0.04;

    const animAlpha = Math.min(1, 10 * dt);
    kart.driverGroup.rotation.z += (targetRoll - kart.driverGroup.rotation.z) * animAlpha;
    kart.driverGroup.rotation.x += (targetBodyPitch - kart.driverGroup.rotation.x) * animAlpha;
    kart.driverGroup.position.x += (targetShiftX - kart.driverGroup.position.x) * animAlpha;

    kart.lookBackTimer = ((kart.lookBackTimer ?? kart.slot * 1.3) + dt) % 6.0;
    const glancingBack =
      input.brake || kart.speed < -1 || (kart.lookBackTimer > 4.9 && kart.lookBackTimer < 5.75);
    const targetHeadYaw = glancingBack ? Math.PI * 0.78 : -input.steer * 0.35;
    kart.headGroup.rotation.y += (targetHeadYaw - kart.headGroup.rotation.y) * Math.min(1, 9 * dt);
  }

  // Twin Nitro Exhaust Flames
  const boosting = kart.turboReserve > 0;
  kart.flameLeft.visible = boosting;
  kart.flameRight.visible = boosting;
  if (boosting) {
    const s = 0.85 + Math.random() * 0.55;
    kart.flameLeft.scale.set(s, s, s);
    kart.flameRight.scale.set(s, s, s);
  }

  // CTR Drift Sparks (yellow -> red)
  kart.sparkMesh.visible = kart.drifting && kart.grounded;
  if (kart.sparkMesh.visible) {
    const sMat = kart.sparkMesh.material as THREE.MeshBasicMaterial;
    sMat.color.set(kart.turboCharge >= 60 ? '#ef4444' : '#facc15');
    const sc = 0.6 + Math.random() * 0.7;
    kart.sparkMesh.scale.set(sc, sc, sc);
  }
}

export function computeBotInput(kart: KartState, track: TrackBuilder): ControllerInputState {
  const lookAheadT = (kart.splineT + 0.032) % 1;
  const centerTarget = track.curve.getPointAt(lookAheadT);
  const tan = track.curve.getTangentAt(lookAheadT).normalize();
  const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

  // Dynamic racing line per bot (natural weaving + lane preference)
  const laneBias = ((kart.slot % 5) - 2) * 2.1;
  const weave = Math.sin(kart.splineT * 16 + kart.slot * 2.3) * 1.8;
  let desiredOffset = Math.max(-9.5, Math.min(9.5, laneBias + weave));

  // Scan ahead for obstacles (oil, rolling barrels, tiki spinners, nitro crates)
  const fwdX = Math.sin(kart.heading);
  const fwdZ = Math.cos(kart.heading);
  const rightX = Math.cos(kart.heading);
  const rightZ = -Math.sin(kart.heading);

  let avoidSteer = 0;
  let needHop = false;

  for (const obs of track.obstacles) {
    if (obs.respawnTimer > 0) continue;
    const ox = obs.position.x - kart.position.x;
    const oz = obs.position.z - kart.position.z;
    const forwardDist = ox * fwdX + oz * fwdZ;
    if (forwardDist < 1 || forwardDist > 34) continue;

    const sideDist = ox * rightX + oz * rightZ;
    const clearance = obs.radius + 3.2;
    if (Math.abs(sideDist) < clearance) {
      const urgency = 1 - forwardDist / 34;
      // Steer away from the obstacle's side
      const dir = sideDist >= 0 ? -1 : 1;
      avoidSteer += dir * (0.65 + urgency * 0.9);
      if (forwardDist < 10 && Math.abs(sideDist) < obs.radius + 1.0 && obs.type === 'oil') {
        needHop = true;
      }
    }
  }

  // Opportunistically aim for Boost Pads or Item Crates if path is clear
  if (Math.abs(avoidSteer) < 0.15) {
    for (const pad of track.boostPads) {
      const px = pad.position.x - kart.position.x;
      const pz = pad.position.z - kart.position.z;
      const fd = px * fwdX + pz * fwdZ;
      if (fd > 4 && fd < 28) {
        const sd = px * rightX + pz * rightZ;
        if (Math.abs(sd) < 8) {
          desiredOffset += Math.max(-4, Math.min(4, sd * 0.5));
          break;
        }
      }
    }
  }

  const target = centerTarget.clone().addScaledVector(right, desiredOffset);
  const dx = target.x - kart.position.x;
  const dz = target.z - kart.position.z;
  const desiredHeading = Math.atan2(dx, dz);

  let diff = desiredHeading - kart.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const baseSteer = -diff * 2.6;
  const steer = Math.max(-1, Math.min(1, baseSteer + avoidSteer));
  const moderateTurn = Math.abs(diff) > 0.35 && Math.abs(diff) < 0.85 && Math.abs(avoidSteer) < 0.25;
  const straightBoost = Math.abs(diff) < 0.12 && (kart.boostCooldown ?? 0) <= 0 && Math.abs(avoidSteer) < 0.1;

  return {
    seq: 0,
    steer,
    gas: true,
    brake: false,
    drift: moderateTurn || needHop,
    boost: straightBoost,
    item: kart.heldItem > 0 && Math.random() < 0.035,
    timestamp: 0,
  };
}
