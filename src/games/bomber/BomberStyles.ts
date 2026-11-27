export const BOMBER_CSS = `
/* ===== Host screen ===== */
.bmb-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 24% 12%, rgba(249,115,22,0.16), transparent 42%),
    radial-gradient(circle at 82% 84%, rgba(34,211,238,0.12), transparent 46%),
    #05070d;
  color: #f8fafc;
}
.bmb-layout {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 14px;
  padding: 64px 16px 16px;
  align-items: stretch;
}
.bmb-arena-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
  background: #05070d;
  box-shadow: 0 20px 60px rgba(0,0,0,0.55), inset 0 0 80px rgba(0,0,0,0.4);
}
.bmb-arena-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.bmb-side {
  width: 292px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(11,16,29,0.9);
  border: 1px solid rgba(255,255,255,0.1);
  overflow-y: auto;
}
.bmb-side-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #94a3b8;
  text-transform: uppercase;
}
.bmb-side-head > span:first-child {
  white-space: nowrap;
}
.bmb-side-head > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.bmb-score-row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 9px;
  border-radius: 12px;
  background: rgba(15,23,42,0.78);
  border: 1px solid rgba(255,255,255,0.07);
  border-left: 3px solid var(--bmb-color, #94a3b8);
}
.bmb-score-row.out {
  opacity: 0.42;
}
.bmb-score-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--bmb-color, #94a3b8);
  box-shadow: 0 0 10px var(--bmb-color, #94a3b8);
}
.bmb-score-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bmb-score-name small {
  display: block;
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.bmb-score-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 10px;
  font-weight: 800;
  color: #cbd5e1;
  white-space: nowrap;
}
.bmb-score-hearts {
  font-size: 12px;
  letter-spacing: 1px;
  color: #f87171;
}
.bmb-score-hearts .empty {
  color: rgba(248,113,113,0.22);
}
.bmb-score-points {
  color: #fbbf24;
}

.bmb-banner {
  position: absolute;
  left: 50%;
  top: 16%;
  transform: translateX(-50%);
  z-index: 25;
  padding: 8px 22px;
  border-radius: 999px;
  background: rgba(8,12,23,0.82);
  border: 1px solid rgba(255,255,255,0.14);
  font-size: clamp(18px, 2.4vw, 32px);
  font-weight: 900;
  letter-spacing: 0.05em;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.22s ease;
  text-shadow: 0 3px 18px rgba(0,0,0,0.85);
}
.bmb-banner.show {
  opacity: 1;
}
.bmb-countdown {
  position: absolute;
  inset: 0;
  z-index: 24;
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: clamp(80px, 15vw, 190px);
  font-weight: 900;
  color: #f97316;
  text-shadow: 0 0 40px rgba(249,115,22,0.85), 0 10px 40px rgba(0,0,0,0.8);
}
.bmb-countdown.show {
  display: flex;
}

.bmb-overlay {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(2,6,23,0.86);
  backdrop-filter: blur(8px);
  overflow-y: auto;
}
.bmb-overlay.show {
  display: flex;
}
.bmb-select-card,
.bmb-result-card {
  width: min(1180px, 100%);
  max-height: 100%;
  overflow-y: auto;
  background: #0b1120;
  border: 1px solid rgba(148,163,184,0.22);
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 28px 80px rgba(0,0,0,0.65);
}
.bmb-result-card {
  width: min(760px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: center;
}
.bmb-select-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bmb-select-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap;
}
.bmb-kicker {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #f97316;
}
.bmb-select-title {
  margin: 3px 0 0;
  font-size: clamp(22px, 2.6vw, 34px);
  font-weight: 900;
  letter-spacing: -0.02em;
}
.bmb-select-sub {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: #94a3b8;
  max-width: 680px;
}
.bmb-arena-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
  gap: 11px;
}
.bmb-arena-card {
  appearance: none;
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  background: #0f172a;
  color: #f8fafc;
  padding: 9px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
}
.bmb-arena-card:hover {
  transform: translateY(-2px);
  border-color: rgba(249,115,22,0.55);
}
.bmb-arena-card.selected {
  border-color: #f97316;
  box-shadow: 0 0 0 3px rgba(249,115,22,0.18), 0 14px 30px rgba(0,0,0,0.5);
}
.bmb-arena-preview {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.12);
  background: #05070d;
  margin-bottom: 8px;
}
.bmb-arena-name {
  font-size: 14px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bmb-arena-diff {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(249,115,22,0.16);
  color: #fdba74;
  white-space: nowrap;
}
.bmb-arena-sub {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.35;
  color: #94a3b8;
  min-height: 30px;
}
.bmb-arena-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 7px;
}
.bmb-tag {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(34,211,238,0.12);
  color: #67e8f9;
}
.bmb-arena-card.random {
  background:
    radial-gradient(circle at 30% 20%, rgba(34,211,238,0.2), transparent 55%),
    radial-gradient(circle at 80% 80%, rgba(249,115,22,0.22), transparent 55%),
    #0f172a;
}
.bmb-arena-random-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 118px;
  border-radius: 10px;
  border: 1px dashed rgba(148,163,184,0.38);
  margin-bottom: 8px;
  font-size: 38px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #e2e8f0;
  background: rgba(2,6,23,0.35);
}
.bmb-select-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  border-top: 1px solid rgba(148,163,184,0.16);
  padding-top: 13px;
}
.bmb-roster {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 720px;
}
.bmb-roster-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px 4px 5px;
  border-radius: 999px;
  background: rgba(15,23,42,0.9);
  border: 1px solid rgba(255,255,255,0.1);
  font-size: 11px;
  font-weight: 800;
  color: #e2e8f0;
}
.bmb-roster-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.6);
}
.bmb-roster-chip small {
  color: #64748b;
  font-size: 9px;
  font-weight: 800;
}
.bmb-start-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.bmb-start-btn {
  padding: 12px 26px;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.03em;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(249,115,22,0.35);
}
.bmb-start-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.bmb-select-note {
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
}

.bmb-result-title {
  margin: 0;
  font-size: clamp(24px, 3vw, 38px);
  font-weight: 900;
  letter-spacing: -0.02em;
}
.bmb-result-sub {
  margin: -6px 0 0;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.5;
}
.bmb-result-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 0 2px;
}
.bmb-result-avatars {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.bmb-result-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 18px;
  color: #080c17;
  border: 3px solid rgba(255,255,255,0.85);
  box-shadow: 0 0 26px rgba(255,255,255,0.25);
}
.bmb-standings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.bmb-standing-row {
  display: grid;
  grid-template-columns: 24px 1fr auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(15,23,42,0.8);
  border: 1px solid rgba(255,255,255,0.07);
  font-size: 12px;
  text-align: left;
}
.bmb-standing-row.first {
  border-color: rgba(251,191,36,0.55);
  background: rgba(251,191,36,0.08);
}
.bmb-standing-rank {
  font-size: 13px;
  font-weight: 900;
  color: #64748b;
}
.bmb-standing-name {
  min-width: 0;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bmb-standing-stat {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  white-space: nowrap;
}
.bmb-standing-stat strong {
  color: #fbbf24;
}
.bmb-btn-row {
  display: flex;
  gap: 9px;
  justify-content: center;
  flex-wrap: wrap;
}
.bmb-btn-row .btn {
  min-width: 130px;
}

@media (max-width: 1180px) {
  .bmb-side { width: 244px; }
}
@media (max-width: 940px) {
  .bmb-side { display: none; }
  .bmb-layout { padding: 60px 10px 10px; }
}
@media (max-height: 760px) {
  .bmb-layout { padding-top: 58px; }
  .bmb-select-card { padding: 15px; gap: 10px; }
  .bmb-arena-sub { min-height: 0; }
  .bmb-arena-random-visual { min-height: 88px; }
}

/* ===== Phone controller ===== */
.bmb-ctrl {
  grid-template-columns: 1.05fr 0.95fr 1.05fr;
  padding: 8px 12px;
  gap: 9px;
}
.bmb-ctrl-left {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.bmb-dpad {
  width: min(100%, 330px);
  max-height: 100%;
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(48px, 1fr));
  grid-template-rows: repeat(3, minmax(48px, 1fr));
  gap: 7px;
  touch-action: none;
}
.bmb-dpad-btn {
  border: 1px solid rgba(255,255,255,0.24);
  border-radius: 16px;
  background: linear-gradient(180deg, #1e293b, #0f172a);
  color: #f8fafc;
  font-size: clamp(18px, 4.4vh, 30px);
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.24), 0 5px 0 rgba(0,0,0,0.5);
  transition: transform 0.06s ease, box-shadow 0.06s ease, background 0.1s ease;
}
.bmb-dpad-btn.pressed {
  transform: translateY(3px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 0 rgba(0,0,0,0.5);
  background: linear-gradient(180deg, #f97316, #b91c1c);
  border-color: rgba(253,186,116,0.9);
}
.bmb-dpad-up { grid-column: 2; grid-row: 1; }
.bmb-dpad-left { grid-column: 1; grid-row: 2; }
.bmb-dpad-center {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #64748b;
  text-transform: uppercase;
  border: 1px dashed rgba(148,163,184,0.22);
  border-radius: 14px;
  background: rgba(15,23,42,0.35);
}
.bmb-dpad-center strong {
  font-size: 11px;
  color: #fdba74;
}
.bmb-dpad-right { grid-column: 3; grid-row: 2; }
.bmb-dpad-down { grid-column: 2; grid-row: 3; }
.bmb-ctrl-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #64748b;
  text-transform: uppercase;
}
.bmb-ctrl-center {
  gap: 5px;
  padding: 8px;
  overflow: hidden;
}
.bmb-ctrl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  font-size: 10px;
  font-weight: 800;
}
.bmb-ctrl-top .badge-rtc,
.bmb-ctrl-top .badge-ws {
  font-size: 8px;
  padding: 2px 6px;
}
.bmb-ctrl-arena {
  width: 100%;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fdba74;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bmb-ctrl-timer {
  font-size: clamp(24px, 5vh, 36px);
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: -0.02em;
}
.bmb-ctrl-timer small {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 800;
}
.bmb-ctrl-timerbar {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: #070b14;
  border: 1px solid rgba(255,255,255,0.12);
}
.bmb-ctrl-timerbar > div {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #22c55e, #facc15, #ef4444);
  transition: width 0.12s linear;
}
.bmb-ctrl-hearts {
  display: flex;
  gap: 2px;
  font-size: clamp(15px, 3.2vh, 21px);
  line-height: 1;
  color: #f87171;
  letter-spacing: 1px;
}
.bmb-ctrl-hearts .empty {
  color: rgba(248,113,113,0.2);
}
.bmb-ctrl-stats {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  font-size: 9px;
  font-weight: 800;
  color: #cbd5e1;
}
.bmb-stat {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 7px;
  background: rgba(2,6,23,0.55);
  border: 1px solid rgba(255,255,255,0.08);
  white-space: nowrap;
}
.bmb-stat strong {
  color: #fdba74;
}
.bmb-ctrl-radar {
  width: 100%;
  height: auto;
  max-height: 24%;
  border-radius: 9px;
  background: #070b14;
  border: 1px solid rgba(255,255,255,0.1);
  display: block;
}
.bmb-ctrl-phase {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: 0.03em;
  color: #e2e8f0;
}
.bmb-ctrl-actions {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.bmb-ctrl-actions .pad-btn {
  min-height: 0;
}
.bmb-bomb-btn {
  flex: 1.45;
  background: linear-gradient(180deg, #f97316, #b91c1c);
  border-color: rgba(253,186,116,0.8);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 0 rgba(0,0,0,0.45);
}
.bmb-dash-btn {
  flex: 1;
  background: linear-gradient(180deg, #eab308, #a16207);
  color: #0b1120;
  border-color: rgba(253,224,71,0.8);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 0 rgba(0,0,0,0.45);
}
.bmb-ctrl-actions .bmb-ready {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 0 rgba(0,0,0,0.45), 0 0 20px rgba(249,115,22,0.5);
}
.bmb-ctrl-actions .bmb-dim {
  opacity: 0.38;
  filter: grayscale(0.7);
}
.bmb-btn-caption {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.72);
}
.bmb-dash-btn .bmb-btn-caption {
  color: rgba(11,17,32,0.68);
}
.bmb-ctrl-hint {
  font-size: 9px;
  line-height: 1.25;
  color: #64748b;
  text-align: center;
}
@media (orientation: landscape) and (max-height: 480px) {
  .bmb-ctrl { padding: 5px 9px; gap: 7px; }
  .bmb-dpad { gap: 5px; }
  .bmb-dpad-btn { border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.24), 0 3px 0 rgba(0,0,0,0.5); }
  .bmb-ctrl-center { padding: 6px; gap: 3px; }
  .bmb-ctrl-timer { font-size: 22px; }
  .bmb-ctrl-stats { font-size: 8px; }
  .bmb-ctrl-phase { min-height: 18px; font-size: 9px; }
  .bmb-ctrl-hint { display: none; }
  .bmb-ctrl-radar { max-height: 21%; }
}
`;
