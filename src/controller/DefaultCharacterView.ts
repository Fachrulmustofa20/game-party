import { DEFAULT_COLOR_CHARACTERS, renderColorAvatarSvg } from '../sdk/DefaultCharacters';
import {
  CharacterOption,
  CharacterPickerContext,
  GameCharacterView,
  mountStandardCharacterPicker,
} from './GameCharacterView';

const ITEMS: CharacterOption[] = DEFAULT_COLOR_CHARACTERS.map((c) => ({
  id: c.id,
  name: c.name,
  subtitle: 'Karakter Berwarna',
  color: c.color,
}));

/**
 * Default colored character selector used by any game without a custom character view.
 */
export class DefaultCharacterView implements GameCharacterView {
  readonly id = 'default';
  private handle: { update: (ctx: CharacterPickerContext) => void; unmount: () => void } | null = null;

  getRoster(): ReadonlyArray<CharacterOption> {
    return ITEMS;
  }

  mount(container: HTMLElement, ctx: CharacterPickerContext): void {
    this.unmount();
    this.handle = mountStandardCharacterPicker(container, ctx, {
      selectedTitle: 'Warna Karakter Terpilih',
      pickerTitle: 'Pilih Warna Karakter',
      emptyNoun: 'warna karakter',
      items: ITEMS,
      renderCardVisual: (item) => renderColorAvatarSvg(item.color, item.name),
      renderPreviewVisual: (item) => renderColorAvatarSvg(item.color, item.name),
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

