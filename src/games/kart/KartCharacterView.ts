import {
  CharacterOption,
  CharacterPickerContext,
  GameCharacterView,
  mountStandardCharacterPicker,
} from '../../controller/GameCharacterView';
import {
  KART_CHARACTERS,
  getKartCharacter,
  renderCarPreviewSvg,
  renderHeroPreviewSvg,
} from '../../sdk/KartCharacters';

const ITEMS: CharacterOption[] = KART_CHARACTERS.map((ch) => ({
  id: ch.id,
  name: ch.name,
  subtitle: ch.carLabel,
  color: ch.outfit === '#0f172a' ? '#334155' : ch.outfit,
}));

export class KartCharacterView implements GameCharacterView {
  readonly id = 'nitro-kart-3d';
  private handle: { update: (ctx: CharacterPickerContext) => void; unmount: () => void } | null = null;

  getRoster(): ReadonlyArray<CharacterOption> {
    return ITEMS;
  }

  mount(container: HTMLElement, ctx: CharacterPickerContext): void {
    this.unmount();
    this.handle = mountStandardCharacterPicker(container, ctx, {
      selectedTitle: 'Karakter & Mobil Terpilih',
      pickerTitle: 'Pilih Karakter',
      emptyNoun: 'karakter',
      items: ITEMS,
      renderCardVisual: (item) => renderHeroPreviewSvg(getKartCharacter(item.id, 0).driverTheme),
      renderPreviewVisual: (item) => {
        const ch = getKartCharacter(item.id, 0);
        return `${renderHeroPreviewSvg(ch.driverTheme)}${renderCarPreviewSvg(
          ch.carStyle,
          item.color,
          ch.accent
        )}`;
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
