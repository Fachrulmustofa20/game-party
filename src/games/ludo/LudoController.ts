import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';
import {
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  bindHoldButton,
  updateTransportBadge,
} from '../../controller/GameControllerView';
import { decodeLudoTelemetry, diceFace } from './LudoBoard';
import { LUDO_CSS } from './LudoStyles';

export class LudoController implements GameControllerView {
  readonly id = 'ludo-3d';
  private root: HTMLElement | null = null;
  private wasMyTurn = false;
  private rollPulseUntil = 0;
  private pawnPulseUntil = 0;
  private chosenPawn = 0;

  private statusEl: HTMLElement | null = null;
  private pawnListEl: HTMLElement | null = null;
  private diceEl: HTMLElement | null = null;
  private turnEl: HTMLElement | null = null;
  private timerFillEl: HTMLElement | null = null;
  private rollBtnEl: HTMLButtonElement | null = null;
  private actionPanelEl: HTMLElement | null = null;
  private pawnGridEl: HTMLElement | null = null;
  private pawnBtns: HTMLButtonElement[] = [];

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.wasMyTurn = false;
    this.rollPulseUntil = 0;
    this.pawnPulseUntil = 0;

    container.innerHTML = `
      <style>${LUDO_CSS}</style>
      <div class="ctrl-gamepad ld3-ctrl">
        <div class="ld3-ctrl-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;">
            <span style="color:${ctx.color};">P${ctx.slot + 1}</span>
            <span id="ld3-ctrl-status" class="badge-ws">Connecting...</span>
          </div>
          <div style="font-size:11px;color:var(--muted);font-weight:800;">STATUS BIDAK</div>
          <div class="ld3-pawn-list" id="ld3-pawn-list"></div>
        </div>

        <div class="ld3-ctrl-panel">
          <div style="font-size:11px;color:var(--muted);font-weight:800;text-align:center;">DADU</div>
          <div id="ld3-ctrl-dice" style="font-size:62px;line-height:1;text-align:center;margin:auto 0;">🎲</div>
          <div id="ld3-ctrl-turn" style="text-align:center;font-size:14px;font-weight:900;">Menunggu giliran...</div>
          <div style="width:100%;height:7px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;">
            <div id="ld3-ctrl-timer" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#facc15);"></div>
          </div>
        </div>

        <div id="ld3-action-panel" class="ld3-ctrl-panel ld3-ctrl-panel-action">
          <button id="ld3-btn-roll" type="button" class="ld3-roll-btn" disabled>
            🎲 LEMPAR DADU
          </button>
          <div id="ld3-pawn-grid" class="ld3-pawn-grid" style="display:none;">
            <button type="button" data-pawn="0" class="ld3-pawn-btn">Bidak 1</button>
            <button type="button" data-pawn="1" class="ld3-pawn-btn">Bidak 2</button>
            <button type="button" data-pawn="2" class="ld3-pawn-btn">Bidak 3</button>
            <button type="button" data-pawn="3" class="ld3-pawn-btn">Bidak 4</button>
          </div>
        </div>
      </div>
    `;

    this.statusEl = container.querySelector('#ld3-ctrl-status');
    this.pawnListEl = container.querySelector('#ld3-pawn-list');
    this.diceEl = container.querySelector('#ld3-ctrl-dice');
    this.turnEl = container.querySelector('#ld3-ctrl-turn');
    this.timerFillEl = container.querySelector('#ld3-ctrl-timer');
    this.actionPanelEl = container.querySelector('#ld3-action-panel');
    this.rollBtnEl = container.querySelector('#ld3-btn-roll');
    this.pawnGridEl = container.querySelector('#ld3-pawn-grid');
    this.pawnBtns = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-pawn]'));

    bindHoldButton(
      this.rollBtnEl,
      (pressed) => {
        if (!pressed) return;
        this.rollPulseUntil = performance.now() + 220;
        navigator.vibrate?.(25);
      },
      ctx.onUnlockAudio
    );

    for (const btn of this.pawnBtns) {
      bindHoldButton(
        btn,
        (pressed) => {
          if (!pressed) return;
          this.chosenPawn = Number(btn.dataset.pawn || 0);
          this.pawnPulseUntil = performance.now() + 220;
          navigator.vibrate?.(20);
        },
        ctx.onUnlockAudio
      );
    }

    this.updateTransport(ctx.transportMode);
    ctx.onBindLandscapeGuard();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    const next = decodeLudoTelemetry(t);
    if (next.isMyTurn && !this.wasMyTurn) {
      navigator.vibrate?.([25, 45, 25]);
    }
    this.wasMyTurn = next.isMyTurn;

    if (this.diceEl) this.diceEl.textContent = next.lastRoll > 0 ? diceFace(next.lastRoll) : '🎲';
    if (this.timerFillEl) this.timerFillEl.style.width = `${next.timerPct}%`;

    if (this.pawnListEl) {
      this.pawnListEl.innerHTML = next.pawnProgress
        .map((prog, idx) => {
          const txt =
            prog < 0 ? 'Kandang' : prog >= 56 ? 'Finis 🏆' : `Langkah ${prog + 1}/57`;
          return `<div class="ld3-pawn-pill"><span>Bidak ${idx + 1}</span><span>${txt}</span></div>`;
        })
        .join('');
    }

    const choosingPawn = next.isMyTurn && next.phase === 'choose_pawn';
    const canRoll = next.isMyTurn && next.phase === 'roll';
    this.actionPanelEl?.classList.toggle('active', choosingPawn || canRoll);

    if (this.turnEl) {
      this.turnEl.textContent = !next.isMyTurn
        ? 'Menunggu Giliran...'
        : choosingPawn
        ? 'Pilih Bidak!'
        : 'GILIRANMU! Lempar Dadu';
      this.turnEl.style.color = next.isMyTurn ? '#fde047' : '#e2e8f0';
    }

    if (this.rollBtnEl && this.pawnGridEl) {
      if (choosingPawn) {
        this.rollBtnEl.style.display = 'none';
        this.pawnGridEl.style.display = 'grid';
        this.pawnBtns.forEach((btn, idx) => {
          btn.disabled = (next.playableMask & (1 << idx)) === 0;
        });
      } else {
        this.rollBtnEl.style.display = '';
        this.pawnGridEl.style.display = 'none';
        this.rollBtnEl.disabled = !canRoll;
      }
    }
  }

  getOutput(): ControllerOutput {
    const now = performance.now();
    return {
      steer: (this.chosenPawn / 3) * 2 - 1,
      gas: false,
      brake: false,
      drift: false,
      item: now < this.rollPulseUntil,
      boost: now < this.pawnPulseUntil,
    };
  }

  releaseAllInputs(): void {
    this.rollPulseUntil = 0;
    this.pawnPulseUntil = 0;
  }

  unmount(): void {
    this.releaseAllInputs();
    if (this.root) this.root.innerHTML = '';
    this.root = null;
  }
}
