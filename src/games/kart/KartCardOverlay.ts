import { PlatformGame, TrackMapId } from '../../sdk/GameSDK';

interface KartMapOption {
  id: TrackMapId;
  label: string;
  diff: string;
  diffColor: string;
  img: string;
}

const KART_MAPS: readonly KartMapOption[] = [
  { id: 'crash-cove', label: 'Pantai Tropis', diff: 'Mudah', diffColor: '#22c55e', img: '/images/map-crash-cove.png' },
  { id: 'neon-canyon', label: 'Neon Canyon', diff: 'Sedang', diffColor: '#facc15', img: '/images/map-neon-canyon.png' },
  { id: 'ice-peak', label: 'Polar Peak', diff: 'Sulit', diffColor: '#ef4444', img: '/images/map-ice-peak.png' },
];

const LAP_OPTIONS = [1, 3, 5] as const;

export function mountKartCardOverlay(
  container: HTMLElement,
  game: PlatformGame,
  onCreateRoom: () => void
): void {
  const currentLaps = game.maxLaps ?? 3;
  const currentMap = game.selectedMap ?? 'crash-cove';

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="brand-badge" style="background:${game.accentColor};">${game.title}</span>
      <span style="font-size:11px;font-weight:800;color:var(--warn);">PILIH LAP &amp; MAP</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;" class="lap-selector">
      <span style="font-size:12px;color:var(--muted);font-weight:700;">Jumlah Lap:</span>
      <div style="display:flex;gap:6px;">
        ${LAP_OPTIONS.map(
          (laps) => `
          <button type="button" data-laps="${laps}" class="btn ${
            currentLaps === laps ? 'btn-primary' : 'btn-secondary'
          }" style="padding:5px 11px;font-size:12px;">${laps} Lap</button>
        `
        ).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:var(--muted);font-weight:700;">Pilih Map:</span>
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn btn-secondary map-slide-left" style="padding:2px 8px;font-size:12px;">&lsaquo;</button>
          <button type="button" class="btn btn-secondary map-slide-right" style="padding:2px 8px;font-size:12px;">&rsaquo;</button>
        </div>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px;scrollbar-width:thin;" class="map-selector">
        ${KART_MAPS.map(
          (m) => `
          <button type="button" data-map="${m.id}" style="flex:0 0 146px;scroll-snap-align:start;padding:0;border-radius:10px;overflow:hidden;border:2px solid ${
            currentMap === m.id ? 'var(--accent)' : 'rgba(255,255,255,0.12)'
          };background:#0b1222;color:var(--text);cursor:pointer;text-align:left;transition:transform 0.12s ease,border-color 0.12s ease;">
            <img src="${m.img}" alt="${m.label}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;" />
            <div style="padding:6px 8px;display:flex;flex-direction:column;gap:2px;">
              <span style="font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.label}</span>
              <span style="font-size:10px;font-weight:800;color:${m.diffColor};">${m.diff}</span>
            </div>
          </button>`
        ).join('')}
      </div>
    </div>
    <button type="button" class="btn btn-primary btn-play" style="margin-top:2px;">Buat Room</button>
  `;

  container.querySelectorAll<HTMLButtonElement>('[data-laps]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const laps = Number(btn.dataset.laps || 3);
      game.maxLaps = laps;
      container.querySelectorAll<HTMLButtonElement>('[data-laps]').forEach((b) => {
        b.className = `btn ${Number(b.dataset.laps) === laps ? 'btn-primary' : 'btn-secondary'}`;
      });
    });
  });

  const mapSlider = container.querySelector('.map-selector') as HTMLElement | null;
  container.querySelector('.map-slide-left')?.addEventListener('click', (e) => {
    e.stopPropagation();
    mapSlider?.scrollBy({ left: -160, behavior: 'smooth' });
  });
  container.querySelector('.map-slide-right')?.addEventListener('click', (e) => {
    e.stopPropagation();
    mapSlider?.scrollBy({ left: 160, behavior: 'smooth' });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mapId = (btn.dataset.map || 'crash-cove') as TrackMapId;
      game.selectedMap = mapId;
      container.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((b) => {
        b.style.borderColor =
          b.dataset.map === mapId ? 'var(--accent)' : 'rgba(255,255,255,0.12)';
      });
    });
  });

  container.querySelector('.btn-play')?.addEventListener('click', (e) => {
    e.stopPropagation();
    onCreateRoom();
  });
}
