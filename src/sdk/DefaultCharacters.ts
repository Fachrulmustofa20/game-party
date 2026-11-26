export interface DefaultColorCharacter {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_COLOR_CHARACTERS: DefaultColorCharacter[] = [
  { id: 'color-red', name: 'Merah', color: '#ef4444' },
  { id: 'color-blue', name: 'Biru', color: '#3b82f6' },
  { id: 'color-green', name: 'Hijau', color: '#22c55e' },
  { id: 'color-yellow', name: 'Kuning', color: '#eab308' },
  { id: 'color-purple', name: 'Ungu', color: '#a855f7' },
  { id: 'color-orange', name: 'Oranye', color: '#f97316' },
  { id: 'color-teal', name: 'Tosca', color: '#14b8a6' },
  { id: 'color-pink', name: 'Pink', color: '#ec4899' },
  { id: 'color-indigo', name: 'Indigo', color: '#6366f1' },
  { id: 'color-silver', name: 'Putih Perak', color: '#e2e8f0' },
];

export function renderColorAvatarSvg(color: string, label: string): string {
  const initial = (label.trim()[0] || 'P').toUpperCase();
  return `
    <svg viewBox="0 0 48 48" width="38" height="38" style="display:block;" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="${color}" stroke="rgba(255,255,255,0.7)" stroke-width="2.5"/>
      <text x="24" y="29" text-anchor="middle" fill="#080c17" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="16">${initial}</text>
    </svg>
  `;
}

