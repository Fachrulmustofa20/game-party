export type ShipStyle = 'interceptor' | 'delta' | 'stealth' | 'twin' | 'heavy';

export interface SpaceCharacterSpec {
  id: string;
  name: string;
  shipLabel: string;
  shipStyle: ShipStyle;
  color: string;
  accent: string;
}

export const SPACE_CHARACTERS: SpaceCharacterSpec[] = [
  {
    id: 'viper',
    name: 'Nova Viper',
    shipLabel: 'Interceptor',
    shipStyle: 'interceptor',
    color: '#38bdf8',
    accent: '#e0f2fe',
  },
  {
    id: 'crimson',
    name: 'Crimson Fang',
    shipLabel: 'Assault Delta',
    shipStyle: 'delta',
    color: '#ef4444',
    accent: '#fde047',
  },
  {
    id: 'phantom',
    name: 'Phantom Wing',
    shipLabel: 'Stealth Jet',
    shipStyle: 'stealth',
    color: '#a855f7',
    accent: '#38bdf8',
  },
  {
    id: 'solar',
    name: 'Solar Phoenix',
    shipLabel: 'Twin Striker',
    shipStyle: 'twin',
    color: '#f97316',
    accent: '#fef08a',
  },
  {
    id: 'emerald',
    name: 'Emerald Hornet',
    shipLabel: 'Agile Scout',
    shipStyle: 'interceptor',
    color: '#22c55e',
    accent: '#bef264',
  },
  {
    id: 'titan',
    name: 'Cobalt Titan',
    shipLabel: 'Heavy Cruiser',
    shipStyle: 'heavy',
    color: '#2563eb',
    accent: '#67e8f9',
  },
  {
    id: 'valkyrie',
    name: 'Solaris Gold',
    shipLabel: 'Royal Delta',
    shipStyle: 'delta',
    color: '#eab308',
    accent: '#fef9c3',
  },
  {
    id: 'frost',
    name: 'Frost Nova',
    shipLabel: 'Cryo Stealth',
    shipStyle: 'stealth',
    color: '#06b6d4',
    accent: '#cffafe',
  },
  {
    id: 'crimson_twin',
    name: 'Blaze Twin',
    shipLabel: 'Dual Cannon',
    shipStyle: 'twin',
    color: '#ec4899',
    accent: '#fbcfe8',
  },
  {
    id: 'obsidian',
    name: 'Obsidian Dread',
    shipLabel: 'Siege Heavy',
    shipStyle: 'heavy',
    color: '#64748b',
    accent: '#f8fafc',
  },
];

export function getSpaceCharacter(characterId?: string, slot = 0): SpaceCharacterSpec {
  if (characterId) {
    const found = SPACE_CHARACTERS.find((c) => c.id === characterId);
    if (found) return found;
  }
  return SPACE_CHARACTERS[Math.abs(slot) % SPACE_CHARACTERS.length];
}

export function renderShipPreviewSvg(
  shipStyle: ShipStyle,
  hullColor: string,
  accentColor: string
): string {
  let body = '';
  if (shipStyle === 'delta') {
    body = `
      <polygon points="88,28 20,8 32,28 20,48" fill="${hullColor}" stroke="#ffffff" stroke-width="1.5"/>
      <polygon points="64,28 38,20 42,28 38,36" fill="${accentColor}"/>
      <ellipse cx="52" cy="28" rx="9" ry="4.5" fill="#0f172a" stroke="${accentColor}" stroke-width="1.2"/>
    `;
  } else if (shipStyle === 'stealth') {
    body = `
      <polygon points="90,28 42,6 16,18 28,28 16,38 42,50" fill="${hullColor}" stroke="${accentColor}" stroke-width="1.5"/>
      <ellipse cx="56" cy="28" rx="10" ry="4" fill="#0f172a" stroke="${accentColor}" stroke-width="1.3"/>
      <circle cx="22" cy="28" r="4" fill="${accentColor}"/>
    `;
  } else if (shipStyle === 'twin') {
    body = `
      <rect x="22" y="13" width="44" height="8" rx="3" fill="${hullColor}"/>
      <rect x="22" y="35" width="44" height="8" rx="3" fill="${hullColor}"/>
      <polygon points="88,28 32,18 32,38" fill="${hullColor}" stroke="#ffffff" stroke-width="1.3"/>
      <ellipse cx="56" cy="28" rx="9" ry="4.5" fill="#0f172a" stroke="${accentColor}" stroke-width="1.4"/>
      <circle cx="20" cy="17" r="3.5" fill="${accentColor}"/>
      <circle cx="20" cy="39" r="3.5" fill="${accentColor}"/>
    `;
  } else if (shipStyle === 'heavy') {
    body = `
      <path d="M18 14 L58 14 L86 24 L86 32 L58 42 L18 42 L26 28 Z" fill="${hullColor}" stroke="#ffffff" stroke-width="1.5"/>
      <rect x="34" y="21" width="28" height="14" rx="5" fill="#0f172a" stroke="${accentColor}" stroke-width="1.6"/>
      <rect x="12" y="19" width="10" height="6" rx="2" fill="${accentColor}"/>
      <rect x="12" y="31" width="10" height="6" rx="2" fill="${accentColor}"/>
    `;
  } else {
    // Interceptor
    body = `
      <polygon points="88,28 24,10 36,28 24,46" fill="${hullColor}" stroke="#ffffff" stroke-width="1.5"/>
      <polygon points="58,28 32,18 38,28 32,38" fill="${accentColor}" opacity="0.85"/>
      <ellipse cx="54" cy="28" rx="9" ry="4.5" fill="#0f172a" stroke="#e0f2fe" stroke-width="1.2"/>
      <circle cx="24" cy="28" r="4.5" fill="${accentColor}"/>
    `;
  }
  return `<svg class="car-preview-svg" viewBox="0 0 100 56" aria-hidden="true">${body}</svg>`;
}
