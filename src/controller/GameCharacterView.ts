export interface CharacterOption {
  id: string;
  name: string;
  subtitle?: string;
  color: string;
}

export interface CharacterPickerContext {
  roomCode: string;
  selectedCharacterId: string;
  takenCharacters: ReadonlySet<string>;
  isLocked: boolean;
  onSelect: (characterId: string, color: string) => void;
}

/**
 * Interface for per-game character selection UI on the mobile controller
 * (mirrors GameControllerView for custom controllers).
 */
export interface GameCharacterView {
  readonly id: string;
  getRoster(): ReadonlyArray<CharacterOption>;
  mount(container: HTMLElement, ctx: CharacterPickerContext): void;
  update(ctx: CharacterPickerContext): void;
  unmount(): void;
}

/**
 * Shared helper for standard grid + preview character pickers.
 */
export function mountStandardCharacterPicker(
  container: HTMLElement,
  ctx: CharacterPickerContext,
  options: {
    selectedTitle: string;
    pickerTitle: string;
    emptyNoun: string;
    items: ReadonlyArray<CharacterOption>;
    renderCardVisual: (item: CharacterOption) => string;
    renderPreviewVisual: (item: CharacterOption) => string;
  }
): { update: (nextCtx: CharacterPickerContext) => void; unmount: () => void } {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="font-size:12px;color:var(--muted);">${options.selectedTitle}</label>
      <div class="selected-char-preview" data-role="preview"></div>
      <label style="font-size:12px;color:var(--muted);">${options.pickerTitle}</label>
      <div class="character-picker-grid" data-role="grid"></div>
    </div>
  `;

  const previewEl = container.querySelector('[data-role="preview"]') as HTMLElement | null;
  const gridEl = container.querySelector('[data-role="grid"]') as HTMLElement | null;

  const render = (cur: CharacterPickerContext) => {
    if (previewEl) {
      if (cur.takenCharacters.has(cur.selectedCharacterId)) {
        previewEl.style.borderColor = '#ef4444';
        previewEl.innerHTML = `
          <div style="width:100%;text-align:center;font-size:12px;font-weight:800;color:#fca5a5;">
            Semua ${options.emptyNoun} sedang dipakai oleh Pemain / AI di room ${cur.roomCode}!
          </div>
        `;
      } else {
        const selected =
          options.items.find((c) => c.id === cur.selectedCharacterId) ?? options.items[0];
        previewEl.style.borderColor = selected.color;
        previewEl.innerHTML = `
          <div class="selected-char-visuals">
            ${options.renderPreviewVisual(selected)}
          </div>
          <div class="selected-char-info">
            <div class="selected-char-name">${selected.name}</div>
            ${selected.subtitle ? `<div class="selected-char-car">${selected.subtitle}</div>` : ''}
          </div>
        `;
      }
    }

    if (gridEl) {
      gridEl.innerHTML = '';
      for (const item of options.items) {
        const isMine = item.id === cur.selectedCharacterId;
        const isTaken = !isMine && cur.takenCharacters.has(item.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.disabled = isTaken || cur.isLocked;
        card.setAttribute('aria-disabled', String(isTaken || cur.isLocked));
        card.className = `character-card ${isMine ? 'selected' : ''} ${isTaken ? 'taken' : ''}`;
        card.innerHTML = `
          ${options.renderCardVisual(item)}
          <span class="character-name">${item.name}</span>
          ${
            item.subtitle
              ? `<span class="character-car">${isTaken ? 'SUDAH DIPAKAI' : item.subtitle}</span>`
              : ''
          }
          ${isTaken ? '<span class="character-taken-badge">DIPAKAI</span>' : ''}
        `;
        card.addEventListener('click', () => {
          if (cur.isLocked || isTaken) return;
          cur.onSelect(item.id, item.color);
        });
        gridEl.appendChild(card);
      }
    }
  };

  render(ctx);

  return {
    update: render,
    unmount: () => {
      container.innerHTML = '';
    },
  };
}

