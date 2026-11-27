export const MINIGOLF_CSS = `
/* ===== Host screen ===== */
.mg-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 25% 10%, rgba(34,197,94,0.16), transparent 42%),
    radial-gradient(circle at 80% 85%, rgba(34,211,238,0.1), transparent 46%),
    #05070d;
  color: #f8fafc;
}
.mg-layout {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 14px;
  padding: 64px 16px 16px;
  align-items: stretch;
}
.mg-arena-wrap {
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
  box-shadow: 0 20px 60px rgba(0,0,0,0.55), inset 0 0 80px rgba(0,0,0,0.35);
}
.mg-arena-wrap canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.mg-side {
  width: 284px;
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
.mg-side-head {
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
.mg-side-head > span:first-child {
  white-space: nowrap;
}
.mg-side-head > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.mg-score-row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 9px;
  border-radius: 12px;
  background: rgba(15,23,42,0.78);
  border: 1px solid rgba(255,255,255,0.07);
  border-left: 3px solid var(--mg-color, #94a3b8);
}
.mg-score-row.out {
  opacity: 0.48;
}
.mg-score-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mg-color, #94a3b8);
  box-shadow: 0 0 10px var(--mg-color, #94a3b8);
}
.mg-score-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mg-score-name small {
  display: block;
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.mg-score-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 10px;
  font-weight: 800;
  color: #cbd5e1;
  white-space: nowrap;
}
.mg-score-total {
  color: #fbbf24;
}
.mg-score-hole {
  color: #94a3b8;
}
.mg-status-pill {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #67e8f9;
}
.mg-status-pill.holed {
  color: #4ade80;
}
.mg-status-pill.charging {
  color: #fbbf24;
}
.mg-banner {
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
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.22s ease;
  text-shadow: 0 3px 18px rgba(0,0,0,0.85);
}
.mg-banner.show {
  opacity: 1;
}
.mg-overlay {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2,6,23,0.84);
  backdrop-filter: blur(8px);
  overflow-y: auto;
}
.mg-overlay.show {
  display: flex;
}
.mg-panel {
  width: min(1180px, 100%);
  max-height: 100%;
  overflow-y: auto;
  background: #0b1120;
  border: 1px solid rgba(148,163,184,0.22);
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 28px 80px rgba(0,0,0,0.65);
}
.mg-pregame-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap;
}
.mg-kicker {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #22c55e;
}
.mg-title {
  margin: 3px 0 0;
  font-size: clamp(22px, 2.6vw, 34px);
  font-weight: 900;
  letter-spacing: -0.02em;
}
.mg-subtitle {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: #94a3b8;
  max-width: 720px;
}
.mg-hole-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 11px;
  margin-top: 14px;
}
.mg-hole-card {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  background: #0f172a;
  padding: 9px;
  text-align: left;
}
.mg-hole-preview {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.12);
  background: #05070d;
  margin-bottom: 8px;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mg-hole-preview svg {
  display: block;
  width: 100%;
  height: 100%;
}
.mg-hole-name {
  font-size: 14px;
  font-weight: 900;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.mg-par-badge {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(34,197,94,0.14);
  color: #86efac;
  white-space: nowrap;
}
.mg-hole-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 7px;
}
.mg-tag {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(34,211,238,0.1);
  color: #67e8f9;
}
.mg-pregame-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  border-top: 1px solid rgba(148,163,184,0.16);
  margin-top: 14px;
  padding-top: 13px;
}
.mg-roster {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 720px;
}
.mg-roster-chip {
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
.mg-roster-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.6);
}
.mg-roster-chip small {
  color: #64748b;
  font-size: 9px;
  font-weight: 800;
}
.mg-tee-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.mg-tee-btn {
  padding: 12px 26px;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.03em;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #22c55e, #0ea5e9);
  color: #06121f;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(34,197,94,0.3);
}
.mg-tee-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.mg-note {
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
}
.mg-intro-card {
  width: min(520px, 100%);
  text-align: center;
  background: rgba(8,12,23,0.82);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 22px;
  padding: 26px;
  box-shadow: 0 28px 80px rgba(0,0,0,0.55);
}
.mg-intro-hole {
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #4ade80;
  text-transform: uppercase;
}
.mg-intro-name {
  margin: 5px 0 2px;
  font-size: clamp(30px, 5vw, 56px);
  font-weight: 900;
  letter-spacing: -0.03em;
}
.mg-intro-meta {
  font-size: 13px;
  color: #cbd5e1;
  font-weight: 800;
}
.mg-intro-count {
  margin-top: 16px;
  font-size: 64px;
  font-weight: 900;
  color: #fbbf24;
  line-height: 1;
}
.mg-result-card {
  width: min(820px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: center;
}
.mg-result-title {
  margin: 0;
  font-size: clamp(24px, 3vw, 38px);
  font-weight: 900;
  letter-spacing: -0.02em;
}
.mg-result-sub {
  margin: -6px 0 0;
  font-size: 13px;
  color: #94a3b8;
}
.mg-scorecard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.mg-scorecard-row {
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
.mg-scorecard-row.first {
  border-color: rgba(251,191,36,0.55);
  background: rgba(251,191,36,0.08);
}
.mg-scorecard-rank {
  font-size: 13px;
  font-weight: 900;
  color: #64748b;
}
.mg-scorecard-name {
  min-width: 0;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mg-scorecard-stat {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  white-space: nowrap;
}
.mg-scorecard-stat strong {
  color: #fbbf24;
}
.mg-btn-row {
  display: flex;
  gap: 9px;
  justify-content: center;
  flex-wrap: wrap;
}
.mg-btn-row .btn {
  min-width: 130px;
}
@media (max-width: 1180px) {
  .mg-side { width: 244px; }
}
@media (max-width: 940px) {
  .mg-side { display: none; }
  .mg-layout { padding: 60px 10px 10px; }
}
@media (max-height: 760px) {
  .mg-layout { padding-top: 58px; }
  .mg-panel { padding: 15px; }
}

/* ===== Phone controller ===== */
.mgc-gamepad {
  grid-template-columns: 1.05fr 0.95fr 1.05fr;
  padding: 8px 12px;
  gap: 9px;
}
.mgc-left {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.mgc-dial-wrap {
  position: relative;
  width: min(100%, 300px);
  max-height: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mgc-dial {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, rgba(34,197,94,0.08), transparent 55%),
    radial-gradient(circle at 50% 50%, #111f33, #070b14 70%);
  border: 2px solid rgba(148,163,184,0.35);
  box-shadow: inset 0 0 30px rgba(0,0,0,0.6), 0 10px 30px rgba(0,0,0,0.4);
  touch-action: none;
  overflow: hidden;
}
.mgc-dial::before,
.mgc-dial::after {
  content: '';
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  border: 1px dashed rgba(148,163,184,0.22);
}
.mgc-dial::after {
  inset: 28%;
  border-style: solid;
  border-color: rgba(34,197,94,0.18);
}
.mgc-dial-needle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 42%;
  background: linear-gradient(180deg, #f8fafc, #22c55e);
  border-radius: 999px;
  transform-origin: 50% 100%;
  transform: translate(-50%, -100%) rotate(0rad);
  box-shadow: 0 0 12px rgba(34,197,94,0.6);
  pointer-events: none;
}
.mgc-dial-center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0b1120;
  border: 2px solid #22c55e;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.mgc-dial-label {
  position: absolute;
  left: 50%;
  bottom: 9%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #94a3b8;
  text-transform: uppercase;
  pointer-events: none;
}
.mgc-aim-value {
  font-size: 11px;
  font-weight: 900;
  color: #86efac;
  letter-spacing: 0.06em;
}
.mgc-center {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 7px;
  border-radius: 16px;
  background: rgba(17,24,41,0.9);
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}
.mgc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  font-size: 10px;
  font-weight: 800;
}
.mgc-top .badge-rtc,
.mgc-top .badge-ws {
  font-size: 8px;
  padding: 2px 6px;
}
.mgc-course {
  width: 100%;
  text-align: center;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #86efac;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mgc-hole-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 900;
  color: #e2e8f0;
}
.mgc-timer {
  font-size: clamp(22px, 4.6vh, 34px);
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: -0.02em;
}
.mgc-timer small {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 800;
}
.mgc-timerbar {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: #070b14;
  border: 1px solid rgba(255,255,255,0.12);
}
.mgc-timerbar > div {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #22c55e, #facc15, #ef4444);
  transition: width 0.12s linear;
}
.mgc-stats {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  font-size: 9px;
  font-weight: 800;
  color: #cbd5e1;
}
.mgc-stat {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 7px;
  background: rgba(2,6,23,0.55);
  border: 1px solid rgba(255,255,255,0.08);
  white-space: nowrap;
}
.mgc-stat strong {
  color: #86efac;
}
.mgc-power-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mgc-power-label {
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: uppercase;
}
.mgc-power-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: #070b14;
  border: 1px solid rgba(255,255,255,0.12);
}
.mgc-power-bar > div {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #22c55e, #facc15, #ef4444);
  transition: width 0.04s linear;
}
.mgc-map {
  width: 100%;
  height: auto;
  max-height: 31%;
  border-radius: 9px;
  background: #070b14;
  border: 1px solid rgba(255,255,255,0.1);
  display: block;
}
.mgc-phase {
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.2;
  color: #e2e8f0;
}
.mgc-right {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.mgc-putt-btn {
  flex: 1.6;
  position: relative;
  border: 1px solid rgba(134,239,172,0.8);
  border-radius: 18px;
  background: linear-gradient(180deg, #22c55e, #15803d);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-weight: 900;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 0 rgba(0,0,0,0.45);
  touch-action: none;
  transition: transform 0.06s ease, box-shadow 0.06s ease, filter 0.08s ease;
}
.mgc-putt-btn.pressed {
  transform: translateY(4px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 0 rgba(0,0,0,0.45);
  filter: brightness(1.15);
}
.mgc-putt-btn.busy {
  opacity: 0.38;
  filter: grayscale(0.65);
}
.mgc-putt-btn .mgc-putt-icon {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.mgc-putt-btn .mgc-putt-label {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.9;
}
.mgc-cancel-btn {
  flex: 0.7;
  border: 1px solid rgba(248,113,113,0.55);
  border-radius: 14px;
  background: linear-gradient(180deg, #7f1d1d, #450a0a);
  color: #fecaca;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  touch-action: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 0 rgba(0,0,0,0.45);
}
.mgc-cancel-btn.pressed {
  transform: translateY(3px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 0 rgba(0,0,0,0.45);
}
.mgc-cancel-btn.busy {
  opacity: 0.35;
  filter: grayscale(0.6);
}
.mgc-hint {
  font-size: 9px;
  line-height: 1.25;
  color: #64748b;
  text-align: center;
}
@media (orientation: landscape) and (max-height: 480px) {
  .mgc-gamepad { padding: 5px 9px; gap: 7px; }
  .mgc-center { padding: 5px; gap: 3px; }
  .mgc-timer { font-size: 21px; }
  .mgc-stats { font-size: 8px; }
  .mgc-map { max-height: 27%; }
  .mgc-phase { min-height: 17px; font-size: 9px; }
  .mgc-hint { display: none; }
  .mgc-putt-btn .mgc-putt-icon { font-size: 23px; }
}
`;
