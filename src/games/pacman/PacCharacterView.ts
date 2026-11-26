import {
  CharacterOption,
  CharacterPickerContext,
  GameCharacterView,
  mountStandardCharacterPicker,
} from '../../controller/GameCharacterView';

interface PacCharSpec extends CharacterOption {
  kind: 'pac' | 'ghost';
}

const PAC_CHARACTERS: PacCharSpec[] = [
  { id: 'pac-gold', name: 'Pac-Gold', subtitle: 'Pac-Man Klasik', color: '#facc15', kind: 'pac' },
  { id: 'pac-cyan', name: 'Pac-Cyan', subtitle: 'Pac-Man Neon', color: '#22d3ee', kind: 'pac' },
  { id: 'pac-lime', name: 'Pac-Lime', subtitle: 'Pac-Man Kilat', color: '#a3e635', kind: 'pac' },
  { id: 'pac-coral', name: 'Pac-Coral', subtitle: 'Pac-Man Api', color: '#fb923c', kind: 'pac' },
  { id: 'ghost-blinky', name: 'Blinky', subtitle: 'Ghost Merah', color: '#ef4444', kind: 'ghost' },
  { id: 'ghost-pinky', name: 'Pinky', subtitle: 'Ghost Pink', color: '#f472b6', kind: 'ghost' },
  { id: 'ghost-inky', name: 'Inky', subtitle: 'Ghost Biru', color: '#38bdf8', kind: 'ghost' },
  { id: 'ghost-sue', name: 'Sue', subtitle: 'Ghost Ungu', color: '#c084fc', kind: 'ghost' },
];

const BY_ID = new Map<string, PacCharSpec>(PAC_CHARACTERS.map((c) => [c.id, c]));

function renderPacSvg(spec: PacCharSpec, size = 38): string {
  if (spec.kind === 'pac') {
    return `
      <svg viewBox="0 0 48 48" width="${size}" height="${size}" style="display:block;" aria-hidden="true">
        <path d="M24 24 L42 12 A21 21 0 1 0 42 36 Z" fill="${spec.color}" stroke="#080c17" stroke-width="2"/>
        <circle cx="25" cy="13" r="3" fill="#080c17"/>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 48 48" width="${size}" height="${size}" style="display:block;" aria-hidden="true">
      <path d="M8 40 V22 A16 16 0 0 1 40 22 V40 L34 35 L29 40 L24 35 L19 40 L14 35 Z" fill="${spec.color}" stroke="#080c17" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="18" cy="21" r="4" fill="#ffffff"/>
      <circle cx="30" cy="21" r="4" fill="#ffffff"/>
      <circle cx="19.5" cy="21.5" r="2" fill="#0f172a"/>
      <circle cx="31.5" cy="21.5" r="2" fill="#0f172a"/>
    </svg>
  `;
}

export class PacCharacterView implements GameCharacterView {
  readonly id = 'pacman-ghost-hunt';
  private handle: { update: (ctx: CharacterPickerContext) => void; unmount: () => void } | null = null;

  getRoster(): ReadonlyArray<CharacterOption> {
    return PAC_CHARACTERS;
  }

  mount(container: HTMLElement, ctx: CharacterPickerContext): void {
    this.unmount();
    this.handle = mountStandardCharacterPicker(container, ctx, {
      selectedTitle: 'Karakter Pac-Man Terpilih',
      pickerTitle: 'Pilih Karakter Pac-Man / Ghost',
      emptyNoun: 'karakter',
      items: PAC_CHARACTERS,
      renderCardVisual: (item) => renderPacSvg(BY_ID.get(item.id) ?? PAC_CHARACTERS[0], 36),
      renderPreviewVisual: (item) => renderPacSvg(BY_ID.get(item.id) ?? PAC_CHARACTERS[0], 44),
    });
  }

  update(ctx: CharacterPickerContext): void {
    this.handle?.update(ctx);
  }

  unmount(): void {
    this.handle?.unmount();
    this.handle = null;
  }
}
