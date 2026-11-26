export interface SnakeCharacterSpec {
  id: string;
  name: string;
  color: string;
}

export const SNAKE_CHARACTERS: SnakeCharacterSpec[] = [
  { id: 'snake-teal', name: 'Tosca', color: '#14b8a6' },
  { id: 'snake-indigo', name: 'Indigo', color: '#6366f1' },
  { id: 'snake-lime', name: 'Lime Neon', color: '#a3e635' },
  { id: 'snake-gold', name: 'Emas', color: '#eab308' },
  { id: 'snake-purple', name: 'Ungu Neon', color: '#c084fc' },
  { id: 'snake-brown', name: 'Cokelat', color: '#b45309' },
  { id: 'snake-green', name: 'Hijau Neon', color: '#4ade80' },
  { id: 'snake-blue', name: 'Biru Neon', color: '#38bdf8' },
  { id: 'snake-red', name: 'Merah Neon', color: '#f87171' },
  { id: 'snake-silver', name: 'Putih Perak', color: '#e2e8f0' },
];

export function getSnakeCharacter(characterId?: string, slot = 0): SnakeCharacterSpec {
  if (characterId) {
    const found = SNAKE_CHARACTERS.find((c) => c.id === characterId);
    if (found) return found;
  }
  return SNAKE_CHARACTERS[Math.abs(slot) % SNAKE_CHARACTERS.length];
}
