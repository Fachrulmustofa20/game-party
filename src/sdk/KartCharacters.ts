export type CarStyle = 'sport' | 'formula' | 'monster' | 'buggy' | 'hover' | 'tank';
export type DriverTheme =
  | 'batman'
  | 'spiderman'
  | 'ironman'
  | 'captain'
  | 'thor'
  | 'hulk'
  | 'flash'
  | 'panther'
  | 'superman'
  | 'deadpool';

export interface KartCharacterSpec {
  id: string;
  name: string;
  carLabel: string;
  emoji: string;
  carStyle: CarStyle;
  driverTheme: DriverTheme;
  skin: string;
  outfit: string;
  accent: string;
  earType: 'bandicoot' | 'ponytail' | 'cortex' | 'bear' | 'horn' | 'alien';
}

export const KART_CHARACTERS: KartCharacterSpec[] = [
  {
    id: 'batman',
    name: 'Batman',
    carLabel: 'Bat-Stealth F1',
    emoji: '🦇',
    carStyle: 'formula',
    driverTheme: 'batman',
    skin: '#1e293b',
    outfit: '#0f172a',
    accent: '#facc15',
    earType: 'horn',
  },
  {
    id: 'spiderman',
    name: 'Spiderman',
    carLabel: 'Web Sport',
    emoji: '🕷️',
    carStyle: 'sport',
    driverTheme: 'spiderman',
    skin: '#dc2626',
    outfit: '#1d4ed8',
    accent: '#f8fafc',
    earType: 'cortex',
  },
  {
    id: 'ironman',
    name: 'Iron Man',
    carLabel: 'Mark Stark F1',
    emoji: '🤖',
    carStyle: 'formula',
    driverTheme: 'ironman',
    skin: '#b91c1c',
    outfit: '#dc2626',
    accent: '#facc15',
    earType: 'cortex',
  },
  {
    id: 'captain',
    name: 'Capt. America',
    carLabel: 'Shield Tank',
    emoji: '🛡️',
    carStyle: 'tank',
    driverTheme: 'captain',
    skin: '#1d4ed8',
    outfit: '#1e3a8a',
    accent: '#ef4444',
    earType: 'cortex',
  },
  {
    id: 'thor',
    name: 'Thor',
    carLabel: 'Thunder Truck',
    emoji: '🔨',
    carStyle: 'monster',
    driverTheme: 'thor',
    skin: '#fed7aa',
    outfit: '#1e293b',
    accent: '#38bdf8',
    earType: 'horn',
  },
  {
    id: 'hulk',
    name: 'Hulk',
    carLabel: 'Gamma Monster',
    emoji: '💪',
    carStyle: 'monster',
    driverTheme: 'hulk',
    skin: '#16a34a',
    outfit: '#7e22ce',
    accent: '#4ade80',
    earType: 'cortex',
  },
  {
    id: 'flash',
    name: 'The Flash',
    carLabel: 'Speedster Sport',
    emoji: '⚡',
    carStyle: 'sport',
    driverTheme: 'flash',
    skin: '#dc2626',
    outfit: '#b91c1c',
    accent: '#facc15',
    earType: 'horn',
  },
  {
    id: 'panther',
    name: 'Black Panther',
    carLabel: 'Wakanda Hover',
    emoji: '🐾',
    carStyle: 'hover',
    driverTheme: 'panther',
    skin: '#090d16',
    outfit: '#111827',
    accent: '#a855f7',
    earType: 'horn',
  },
  {
    id: 'superman',
    name: 'Superman',
    carLabel: 'Krypton Sport',
    emoji: '🦸',
    carStyle: 'sport',
    driverTheme: 'superman',
    skin: '#fed7aa',
    outfit: '#2563eb',
    accent: '#ef4444',
    earType: 'cortex',
  },
  {
    id: 'deadpool',
    name: 'Deadpool',
    carLabel: 'Merc Buggy',
    emoji: '⚔️',
    carStyle: 'buggy',
    driverTheme: 'deadpool',
    skin: '#dc2626',
    outfit: '#b91c1c',
    accent: '#0f172a',
    earType: 'cortex',
  },
];

export function getKartCharacter(characterId?: string, slot = 0): KartCharacterSpec {
  if (characterId) {
    const found = KART_CHARACTERS.find((c) => c.id === characterId);
    if (found) return found;
  }
  return KART_CHARACTERS[Math.abs(slot) % KART_CHARACTERS.length];
}

export function renderHeroPreviewSvg(theme: DriverTheme): string {
  let inner = '';
  if (theme === 'batman') {
    inner = `
      <polygon points="14,22 18,4 28,16" fill="#0f172a"/>
      <polygon points="46,22 42,4 32,16" fill="#0f172a"/>
      <circle cx="30" cy="32" r="18" fill="#0f172a" stroke="#facc15" stroke-width="2"/>
      <path d="M21 39 Q30 47 39 39 L37 47 Q30 51 23 47 Z" fill="#fed7aa"/>
      <polygon points="18,28 27,31 21,33" fill="#f8fafc"/>
      <polygon points="42,28 33,31 39,33" fill="#f8fafc"/>
    `;
  } else if (theme === 'spiderman') {
    inner = `
      <circle cx="30" cy="31" r="18" fill="#dc2626" stroke="#0f172a" stroke-width="2"/>
      <path d="M30 13 L30 49 M12 31 L48 31 M17 18 L43 44 M43 18 L17 44" stroke="#0f172a" stroke-width="1.3" opacity="0.6"/>
      <path d="M17 26 Q24 25 27 33 Q20 35 17 26 Z" fill="#ffffff" stroke="#0f172a" stroke-width="1.8"/>
      <path d="M43 26 Q36 25 33 33 Q40 35 43 26 Z" fill="#ffffff" stroke="#0f172a" stroke-width="1.8"/>
    `;
  } else if (theme === 'ironman') {
    inner = `
      <circle cx="30" cy="31" r="18" fill="#b91c1c" stroke="#facc15" stroke-width="2"/>
      <rect x="20" y="19" width="20" height="24" rx="7" fill="#facc15"/>
      <rect x="21" y="27" width="7" height="3.5" rx="1.5" fill="#38bdf8"/>
      <rect x="32" y="27" width="7" height="3.5" rx="1.5" fill="#38bdf8"/>
      <rect x="25" y="38" width="10" height="2.5" rx="1" fill="#7f1d1d"/>
    `;
  } else if (theme === 'captain') {
    inner = `
      <polygon points="10,27 15,21 15,31" fill="#f8fafc"/>
      <polygon points="50,27 45,21 45,31" fill="#f8fafc"/>
      <circle cx="30" cy="31" r="18" fill="#1d4ed8" stroke="#f8fafc" stroke-width="2"/>
      <path d="M20 38 Q30 47 40 38 L38 47 Q30 51 22 47 Z" fill="#fed7aa"/>
      <text x="30" y="24" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-weight="900" font-size="11">A</text>
      <circle cx="24" cy="31" r="2.6" fill="#ffffff"/><circle cx="36" cy="31" r="2.6" fill="#ffffff"/>
      <circle cx="24" cy="31" r="1.4" fill="#0f172a"/><circle cx="36" cy="31" r="1.4" fill="#0f172a"/>
    `;
  } else if (theme === 'thor') {
    inner = `
      <polygon points="8,24 16,10 18,27" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
      <polygon points="52,24 44,10 42,27" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
      <circle cx="30" cy="32" r="17" fill="#fed7aa"/>
      <path d="M12 30 Q30 10 48 30 Z" fill="#94a3b8" stroke="#e2e8f0" stroke-width="1.5"/>
      <circle cx="24" cy="33" r="2.5" fill="#0f172a"/><circle cx="36" cy="33" r="2.5" fill="#0f172a"/>
      <path d="M22 42 Q30 48 38 42" fill="none" stroke="#eab308" stroke-width="4" stroke-linecap="round"/>
    `;
  } else if (theme === 'hulk') {
    inner = `
      <circle cx="30" cy="32" r="18" fill="#16a34a" stroke="#14532d" stroke-width="2"/>
      <path d="M13 26 Q22 10 30 15 Q38 10 47 26 Q38 20 30 22 Q22 20 13 26 Z" fill="#0f172a"/>
      <line x1="20" y1="27" x2="27" y2="30" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="40" y1="27" x2="33" y2="30" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="24" cy="32" r="2.3" fill="#0f172a"/><circle cx="36" cy="32" r="2.3" fill="#0f172a"/>
      <rect x="23" y="40" width="14" height="4" rx="2" fill="#ffffff" stroke="#0f172a" stroke-width="1.2"/>
    `;
  } else if (theme === 'flash') {
    inner = `
      <polygon points="9,22 16,28 11,33" fill="#facc15"/>
      <polygon points="51,22 44,28 49,33" fill="#facc15"/>
      <circle cx="30" cy="31" r="18" fill="#dc2626" stroke="#facc15" stroke-width="2"/>
      <path d="M21 38 Q30 47 39 38 L37 46 Q30 50 23 46 Z" fill="#fed7aa"/>
      <circle cx="24" cy="30" r="2.6" fill="#ffffff"/><circle cx="36" cy="30" r="2.6" fill="#ffffff"/>
      <circle cx="24" cy="30" r="1.4" fill="#0f172a"/><circle cx="36" cy="30" r="1.4" fill="#0f172a"/>
    `;
  } else if (theme === 'superman') {
    inner = `
      <circle cx="30" cy="32" r="17" fill="#fed7aa"/>
      <path d="M13 28 Q20 11 32 14 Q44 12 47 28 Q37 19 29 22 Q22 19 13 28 Z" fill="#0f172a"/>
      <path d="M29 20 Q25 27 30 29" fill="none" stroke="#0f172a" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="24" cy="33" r="2.5" fill="#0f172a"/><circle cx="36" cy="33" r="2.5" fill="#0f172a"/>
      <path d="M25 41 Q30 44 35 41" fill="none" stroke="#b91c1c" stroke-width="2" stroke-linecap="round"/>
    `;
  } else if (theme === 'deadpool') {
    inner = `
      <circle cx="30" cy="31" r="18" fill="#dc2626" stroke="#0f172a" stroke-width="2"/>
      <ellipse cx="22" cy="30" rx="6" ry="8" transform="rotate(-14 22 30)" fill="#0f172a"/>
      <ellipse cx="38" cy="30" rx="6" ry="8" transform="rotate(14 38 30)" fill="#0f172a"/>
      <ellipse cx="22" cy="30" rx="3.4" ry="2.2" transform="rotate(-14 22 30)" fill="#ffffff"/>
      <ellipse cx="38" cy="30" rx="3.4" ry="2.2" transform="rotate(14 38 30)" fill="#ffffff"/>
    `;
  } else {
    // Black Panther
    inner = `
      <polygon points="15,22 19,7 27,17" fill="#090d16" stroke="#a855f7" stroke-width="1.2"/>
      <polygon points="45,22 41,7 33,17" fill="#090d16" stroke="#a855f7" stroke-width="1.2"/>
      <circle cx="30" cy="32" r="18" fill="#090d16" stroke="#a855f7" stroke-width="2"/>
      <polygon points="18,29 27,32 21,34" fill="#c084fc"/>
      <polygon points="42,29 33,32 39,34" fill="#c084fc"/>
      <path d="M22 42 L30 39 L38 42" fill="none" stroke="#94a3b8" stroke-width="1.6"/>
    `;
  }
  return `<svg class="hero-preview-svg" viewBox="0 0 60 56" aria-hidden="true">${inner}</svg>`;
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
