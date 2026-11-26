export type CarStyle = 'sport' | 'formula' | 'monster' | 'buggy' | 'hover' | 'tank';

export interface KartCharacterSpec {
  id: string;
  name: string;
  carLabel: string;
  emoji: string;
  carStyle: CarStyle;
  skin: string;
  outfit: string;
  accent: string;
  earType: 'bandicoot' | 'ponytail' | 'cortex' | 'bear' | 'horn' | 'alien';
}

export const KART_CHARACTERS: KartCharacterSpec[] = [
  {
    id: 'crash',
    name: 'Classic Kart',
    carLabel: 'Klasik Seimbang',
    emoji: '🏁',
    carStyle: 'sport',
    skin: '#f97316',
    outfit: '#2563eb',
    accent: '#fde047',
    earType: 'bandicoot',
  },
  {
    id: 'coco',
    name: 'Turbo Sport',
    carLabel: 'Sport Ringan',
    emoji: '⚡',
    carStyle: 'sport',
    skin: '#fb923c',
    outfit: '#ec4899',
    accent: '#fef08a',
    earType: 'ponytail',
  },
  {
    id: 'formula',
    name: 'Formula F1',
    carLabel: 'Aerodinamis',
    emoji: '🏎️',
    carStyle: 'formula',
    skin: '#e2e8f0',
    outfit: '#ef4444',
    accent: '#facc15',
    earType: 'cortex',
  },
  {
    id: 'tiny',
    name: 'Monster Truck',
    carLabel: 'Bodi Besar',
    emoji: '🛻',
    carStyle: 'monster',
    skin: '#b45309',
    outfit: '#dc2626',
    accent: '#fde047',
    earType: 'horn',
  },
  {
    id: 'polar',
    name: 'Dune Buggy',
    carLabel: 'Off-Road',
    emoji: '🚙',
    carStyle: 'buggy',
    skin: '#f8fafc',
    outfit: '#0284c7',
    accent: '#38bdf8',
    earType: 'bear',
  },
  {
    id: 'oxide',
    name: 'Hover Craft',
    carLabel: 'Futuristik',
    emoji: '🛸',
    carStyle: 'hover',
    skin: '#22c55e',
    outfit: '#9333ea',
    accent: '#38bdf8',
    earType: 'alien',
  },
  {
    id: 'cortex',
    name: 'Cyber Hover',
    carLabel: 'Neon Plasma',
    emoji: '🚀',
    carStyle: 'hover',
    skin: '#facc15',
    outfit: '#f8fafc',
    accent: '#0f172a',
    earType: 'cortex',
  },
  {
    id: 'dingo',
    name: 'Battle Tank',
    carLabel: 'Lapis Baja',
    emoji: '🛡️',
    carStyle: 'tank',
    skin: '#65a30d',
    outfit: '#7c2d12',
    accent: '#facc15',
    earType: 'horn',
  },
];

export function getKartCharacter(characterId?: string, slot = 0): KartCharacterSpec {
  if (characterId) {
    const found = KART_CHARACTERS.find((c) => c.id === characterId);
    if (found) return found;
  }
  return KART_CHARACTERS[Math.abs(slot) % KART_CHARACTERS.length];
}

export function renderCarPreviewSvg(carStyle: CarStyle, bodyColor: string, accentColor: string): string {
  const wheels = (r = 9, cx1 = 26, cx2 = 74, cy = 44) => `
    <circle cx="${cx1}" cy="${cy}" r="${r}" fill="#111827" stroke="#94a3b8" stroke-width="2"/>
    <circle cx="${cx1}" cy="${cy}" r="${Math.max(3, r - 5)}" fill="#e2e8f0"/>
    <circle cx="${cx2}" cy="${cy}" r="${r}" fill="#111827" stroke="#94a3b8" stroke-width="2"/>
    <circle cx="${cx2}" cy="${cy}" r="${Math.max(3, r - 5)}" fill="#e2e8f0"/>
  `;

  let body = '';
  if (carStyle === 'formula') {
    body = `
      <polygon points="10,20 22,20 26,32 14,32" fill="${bodyColor}" stroke="#fff" stroke-width="1"/>
      <rect x="6" y="18" width="14" height="4" rx="2" fill="${accentColor}"/>
      <path d="M18 34 L36 30 L56 26 L88 36 L88 42 L18 42 Z" fill="${bodyColor}"/>
      <rect x="78" y="37" width="16" height="4" rx="2" fill="${accentColor}"/>
      <ellipse cx="46" cy="27" rx="8" ry="5" fill="#0f172a"/>
      ${wheels(9, 25, 73, 43)}
    `;
  } else if (carStyle === 'monster') {
    body = `
      <path d="M16 26 L30 26 L36 14 L64 14 L72 24 L86 26 L86 36 L16 36 Z" fill="${bodyColor}"/>
      <rect x="40" y="17" width="20" height="8" rx="2" fill="#0f172a"/>
      <rect x="83" y="28" width="6" height="9" rx="2" fill="#e2e8f0"/>
      ${wheels(12, 27, 73, 42)}
    `;
  } else if (carStyle === 'buggy') {
    body = `
      <path d="M16 35 L32 28 L66 28 L86 35 L82 41 L16 41 Z" fill="${bodyColor}"/>
      <path d="M26 30 L42 15 L62 15 L70 29" fill="none" stroke="${accentColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${wheels(10, 26, 74, 43)}
    `;
  } else if (carStyle === 'hover') {
    body = `
      <ellipse cx="50" cy="44" rx="34" ry="4" fill="${accentColor}" opacity="0.55"/>
      <path d="M14 34 Q30 20 58 22 L88 32 Q90 38 78 39 L20 39 Q12 38 14 34 Z" fill="${bodyColor}"/>
      <ellipse cx="48" cy="24" rx="12" ry="5" fill="#0f172a" stroke="${accentColor}" stroke-width="1.5"/>
      <rect x="10" y="30" width="8" height="6" rx="2" fill="${accentColor}"/>
    `;
  } else if (carStyle === 'tank') {
    body = `
      <path d="M14 26 L70 26 L86 34 L82 39 L14 39 Z" fill="${bodyColor}"/>
      <polygon points="74,30 92,37 82,41 72,38" fill="#334155"/>
      <rect x="26" y="18" width="28" height="9" rx="3" fill="#1e293b" stroke="${accentColor}" stroke-width="1.5"/>
      <rect x="14" y="38" width="70" height="12" rx="6" fill="#0f172a" stroke="#64748b" stroke-width="2"/>
      <circle cx="24" cy="44" r="3.5" fill="#94a3b8"/>
      <circle cx="41" cy="44" r="3.5" fill="#94a3b8"/>
      <circle cx="58" cy="44" r="3.5" fill="#94a3b8"/>
      <circle cx="74" cy="44" r="3.5" fill="#94a3b8"/>
    `;
  } else {
    // Classic Sport Kart
    body = `
      <polygon points="10,18 22,18 24,30 14,30" fill="${bodyColor}"/>
      <rect x="8" y="16" width="16" height="4" rx="2" fill="${accentColor}"/>
      <path d="M18 32 L64 30 L84 35 L84 41 L18 41 Z" fill="${bodyColor}"/>
      <rect x="82" y="35" width="7" height="5" rx="2" fill="#e2e8f0"/>
      <circle cx="44" cy="24" r="7" fill="${accentColor}"/>
      ${wheels(9, 26, 74, 43)}
    `;
  }

  return `<svg class="car-preview-svg" viewBox="0 0 100 56" aria-hidden="true">${body}</svg>`;
}
