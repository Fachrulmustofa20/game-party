import {
  GOLF_DEFAULT_FRICTION,
  GOLF_HOLE_COUNT,
  Vec2,
} from './MiniGolfState';

export type GolfTheme = 'beach' | 'neon' | 'ice' | 'lava';

export interface GolfPalette {
  sky: string;
  fog: string;
  ground: string;
  floor: string;
  floorAlt: string;
  wall: string;
  wallTop: string;
  accent: string;
  water: string;
  sand: string;
  hazard: string;
  hole: string;
  flag: string;
}

export interface GolfBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface GolfWall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  thickness: number;
}

export interface GolfRock {
  x: number;
  z: number;
  r: number;
}

export type GolfZoneType = 'sand' | 'water' | 'lava' | 'wind';

export interface GolfZone {
  type: GolfZoneType;
  shape: 'rect' | 'circle';
  x: number;
  z: number;
  w?: number;
  h?: number;
  r?: number;
  forceX?: number;
  forceZ?: number;
}

export type GolfDecorType =
  | 'palm'
  | 'tree'
  | 'neon-pylon'
  | 'ice-crystal'
  | 'lava-rock';

export interface GolfDecor {
  type: GolfDecorType;
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface GolfHoleDef {
  id: string;
  name: string;
  theme: GolfTheme;
  par: number;
  timeLimit: number;
  friction: number;
  bounds: GolfBounds;
  tee: Vec2;
  hole: Vec2;
  walls: GolfWall[];
  rocks: GolfRock[];
  zones: GolfZone[];
  decor: GolfDecor[];
  botWaypoints: Vec2[];
  palette: GolfPalette;
}

const BEACH: GolfPalette = {
  sky: '#8ed6ff',
  fog: '#bfe8ff',
  ground: '#2f6b4a',
  floor: '#3f8f5a',
  floorAlt: '#347a4d',
  wall: '#c9b37e',
  wallTop: '#f4e3b2',
  accent: '#f59e0b',
  water: '#1d7fa8',
  sand: '#e0bd78',
  hazard: '#ef4444',
  hole: '#111827',
  flag: '#ef4444',
};

const NEON: GolfPalette = {
  sky: '#050816',
  fog: '#0b1222',
  ground: '#05070d',
  floor: '#0b1222',
  floorAlt: '#101c36',
  wall: '#1e3a8a',
  wallTop: '#22d3ee',
  accent: '#22d3ee',
  water: '#7c3aed',
  sand: '#f472b6',
  hazard: '#f472b6',
  hole: '#020617',
  flag: '#f472b6',
};

const ICE: GolfPalette = {
  sky: '#071626',
  fog: '#0b2a3d',
  ground: '#0b2a3d',
  floor: '#12314f',
  floorAlt: '#0f2742',
  wall: '#38bdf8',
  wallTop: '#a5f3fc',
  accent: '#38bdf8',
  water: '#0ea5e9',
  sand: '#e0f2fe',
  hazard: '#f43f5e',
  hole: '#020617',
  flag: '#f43f5e',
};

const LAVA: GolfPalette = {
  sky: '#1a0b08',
  fog: '#3b0d06',
  ground: '#120a08',
  floor: '#1c1917',
  floorAlt: '#292524',
  wall: '#44403c',
  wallTop: '#f97316',
  accent: '#f97316',
  water: '#f97316',
  sand: '#57534e',
  hazard: '#fb923c',
  hole: '#020617',
  flag: '#fbbf24',
};

export const GOLF_HOLES: GolfHoleDef[] = [
  {
    id: 'sunset-shores',
    name: 'Sunset Shores',
    theme: 'beach',
    par: 2,
    timeLimit: 60,
    friction: GOLF_DEFAULT_FRICTION,
    bounds: { minX: 0, minZ: 0, maxX: 22, maxZ: 12 },
    tee: { x: 3, z: 6 },
    hole: { x: 18, z: 6 },
    walls: [],
    rocks: [
      { x: 9.5, z: 6, r: 1.05 },
      { x: 15, z: 9.4, r: 0.72 },
    ],
    zones: [
      { type: 'sand', shape: 'rect', x: 12, z: 1.2, w: 4.2, h: 3 },
    ],
    decor: [
      { type: 'palm', x: 1, z: 1, scale: 1.1, rotation: 0.4 },
      { type: 'palm', x: 21, z: 1, scale: 1, rotation: -0.5 },
      { type: 'palm', x: 1, z: 11, scale: 0.9, rotation: 1.2 },
      { type: 'palm', x: 21, z: 11, scale: 1.15, rotation: -1.1 },
      { type: 'tree', x: 11, z: 10.5, scale: 0.8, rotation: 0 },
    ],
    botWaypoints: [
      { x: 6.5, z: 8.2 },
      { x: 12.5, z: 4.2 },
      { x: 16.5, z: 6 },
    ],
    palette: BEACH,
  },
  {
    id: 'neon-loop',
    name: 'Neon Loop',
    theme: 'neon',
    par: 3,
    timeLimit: 75,
    friction: GOLF_DEFAULT_FRICTION,
    bounds: { minX: 0, minZ: 0, maxX: 18, maxZ: 16 },
    tee: { x: 3, z: 13 },
    hole: { x: 15, z: 3 },
    walls: [
      { ax: 7, az: 4, bx: 7, bz: 12, thickness: 0.55 },
      { ax: 7, az: 12, bx: 14, bz: 12, thickness: 0.55 },
      { ax: 14, az: 12, bx: 14, bz: 6, thickness: 0.55 },
    ],
    rocks: [
      { x: 10.5, z: 8.5, r: 0.9 },
      { x: 16.2, z: 9.2, r: 0.65 },
    ],
    zones: [],
    decor: [
      { type: 'neon-pylon', x: 1.5, z: 1.5, scale: 1, rotation: 0 },
      { type: 'neon-pylon', x: 16.5, z: 1.5, scale: 1, rotation: 0 },
      { type: 'neon-pylon', x: 1.5, z: 14.5, scale: 0.9, rotation: 0 },
      { type: 'neon-pylon', x: 16.5, z: 14.5, scale: 1.1, rotation: 0 },
      { type: 'neon-pylon', x: 10.5, z: 8.5, scale: 0.75, rotation: 0.4 },
    ],
    botWaypoints: [
      { x: 4.2, z: 10.2 },
      { x: 4.2, z: 2.8 },
      { x: 10.5, z: 2.5 },
      { x: 14.5, z: 4.2 },
    ],
    palette: NEON,
  },
  {
    id: 'glacier-gate',
    name: 'Glacier Gate',
    theme: 'ice',
    par: 3,
    timeLimit: 75,
    friction: 0.7,
    bounds: { minX: 0, minZ: 0, maxX: 24, maxZ: 12 },
    tee: { x: 2, z: 6 },
    hole: { x: 22, z: 6 },
    walls: [
      { ax: 8, az: 0, bx: 8, bz: 4.2, thickness: 0.5 },
      { ax: 8, az: 7.8, bx: 8, bz: 12, thickness: 0.5 },
      { ax: 16, az: 0, bx: 16, bz: 5, thickness: 0.5 },
      { ax: 16, az: 7, bx: 16, bz: 12, thickness: 0.5 },
    ],
    rocks: [
      { x: 12, z: 2.4, r: 0.78 },
      { x: 12, z: 9.6, r: 0.78 },
    ],
    zones: [
      {
        type: 'wind',
        shape: 'rect',
        x: 10,
        z: 2,
        w: 5,
        h: 8,
        forceX: 0,
        forceZ: -2.2,
      },
    ],
    decor: [
      { type: 'ice-crystal', x: 1, z: 1, scale: 1.1, rotation: 0.2 },
      { type: 'ice-crystal', x: 23, z: 1, scale: 0.9, rotation: -0.4 },
      { type: 'ice-crystal', x: 1, z: 11, scale: 0.8, rotation: 0.8 },
      { type: 'ice-crystal', x: 23, z: 11, scale: 1.2, rotation: -0.8 },
      { type: 'ice-crystal', x: 12, z: 6, scale: 0.5, rotation: 0.4 },
    ],
    botWaypoints: [
      { x: 6, z: 6 },
      { x: 10, z: 7.5 },
      { x: 14, z: 6 },
      { x: 18.5, z: 6 },
    ],
    palette: ICE,
  },
  {
    id: 'molten-vault',
    name: 'Molten Vault',
    theme: 'lava',
    par: 4,
    timeLimit: 90,
    friction: GOLF_DEFAULT_FRICTION,
    bounds: { minX: 0, minZ: 0, maxX: 30, maxZ: 18 },
    tee: { x: 3, z: 15 },
    hole: { x: 24, z: 5.75 },
    walls: [
      { ax: 10, az: 0, bx: 10, bz: 9, thickness: 0.6 },
    ],
    rocks: [
      { x: 15, z: 10.2, r: 0.95 },
      { x: 14, z: 2.2, r: 0.85 },
      { x: 12, z: 13, r: 0.7 },
    ],
    zones: [
      { type: 'lava', shape: 'rect', x: 18, z: 0, w: 12, h: 4 },
      { type: 'lava', shape: 'rect', x: 18, z: 7.5, w: 12, h: 4.5 },
    ],
    decor: [
      { type: 'lava-rock', x: 1, z: 1, scale: 1.2, rotation: 0.4 },
      { type: 'lava-rock', x: 28, z: 16, scale: 1, rotation: -0.3 },
      { type: 'lava-rock', x: 2, z: 17, scale: 0.9, rotation: 1.1 },
      { type: 'lava-rock', x: 27, z: 2, scale: 0.8, rotation: -1.2 },
      { type: 'lava-rock', x: 20, z: 12.5, scale: 0.6, rotation: 0.7 },
    ],
    botWaypoints: [
      { x: 7, z: 15 },
      { x: 13, z: 13 },
      { x: 16.5, z: 6.2 },
      { x: 21, z: 5.75 },
      { x: 24, z: 5.75 },
    ],
    palette: LAVA,
  },
];

export function getGolfHole(index: number): GolfHoleDef {
  return GOLF_HOLES[index % GOLF_HOLE_COUNT];
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

export function renderHolePreviewSvg(def: GolfHoleDef): string {
  const { minX, minZ, maxX, maxZ } = def.bounds;
  const width = maxX - minX;
  const height = maxZ - minZ;
  const pad = 1;
  const viewBox = `${minX - pad} ${minZ - pad} ${width + pad * 2} ${height + pad * 2}`;
  const p = def.palette;
  const layers: string[] = [
    `<rect x="${minX - pad}" y="${minZ - pad}" width="${width + pad * 2}" height="${height + pad * 2}" fill="${p.ground}" rx="1.2"/>`,
    `<rect x="${minX}" y="${minZ}" width="${width}" height="${height}" fill="${p.floor}" rx="0.7"/>`,
  ];

  for (const zone of def.zones) {
    const fill =
      zone.type === 'sand'
        ? p.sand
        : zone.type === 'water'
        ? p.water
        : zone.type === 'lava'
        ? p.hazard
        : p.accent;
    const opacity = zone.type === 'wind' ? 0.18 : 0.88;
    if (zone.shape === 'rect') {
      layers.push(
        `<rect x="${zone.x}" y="${zone.z}" width="${zone.w ?? 0}" height="${zone.h ?? 0}" fill="${fill}" opacity="${opacity}" rx="0.5"/>`
      );
    } else {
      layers.push(
        `<circle cx="${zone.x}" cy="${zone.z}" r="${zone.r ?? 0}" fill="${fill}" opacity="${opacity}"/>`
      );
    }
  }

  for (const rock of def.rocks) {
    layers.push(
      `<circle cx="${rock.x}" cy="${rock.z}" r="${rock.r}" fill="${p.wall}" stroke="${p.wallTop}" stroke-width="0.18"/>`
    );
  }

  for (const wall of def.walls) {
    layers.push(
      `<line x1="${wall.ax}" y1="${wall.az}" x2="${wall.bx}" y2="${wall.bz}" stroke="${p.wall}" stroke-width="${wall.thickness}" stroke-linecap="round"/>`,
      `<line x1="${wall.ax}" y1="${wall.az}" x2="${wall.bx}" y2="${wall.bz}" stroke="${p.wallTop}" stroke-width="${Math.max(0.08, wall.thickness * 0.22)}" stroke-linecap="round" opacity="0.9"/>`
    );
  }

  layers.push(
    `<circle cx="${def.tee.x}" cy="${def.tee.z}" r="0.42" fill="#f8fafc" stroke="${p.accent}" stroke-width="0.16"/>`,
    `<circle cx="${def.hole.x}" cy="${def.hole.z}" r="0.52" fill="${p.hole}" stroke="${p.flag}" stroke-width="0.16"/>`,
    `<line x1="${def.hole.x}" y1="${def.hole.z}" x2="${def.hole.x}" y2="${def.hole.z - 1.7}" stroke="${p.flag}" stroke-width="0.12"/>`,
    `<path d="M ${def.hole.x} ${def.hole.z - 1.7} L ${def.hole.x + 1.1} ${def.hole.z - 1.35} L ${def.hole.x} ${def.hole.z - 1.0} Z" fill="${p.flag}"/>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escapeXml(
    def.name
  )} hole preview" style="display:block;width:100%;height:100%;">${layers.join('')}</svg>`;
}
