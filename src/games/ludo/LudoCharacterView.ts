import {
  CharacterOption,
  CharacterPickerContext,
  GameCharacterView,
  mountStandardCharacterPicker,
} from '../../controller/GameCharacterView';
import { LUDO_COLORS, LUDO_COLOR_NAMES } from './LudoBoard';

function renderLudoPawnSvg(color: string, size: number): string {
  return `
    <svg viewBox="0 0 64 64" width="${size}" height="${size}" style="display:block;" aria-hidden="true">
      <ellipse cx="32" cy="56" rx="17" ry="4.5" fill="rgba(2,6,23,0.45)"/>
      <ellipse cx="32" cy="50.5" rx="15" ry="5.5" fill="${color}" stroke="rgba(255,255,255,0.7)" stroke-width="1.8"/>
      <path d="M20 49.5 L27 25 Q32 27 37 25 L44 49.5 Q32 53.5 20 49.5 Z" fill="${color}" stroke="rgba(255,255,255,0.7)" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M23.5 48.5 L28.2 26.5 L31.2 27 L28.5 49 Z" fill="rgba(255,255,255,0.28)"/>
      <circle cx="32" cy="17.5" r="9.5" fill="${color}" stroke="rgba(255,255,255,0.8)" stroke-width="1.8"/>
      <circle cx="28.6" cy="14.2" r="3.1" fill="rgba(255,255,255,0.55)"/>
    </svg>
  `;
}

const ITEMS: CharacterOption[] = LUDO_COLORS.map((color, idx) => ({
  id: `ludo-${idx}`,
  name: `Tim ${LUDO_COLOR_NAMES[idx]}`,
  subtitle: '4 Bidak Ludo',
  color,
}));

export class LudoCharacterView implements GameCharacterView {
  readonly id = 'ludo-3d';
  private handle: { update: (ctx: CharacterPickerContext) => void; unmount: () => void } | null = null;

  getRoster(): ReadonlyArray<CharacterOption> {
    return ITEMS;
  }

  mount(container: HTMLElement, ctx: CharacterPickerContext): void {
    this.unmount();
    this.handle = mountStandardCharacterPicker(container, ctx, {
      selectedTitle: 'Warna Tim Ludo Terpilih',
      pickerTitle: 'Pilih Warna Tim Ludo',
      emptyNoun: 'warna tim',
      items: ITEMS,
      renderCardVisual: (item) => renderLudoPawnSvg(item.color, 46),
      renderPreviewVisual: (item) => renderLudoPawnSvg(item.color, 52),
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
