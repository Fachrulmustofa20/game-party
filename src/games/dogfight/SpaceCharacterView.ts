import {
  CharacterOption,
  CharacterPickerContext,
  GameCharacterView,
  mountStandardCharacterPicker,
} from '../../controller/GameCharacterView';
import {
  SPACE_CHARACTERS,
  getSpaceCharacter,
  renderShipPreviewSvg,
} from '../../sdk/SpaceCharacters';

const ITEMS: CharacterOption[] = SPACE_CHARACTERS.map((sh) => ({
  id: sh.id,
  name: sh.name,
  subtitle: sh.shipLabel,
  color: sh.color,
}));

export class SpaceCharacterView implements GameCharacterView {
  readonly id = 'space-dogfight-2p';
  private handle: { update: (ctx: CharacterPickerContext) => void; unmount: () => void } | null = null;

  getRoster(): ReadonlyArray<CharacterOption> {
    return ITEMS;
  }

  mount(container: HTMLElement, ctx: CharacterPickerContext): void {
    this.unmount();
    this.handle = mountStandardCharacterPicker(container, ctx, {
      selectedTitle: 'Pesawat Space Fighter Terpilih',
      pickerTitle: 'Pilih Pesawat Space Fighter',
      emptyNoun: 'pesawat',
      items: ITEMS,
      renderCardVisual: (item) => {
        const sh = getSpaceCharacter(item.id, 0);
        return renderShipPreviewSvg(sh.shipStyle, sh.color, sh.accent);
      },
      renderPreviewVisual: (item) => {
        const sh = getSpaceCharacter(item.id, 0);
        return renderShipPreviewSvg(sh.shipStyle, sh.color, sh.accent);
      },
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
