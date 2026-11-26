import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';
import {
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  updateTransportBadge,
} from '../../controller/GameControllerView';
import { cardRankLabel, cardSuitSymbol, isRedSuit } from './PokerEngine';
import { POKER_CSS } from './PokerStyles';
import { PokerViewState, decodePokerTelemetry } from './PokerTelemetry';

export class PokerController implements GameControllerView {
  readonly id = 'texas-poker';
  private root: HTMLElement | null = null;
  private view: PokerViewState | null = null;
  private hideCards = false;
  private raiseAmount = 40;

  private callPulseUntil = 0;
  private raisePulseUntil = 0;
  private allinPulseUntil = 0;
  private foldPulseUntil = 0;

  private statusBadgeEl: HTMLElement | null = null;
  private cardsEl: HTMLElement | null = null;
  private handNameEl: HTMLElement | null = null;
  private chipsEl: HTMLElement | null = null;
  private potEl: HTMLElement | null = null;
  private callInfoEl: HTMLElement | null = null;
  private turnEl: HTMLElement | null = null;
  private timerFillEl: HTMLElement | null = null;
  private raiseLabelEl: HTMLElement | null = null;
  private raiseSliderEl: HTMLInputElement | null = null;
  private callBtnEl: HTMLButtonElement | null = null;
  private raiseBtnEl: HTMLButtonElement | null = null;
  private allinBtnEl: HTMLButtonElement | null = null;
  private foldBtnEl: HTMLButtonElement | null = null;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.view = null;
    this.hideCards = false;
    this.raiseAmount = 40;

    container.innerHTML = `
      <style>${POKER_CSS}</style>
      <div class="ctrl-gamepad pk-ctrl">
        <div class="pk-ctrl-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;">
            <span style="color:${ctx.color};">P${ctx.slot + 1}</span>
            <button id="pk-peek-btn" type="button" class="btn btn-secondary" style="padding:3px 9px;font-size:10px;">Tutup Kartu</button>
            <span id="pk-ctrl-status" class="badge-ws">Connecting...</span>
          </div>
          <div style="font-size:11px;color:var(--muted);text-align:center;">KARTU RAHASIAMU</div>
          <div class="pk-ctrl-cards" id="pk-ctrl-cards"></div>
          <div id="pk-ctrl-hand" style="text-align:center;font-size:12px;font-weight:900;color:#6ee7b7;">—</div>
          <div style="margin-top:auto;display:flex;justify-content:space-between;font-size:12px;font-weight:800;">
            <span>Chip Kamu:</span>
            <span id="pk-ctrl-chips" style="color:#fde047;">1000</span>
          </div>
        </div>

        <div class="pk-ctrl-panel">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:var(--muted);">
            <span>INFO MEJA</span>
            <span>POT: <strong id="pk-ctrl-pot" style="color:#fde047;">0</strong></span>
          </div>
          <div id="pk-ctrl-turn" style="text-align:center;font-size:15px;font-weight:900;margin-top:4px;">Menunggu...</div>
          <div id="pk-ctrl-call-info" style="text-align:center;font-size:12px;color:var(--muted);">—</div>
          <div style="width:100%;height:7px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;">
            <div id="pk-ctrl-timer" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#facc15);"></div>
          </div>

          <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;">
              <span>JUMLAH RAISE</span>
              <span id="pk-ctrl-raise-lbl" style="color:#fbbf24;">40</span>
            </div>
            <input id="pk-ctrl-slider" type="range" min="20" max="1000" step="10" value="40" style="width:100%;accent-color:#f59e0b;" />
          </div>
        </div>

        <div class="pk-ctrl-panel">
          <div style="font-size:11px;font-weight:800;color:var(--muted);">PILIH AKSI</div>
          <div class="pk-ctrl-actions">
            <button id="pk-btn-call" type="button" class="pk-action-btn call" disabled>CHECK</button>
            <button id="pk-btn-raise" type="button" class="pk-action-btn raise" disabled>RAISE</button>
            <button id="pk-btn-allin" type="button" class="pk-action-btn allin" disabled>ALL-IN</button>
            <button id="pk-btn-fold" type="button" class="pk-action-btn fold" disabled>FOLD</button>
          </div>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#pk-ctrl-status');
    this.cardsEl = container.querySelector('#pk-ctrl-cards');
    this.handNameEl = container.querySelector('#pk-ctrl-hand');
    this.chipsEl = container.querySelector('#pk-ctrl-chips');
    this.potEl = container.querySelector('#pk-ctrl-pot');
    this.callInfoEl = container.querySelector('#pk-ctrl-call-info');
    this.turnEl = container.querySelector('#pk-ctrl-turn');
    this.timerFillEl = container.querySelector('#pk-ctrl-timer');
    this.raiseLabelEl = container.querySelector('#pk-ctrl-raise-lbl');
    this.raiseSliderEl = container.querySelector('#pk-ctrl-slider');
    this.callBtnEl = container.querySelector('#pk-btn-call');
    this.raiseBtnEl = container.querySelector('#pk-btn-raise');
    this.allinBtnEl = container.querySelector('#pk-btn-allin');
    this.foldBtnEl = container.querySelector('#pk-btn-fold');

    const peekBtn = container.querySelector('#pk-peek-btn') as HTMLButtonElement | null;
    peekBtn?.addEventListener('click', () => {
      this.hideCards = !this.hideCards;
      peekBtn.textContent = this.hideCards ? 'Intip Kartu' : 'Tutup Kartu';
      this.renderView();
    });

    this.raiseSliderEl?.addEventListener('input', () => {
      this.raiseAmount = Number(this.raiseSliderEl?.value || 20);
      if (this.raiseLabelEl) this.raiseLabelEl.textContent = String(this.raiseAmount);
    });

    this.callBtnEl?.addEventListener('click', () => {
      ctx.onUnlockAudio();
      this.callPulseUntil = performance.now() + 140;
      navigator.vibrate?.(18);
    });
    this.raiseBtnEl?.addEventListener('click', () => {
      ctx.onUnlockAudio();
      this.raisePulseUntil = performance.now() + 140;
      navigator.vibrate?.(22);
    });
    this.allinBtnEl?.addEventListener('click', () => {
      ctx.onUnlockAudio();
      this.allinPulseUntil = performance.now() + 140;
      navigator.vibrate?.([25, 40, 25]);
    });
    this.foldBtnEl?.addEventListener('click', () => {
      ctx.onUnlockAudio();
      this.foldPulseUntil = performance.now() + 140;
      navigator.vibrate?.(15);
    });

    this.updateTransport(ctx.transportMode);
    ctx.onBindLandscapeGuard();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    this.view = decodePokerTelemetry(t);
    this.renderView();
  }

  private renderView(): void {
    const v = this.view;
    if (!v) return;

    if (this.cardsEl) {
      if (v.hole.length === 0) {
        this.cardsEl.innerHTML = '<div style="font-size:12px;color:var(--muted);">Menunggu ronde baru</div>';
      } else {
        this.cardsEl.innerHTML = v.hole
          .map((c) => {
            if (this.hideCards) return '<div class="pk-ctrl-card hidden">🂠</div>';
            const red = isRedSuit(c) ? 'red' : '';
            return `<div class="pk-ctrl-card ${red}"><span style="font-size:22px;">${cardRankLabel(
              c
            )}</span><span style="font-size:24px;">${cardSuitSymbol(c)}</span></div>`;
          })
          .join('');
      }
    }

    if (this.handNameEl) {
      this.handNameEl.textContent = this.hideCards ? 'Kartu Disembunyikan' : v.handName;
    }
    if (this.chipsEl) this.chipsEl.textContent = String(v.chips);
    if (this.potEl) this.potEl.textContent = String(v.pot);
    if (this.timerFillEl) this.timerFillEl.style.width = `${v.timerPct}%`;

    if (this.turnEl) {
      this.turnEl.textContent = v.folded
        ? 'Kamu Fold'
        : v.allIn
        ? 'All-In!'
        : v.isMyTurn
        ? 'GILIRANMU!'
        : 'Menunggu Giliran...';
      this.turnEl.style.color = v.isMyTurn ? '#fde047' : '#e2e8f0';
    }

    if (this.callInfoEl) {
      this.callInfoEl.textContent = v.toCall > 0 ? `Perlu Call ${v.toCall} chip` : 'Bisa Check gratis';
    }

    if (this.raiseSliderEl) {
      const minR = Math.min(v.chips, v.minRaise);
      const maxR = Math.max(minR, v.chips);
      this.raiseSliderEl.min = String(minR);
      this.raiseSliderEl.max = String(maxR);
      if (this.raiseAmount < minR || this.raiseAmount > maxR) {
        this.raiseAmount = minR;
        this.raiseSliderEl.value = String(minR);
      }
      if (this.raiseLabelEl) this.raiseLabelEl.textContent = String(this.raiseAmount);
    }

    const canAct = v.isMyTurn && !v.folded && !v.allIn && v.chips > 0;
    if (this.callBtnEl) {
      this.callBtnEl.disabled = !canAct;
      this.callBtnEl.textContent = v.toCall > 0 ? `CALL (${Math.min(v.chips, v.toCall)})` : 'CHECK';
    }
    if (this.raiseBtnEl) {
      this.raiseBtnEl.disabled = !canAct || v.chips <= v.toCall;
    }
    if (this.allinBtnEl) {
      this.allinBtnEl.disabled = !canAct;
    }
    if (this.foldBtnEl) {
      this.foldBtnEl.disabled = !canAct;
    }
  }

  getOutput(): ControllerOutput {
    const now = performance.now();
    const v = this.view;
    const minR = v ? Math.min(v.chips, v.minRaise) : 20;
    const maxR = v ? Math.max(minR, v.chips) : 1000;
    const span = Math.max(1, maxR - minR);
    const norm = Math.max(0, Math.min(1, (this.raiseAmount - minR) / span));

    return {
      steer: norm * 2 - 1,
      gas: now < this.allinPulseUntil,
      brake: false,
      drift: now < this.foldPulseUntil,
      item: now < this.callPulseUntil,
      boost: now < this.raisePulseUntil,
    };
  }

  releaseAllInputs(): void {
    this.callPulseUntil = 0;
    this.raisePulseUntil = 0;
    this.allinPulseUntil = 0;
    this.foldPulseUntil = 0;
  }

  unmount(): void {
    this.releaseAllInputs();
    if (this.root) this.root.innerHTML = '';
    this.root = null;
  }
}
