import {
  CharacterOption,
  CharacterPickerContext,
  GameCharacterView,
  mountStandardCharacterPicker,
} from '../../controller/GameCharacterView';
import { SNAKE_CHARACTERS } from '../../sdk/SnakeColors';

const ITEMS: CharacterOption[] = SNAKE_CHARACTERS.map((sn) => ({
  id: sn.id,
  name: sn.name,
  subtitle: 'Neon Serpent',
  color: sn.color,
}));

export class SerpentCharacterView implements GameCharacterView {
  readonly id = 'neon-serpent';
  private handle: { update: (ctx: CharacterPickerContext) => void; unmount: () => void } | null = null;

  getRoster(): ReadonlyArray<CharacterOption> {
    return ITEMS;
  }

  mount(container: HTMLElement, ctx: CharacterPickerContext): void {
    this.unmount();
    this.handle = mountStandardCharacterPicker(container, ctx, {
      selectedTitle: 'Warna Ular Terpilih',
      pickerTitle: 'Pilih Warna Ular (Tidak Boleh Sama)',
      emptyNoun: 'warna ular',
      items: ITEMS,
      renderCardVisual: (item) =>
        `<span style="width:28px;height:28px;border-radius:50%;background:${item.color};box-shadow:0 0 10px ${item.color};border:2px solid rgba(255,255,255,0.65);display:inline-block;"></span>`,
      renderPreviewVisual: (item) =>
        `<span style="width:36px;height:36px;border-radius:50%;background:${item.color};box-shadow:0 0 16px ${item.color};border:2px solid rgba(255,255,255,0.75);display:inline-block;"></span>`,
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
