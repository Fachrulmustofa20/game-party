import { ControllerInputState } from '../../net/BinaryProtocol';
import { HostSDKContext, PlatformGame, PlatformPlayer } from '../../sdk/GameSDK';
import { PokerAudioEngine } from './PokerAudioEngine';
import {
  cardRank,
  cardRankLabel,
  cardSuitSymbol,
  createShuffledDeck,
  evaluateBestHand,
  isRedSuit,
} from './PokerEngine';
import { POKER_CSS } from './PokerStyles';
import { PokerPhase, packPokerTelemetry } from './PokerTelemetry';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const TURN_SECONDS = 20;
const SHOWDOWN_SECONDS = 5.5;

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <radialGradient id="felt" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#146b4b"/>
      <stop offset="100%" stop-color="#061914"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="url(#felt)"/>
  <ellipse cx="320" cy="170" rx="250" ry="115" fill="none" stroke="#3f2718" stroke-width="14"/>
  <g transform="translate(245,95) rotate(-8)">
    <rect width="74" height="106" rx="10" fill="#fff" stroke="#cbd5e1" stroke-width="3"/>
    <text x="37" y="46" text-anchor="middle" fill="#0f172a" font-family="system-ui,sans-serif" font-weight="900" font-size="30">A</text>
    <text x="37" y="82" text-anchor="middle" fill="#0f172a" font-size="32">♠</text>
  </g>
  <g transform="translate(318,90) rotate(8)">
    <rect width="74" height="106" rx="10" fill="#fff" stroke="#cbd5e1" stroke-width="3"/>
    <text x="37" y="46" text-anchor="middle" fill="#dc2626" font-family="system-ui,sans-serif" font-weight="900" font-size="30">A</text>
    <text x="37" y="82" text-anchor="middle" fill="#dc2626" font-size="32">♥</text>
  </g>
  <text x="320" y="330" text-anchor="middle" fill="#fde047" font-family="system-ui,sans-serif" font-weight="900" font-size="26" letter-spacing="4">TEXAS HOLD'EM POKER</text>
</svg>
`)}`;

interface PokerSeat {
  player: PlatformPlayer;
  chips: number;
  hole: number[];
  betInRound: number;
  totalInHand: number;
  folded: boolean;
  allIn: boolean;
  actedThisRound: boolean;
  lastAction: string;
}

export class PokerGame implements PlatformGame {
  readonly id = 'texas-poker';
  readonly title = "Texas Hold'em Poker";
  readonly subtitle =
    'Mainkan Texas Hold\'em Poker bareng teman atau bot! Lihat 2 kartu rahasiamu di HP, atur taruhan dengan Check, Call, Raise, All-In, atau Fold untuk merebut semua chip di meja.';
  readonly badge = '2-10 PLAYER • KARTU';
  readonly accentColor = '#10b981';
  readonly coverImage = COVER_SVG;
  readonly minPlayers = 2;
  readonly maxPlayers = 10;
  readonly controllerLayout: 'arena-dpad' = 'arena-dpad';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private audio = new PokerAudioEngine();

  private seats: PokerSeat[] = [];
  private deck: number[] = [];
  private community: number[] = [];
  private pot = 0;
  private currentBet = 0;
  private minRaise = BIG_BLIND;
  private round = 0;
  private dealerIdx = -1;
  private turnIdx = -1;
  private phase: PokerPhase = 'waiting';
  private turnTimer = 0;
  private phaseTimer = 0;
  private botTimer = 0;
  private logs: string[] = [];

  private rafId: number | null = null;
  private lastTime = 0;
  private hudTimer = 0;
  private telemetryTimer = 0;
  private inputPrev = new Map<string, ControllerInputState>();

  private potEl: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private roundEl: HTMLElement | null = null;
  private commEl: HTMLElement | null = null;
  private seatsEl: HTMLElement | null = null;
  private logEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.logs = [];
    this.inputPrev.clear();

    const players = sdk.getPlayers();
    this.seats = players.map((p) => ({
      player: p,
      chips: STARTING_CHIPS,
      hole: [],
      betInRound: 0,
      totalInHand: 0,
      folded: false,
      allIn: false,
      actedThisRound: false,
      lastAction: '',
    }));

    container.innerHTML = `
      <style>${POKER_CSS}</style>
      <div class="pk-stage">
        <div class="pk-topbar">
          <div style="display:flex;align-items:center;gap:12px;">
            <strong style="font-size:17px;">♠ Texas Hold'em Poker</strong>
            <span id="pk-round" class="pk-badge" style="background:rgba(16,185,129,0.2);color:#6ee7b7;">Ronde 1</span>
            <span id="pk-phase" class="pk-badge">Menunggu</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button id="pk-sound" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;">Suara: ON</button>
            <button id="pk-exit" class="btn btn-danger" style="padding:6px 12px;font-size:12px;">Keluar ke Lobby</button>
          </div>
        </div>

        <div class="pk-main">
          <div class="pk-table-area">
            <div class="pk-felt">
              <div class="pk-pot-pill">POT: <span id="pk-pot">0</span> Chip</div>
              <div class="pk-community-row" id="pk-community"></div>
              <div id="pk-banner" style="font-size:13px;font-weight:800;color:#e2e8f0;text-align:center;"></div>
            </div>
            <div class="pk-seats-grid" id="pk-seats"></div>
          </div>

          <aside class="pk-sidebar">
            <div style="font-size:13px;font-weight:900;color:#fde047;">Riwayat Meja</div>
            <div class="pk-log" id="pk-log"></div>
          </aside>
        </div>

        <div id="pk-overlay" style="display:none;position:absolute;inset:0;z-index:40;background:rgba(6,12,22,0.84);backdrop-filter:blur(8px);align-items:center;justify-content:center;"></div>
      </div>
    `;

    this.potEl = container.querySelector('#pk-pot');
    this.phaseEl = container.querySelector('#pk-phase');
    this.roundEl = container.querySelector('#pk-round');
    this.commEl = container.querySelector('#pk-community');
    this.seatsEl = container.querySelector('#pk-seats');
    this.logEl = container.querySelector('#pk-log');
    this.bannerEl = container.querySelector('#pk-banner');
    this.overlayEl = container.querySelector('#pk-overlay');

    const soundBtn = container.querySelector('#pk-sound') as HTMLButtonElement | null;
    soundBtn?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.isMuted());
      soundBtn.textContent = this.audio.isMuted() ? 'Suara: OFF' : 'Suara: ON';
    });
    container.querySelector('#pk-exit')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    this.startNewHand();
    this.renderHud();
    this.sendAllTelemetry();

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private pushLog(text: string): void {
    this.logs.unshift(text);
    if (this.logs.length > 24) this.logs.length = 24;
  }

  private aliveWithChips(): PokerSeat[] {
    return this.seats.filter((s) => s.chips > 0);
  }

  private nextSeatIndex(fromIdx: number, predicate: (s: PokerSeat) => boolean): number {
    const n = this.seats.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (predicate(this.seats[idx])) return idx;
    }
    return -1;
  }

  private startNewHand(): void {
    const survivors = this.aliveWithChips();
    if (survivors.length <= 1) {
      this.finishGame(survivors[0] ?? this.seats[0]);
      return;
    }

    this.round += 1;
    this.deck = createShuffledDeck();
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.phase = 'preflop';

    for (const s of this.seats) {
      s.hole = s.chips > 0 ? [this.deck.pop()!, this.deck.pop()!] : [];
      s.betInRound = 0;
      s.totalInHand = 0;
      s.folded = s.chips <= 0;
      s.allIn = false;
      s.actedThisRound = false;
      s.lastAction = s.chips <= 0 ? 'Habis' : '';
    }

    this.dealerIdx = this.nextSeatIndex(this.dealerIdx, (s) => s.chips > 0);
    const sbIdx =
      survivors.length === 2
        ? this.dealerIdx
        : this.nextSeatIndex(this.dealerIdx, (s) => s.chips > 0);
    const bbIdx = this.nextSeatIndex(sbIdx, (s) => s.chips > 0);

    this.postBlind(this.seats[sbIdx], SMALL_BLIND, 'SB');
    this.postBlind(this.seats[bbIdx], BIG_BLIND, 'BB');
    this.currentBet = Math.max(this.seats[sbIdx].betInRound, this.seats[bbIdx].betInRound);

    this.turnIdx = this.nextSeatIndex(bbIdx, (s) => !s.folded && !s.allIn);
    this.turnTimer = TURN_SECONDS;
    this.botTimer = 0.9 + Math.random() * 0.6;
    this.audio.playDeal();
    this.pushLog(`Ronde ${this.round} dimulai! Kartu dibagikan.`);
  }

  private postBlind(seat: PokerSeat, amount: number, label: string): void {
    const paid = Math.min(seat.chips, amount);
    seat.chips -= paid;
    seat.betInRound += paid;
    seat.totalInHand += paid;
    this.pot += paid;
    if (seat.chips === 0) seat.allIn = true;
    seat.lastAction = `${label} ${paid}`;
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.update(dt);

    this.hudTimer += dt;
    if (this.hudTimer >= 0.12) {
      this.hudTimer = 0;
      this.renderHud();
    }

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 1 / 12) {
      this.telemetryTimer = 0;
      this.sendAllTelemetry();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    if (this.phase === 'gameover') return;

    if (this.phase === 'showdown') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.startNewHand();
      }
      return;
    }

    if (this.turnIdx < 0 || this.turnIdx >= this.seats.length) return;
    const seat = this.seats[this.turnIdx];
    if (!seat || seat.folded || seat.allIn) {
      this.advanceTurnOrStreet();
      return;
    }

    if (seat.player.isBot) {
      this.botTimer -= dt;
      if (this.botTimer <= 0) {
        this.runBotAction(seat);
      }
      return;
    }

    // Human turn input
    const input = this.sdk?.getInput(seat.player.id);
    if (input) {
      const prev = this.inputPrev.get(seat.player.id) ?? {
        seq: 0,
        steer: 0,
        gas: false,
        brake: false,
        drift: false,
        item: false,
        boost: false,
        timestamp: 0,
      };
      this.inputPrev.set(seat.player.id, { ...input });

      if (input.item && !prev.item) {
        this.handleCallOrCheck(seat);
        return;
      }
      if (input.boost && !prev.boost) {
        const frac = Math.max(0, Math.min(1, (input.steer + 1) / 2));
        const maxRaise = seat.chips;
        const desired = Math.round((this.minRaise + frac * Math.max(0, maxRaise - this.minRaise)) / 10) * 10;
        this.handleRaise(seat, Math.max(this.minRaise, desired));
        return;
      }
      if (input.gas && !prev.gas) {
        this.handleRaise(seat, seat.chips);
        return;
      }
      if (input.drift && !prev.drift) {
        this.handleFold(seat);
        return;
      }
    }

    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      const toCall = Math.max(0, this.currentBet - seat.betInRound);
      if (toCall === 0) {
        this.handleCallOrCheck(seat);
      } else {
        this.handleFold(seat);
      }
    }
  }

  private handleCallOrCheck(seat: PokerSeat): void {
    const toCall = Math.max(0, this.currentBet - seat.betInRound);
    const paid = Math.min(seat.chips, toCall);
    seat.chips -= paid;
    seat.betInRound += paid;
    seat.totalInHand += paid;
    this.pot += paid;
    seat.actedThisRound = true;
    if (seat.chips === 0 && paid > 0) seat.allIn = true;

    if (paid === 0) {
      seat.lastAction = 'Check';
      this.audio.playCheck();
      this.pushLog(`${seat.player.name} melakukan Check.`);
    } else {
      seat.lastAction = seat.allIn ? `All-In ${paid}` : `Call ${paid}`;
      this.audio.playChip();
      this.pushLog(`${seat.player.name} ${seat.allIn ? 'All-In' : 'Call'} ${paid} chip.`);
    }
    this.advanceTurnOrStreet();
  }

  private handleRaise(seat: PokerSeat, raiseBy: number): void {
    const toCall = Math.max(0, this.currentBet - seat.betInRound);
    const desiredTotal = toCall + Math.max(this.minRaise, raiseBy);
    const paid = Math.min(seat.chips, desiredTotal);
    if (paid <= toCall) {
      this.handleCallOrCheck(seat);
      return;
    }

    seat.chips -= paid;
    seat.betInRound += paid;
    seat.totalInHand += paid;
    this.pot += paid;
    if (seat.betInRound > this.currentBet) {
      this.minRaise = Math.max(BIG_BLIND, seat.betInRound - this.currentBet);
      this.currentBet = seat.betInRound;
      for (const other of this.seats) {
        if (other !== seat) other.actedThisRound = false;
      }
    }
    seat.actedThisRound = true;
    if (seat.chips === 0) seat.allIn = true;
    seat.lastAction = seat.allIn ? `All-In ${seat.betInRound}` : `Raise ${seat.betInRound}`;
    this.audio.playChip();
    this.pushLog(`${seat.player.name} ${seat.allIn ? 'All-In' : 'Raise'} ke ${seat.betInRound} chip.`);
    this.advanceTurnOrStreet();
  }

  private handleFold(seat: PokerSeat): void {
    seat.folded = true;
    seat.actedThisRound = true;
    seat.lastAction = 'Fold';
    this.audio.playFold();
    this.pushLog(`${seat.player.name} memilih Fold.`);
    this.advanceTurnOrStreet();
  }

  private runBotAction(seat: PokerSeat): void {
    const toCall = Math.max(0, this.currentBet - seat.betInRound);
    const evalRes = evaluateBestHand([...seat.hole, ...this.community]);
    const highHole = Math.max(cardRank(seat.hole[0] ?? 0), cardRank(seat.hole[1] ?? 0));
    const strength = evalRes.category + (highHole >= 10 ? 0.45 : 0) + Math.random() * 0.6;

    if (toCall === 0) {
      if (strength >= 1.5 && seat.chips > this.minRaise && Math.random() < 0.45) {
        this.handleRaise(seat, this.minRaise);
      } else {
        this.handleCallOrCheck(seat);
      }
      return;
    }

    if (toCall > seat.chips * 0.55 && strength < 1.3) {
      this.handleFold(seat);
    } else if (strength >= 2.2 && seat.chips > toCall + this.minRaise && Math.random() < 0.35) {
      this.handleRaise(seat, this.minRaise);
    } else if (strength >= 0.85 || toCall <= BIG_BLIND) {
      this.handleCallOrCheck(seat);
    } else {
      this.handleFold(seat);
    }
  }

  private advanceTurnOrStreet(): void {
    const inHand = this.seats.filter((s) => !s.folded);
    if (inHand.length <= 1) {
      const winner = inHand[0] ?? this.seats[0];
      winner.chips += this.pot;
      this.audio.playWin();
      this.pushLog(`${winner.player.name} menang ${this.pot} chip (lawan Fold)!`);
      if (this.bannerEl) {
        this.bannerEl.textContent = `🏆 ${winner.player.name} memenangkan ${this.pot} chip!`;
      }
      this.phase = 'showdown';
      this.phaseTimer = SHOWDOWN_SECONDS;
      return;
    }

    const canAct = inHand.filter((s) => !s.allIn);
    const roundComplete = canAct.every(
      (s) => s.actedThisRound && s.betInRound === this.currentBet
    );

    if (!roundComplete) {
      this.turnIdx = this.nextSeatIndex(this.turnIdx, (s) => !s.folded && !s.allIn);
      this.turnTimer = TURN_SECONDS;
      this.botTimer = 0.8 + Math.random() * 0.6;
      return;
    }

    // Move to next street
    for (const s of this.seats) {
      s.betInRound = 0;
      s.actedThisRound = false;
      if (!s.folded && !s.allIn) s.lastAction = '';
    }
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;

    if (this.phase === 'preflop') {
      this.phase = 'flop';
      this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
      this.audio.playDeal();
      this.pushLog('Flop dibuka (3 kartu).');
    } else if (this.phase === 'flop') {
      this.phase = 'turn';
      this.community.push(this.deck.pop()!);
      this.audio.playDeal();
      this.pushLog('Turn dibuka (kartu ke-4).');
    } else if (this.phase === 'turn') {
      this.phase = 'river';
      this.community.push(this.deck.pop()!);
      this.audio.playDeal();
      this.pushLog('River dibuka (kartu ke-5).');
    } else if (this.phase === 'river') {
      this.resolveShowdown(inHand);
      return;
    }

    if (canAct.length <= 1) {
      // Everyone else is all-in; auto-deal remaining streets smoothly
      this.turnIdx = -1;
      this.advanceTurnOrStreet();
      return;
    }

    this.turnIdx = this.nextSeatIndex(this.dealerIdx, (s) => !s.folded && !s.allIn);
    this.turnTimer = TURN_SECONDS;
    this.botTimer = 0.8 + Math.random() * 0.6;
  }

  private resolveShowdown(inHand: PokerSeat[]): void {
    this.phase = 'showdown';
    this.phaseTimer = SHOWDOWN_SECONDS;

    const scored = inHand.map((seat) => ({
      seat,
      evalRes: evaluateBestHand([...seat.hole, ...this.community]),
    }));
    scored.sort((a, b) => b.evalRes.score - a.evalRes.score);

    const topScore = scored[0].evalRes.score;
    const winners = scored.filter((x) => x.evalRes.score === topScore);
    const share = Math.floor(this.pot / winners.length);
    let remainder = this.pot - share * winners.length;

    for (const w of winners) {
      w.seat.chips += share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }

    this.audio.playWin();
    const names = winners.map((w) => w.seat.player.name).join(' & ');
    const handName = winners[0].evalRes.name;
    this.pushLog(`Showdown: ${names} menang ${this.pot} chip (${handName})!`);
    if (this.bannerEl) {
      this.bannerEl.textContent = `🏆 ${names} menang ${this.pot} chip • ${handName}!`;
    }
  }

  private finishGame(champion: PokerSeat): void {
    this.phase = 'gameover';
    if (!this.overlayEl) return;
    this.audio.playWin();
    this.overlayEl.style.display = 'flex';
    this.overlayEl.innerHTML = `
      <div style="width:min(92%,440px);background:var(--panel);border:2px solid #10b981;border-radius:20px;padding:24px;text-align:center;display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:13px;color:#6ee7b7;font-weight:800;">PERMAINAN SELESAI</div>
        <h2 style="margin:0;font-size:28px;font-weight:900;">🏆 ${champion.player.name} Juara Meja!</h2>
        <div style="font-size:14px;color:var(--muted);">Total Chip: <strong style="color:#fde047;">${champion.chips}</strong></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
          <button id="pk-rematch" class="btn btn-primary" style="padding:12px;">Main Lagi</button>
          <button id="pk-back" class="btn btn-secondary" style="padding:12px;">Kembali ke Lobby</button>
        </div>
      </div>
    `;
    this.overlayEl.querySelector('#pk-rematch')?.addEventListener('click', () => {
      if (this.overlayEl) this.overlayEl.style.display = 'none';
      this.round = 0;
      for (const s of this.seats) s.chips = STARTING_CHIPS;
      this.startNewHand();
    });
    this.overlayEl.querySelector('#pk-back')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });
  }

  private sendAllTelemetry(): void {
    if (!this.sdk) return;
    const sorted = [...this.seats].sort((a, b) => b.chips - a.chips);
    const activeTurnSeat = this.turnIdx >= 0 ? this.seats[this.turnIdx] : null;

    for (const s of this.seats) {
      if (s.player.isBot) continue;
      const evalRes = evaluateBestHand([...s.hole, ...this.community]);
      const toCall = Math.max(0, this.currentBet - s.betInRound);
      this.sdk.sendTelemetry(
        s.player.id,
        packPokerTelemetry({
          phase: this.phase,
          round: this.round,
          rank: sorted.indexOf(s) + 1,
          totalPlayers: this.seats.length,
          hole: s.hole,
          community: this.community,
          handCategory: evalRes.category,
          handName: evalRes.name,
          chips: s.chips,
          pot: this.pot,
          toCall,
          minRaise: this.minRaise,
          isMyTurn: activeTurnSeat === s && !s.folded && !s.allIn,
          folded: s.folded,
          allIn: s.allIn,
          timerPct:
            activeTurnSeat === s ? Math.max(0, Math.min(100, (this.turnTimer / TURN_SECONDS) * 100)) : 0,
        })
      );
    }
  }

  private renderCardHtml(card: number | undefined, mini = false, hidden = false): string {
    const cls = mini ? 'pk-mini-card' : 'pk-card';
    if (card === undefined) return `<div class="${cls} empty"></div>`;
    if (hidden) return `<div class="${cls} back">🂠</div>`;
    const red = isRedSuit(card) ? 'red' : '';
    const r = cardRankLabel(card);
    const s = cardSuitSymbol(card);
    if (mini) {
      return `<div class="${cls} ${red}"><span>${r}</span><span>${s}</span></div>`;
    }
    return `<div class="${cls} ${red}"><span class="pk-card-rank">${r}</span><span class="pk-card-suit">${s}</span></div>`;
  }

  private renderHud(): void {
    if (this.potEl) this.potEl.textContent = String(this.pot);
    if (this.roundEl) this.roundEl.textContent = `Ronde ${this.round}`;
    if (this.phaseEl) {
      const labels: Record<PokerPhase, string> = {
        waiting: 'Menunggu',
        preflop: 'Pre-Flop',
        flop: 'Flop',
        turn: 'Turn',
        river: 'River',
        showdown: 'Showdown',
        gameover: 'Selesai',
      };
      this.phaseEl.textContent = labels[this.phase];
    }

    if (this.commEl) {
      const slots = [0, 1, 2, 3, 4].map((i) => this.renderCardHtml(this.community[i], false, false));
      this.commEl.innerHTML = slots.join('');
    }

    if (this.bannerEl && this.phase !== 'showdown') {
      const active = this.turnIdx >= 0 ? this.seats[this.turnIdx] : null;
      this.bannerEl.textContent = active
        ? `Giliran ${active.player.name} (${Math.ceil(this.turnTimer)}d) • Taruhan meja: ${this.currentBet}`
        : '';
    }

    if (this.seatsEl) {
      const showAll = this.phase === 'showdown' || this.phase === 'gameover';
      this.seatsEl.innerHTML = this.seats
        .map((s, idx) => {
          const isTurn = idx === this.turnIdx && this.phase !== 'showdown' && this.phase !== 'gameover';
          const cls = s.chips <= 0 && s.folded ? 'out' : s.folded ? 'folded' : isTurn ? 'turn' : '';
          const cardsHtml =
            s.hole.length === 2
              ? s.hole.map((c) => this.renderCardHtml(c, true, !showAll || s.folded)).join('')
              : '';
          const evalName =
            showAll && !s.folded && s.hole.length === 2
              ? evaluateBestHand([...s.hole, ...this.community]).name
              : s.lastAction || 'Menunggu';
          return `
            <div class="pk-seat ${cls}">
              <div class="pk-seat-top">
                <span style="width:10px;height:10px;border-radius:50%;background:${s.player.color};flex-shrink:0;"></span>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">P${s.player.slot + 1} ${s.player.name}</span>
                ${idx === this.dealerIdx ? '<span class="pk-badge dealer">D</span>' : ''}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                <span style="color:#fde047;font-weight:800;">${s.chips} chip</span>
                <span style="color:#94a3b8;font-size:11px;">${evalName}</span>
              </div>
              <div class="pk-mini-cards">${cardsHtml}</div>
            </div>
          `;
        })
        .join('');
    }

    if (this.logEl) {
      this.logEl.innerHTML = this.logs
        .map((l) => `<div class="pk-log-item">${l}</div>`)
        .join('');
    }
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.audio.destroy();
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }
}
