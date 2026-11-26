export const POKER_CSS = `
.pk-stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 40%, #0e2a23 0%, #060e16 78%);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
}

.pk-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  background: rgba(6, 12, 22, 0.78);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.pk-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 270px;
  gap: 16px;
  padding: 16px 20px;
}

.pk-table-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-width: 0;
}

.pk-felt {
  width: min(760px, 100%);
  padding: 24px 28px;
  border-radius: 999px;
  background: radial-gradient(ellipse at center, #146b4b 0%, #0b4631 72%, #072e20 100%);
  border: 10px solid #3f2718;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.45), 0 22px 55px rgba(0, 0, 0, 0.65);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.pk-pot-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 18px;
  border-radius: 999px;
  background: rgba(6, 12, 22, 0.72);
  border: 1px solid rgba(250, 204, 21, 0.5);
  font-size: 16px;
  font-weight: 900;
  color: #fde047;
}

.pk-community-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 88px;
}

.pk-card {
  width: 60px;
  height: 86px;
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  border: 2px solid #e2e8f0;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  line-height: 1;
}

.pk-card.red {
  color: #dc2626;
}

.pk-card.back {
  background: linear-gradient(135deg, #1e3a8a, #0f172a);
  border-color: rgba(148, 163, 184, 0.45);
  color: rgba(255, 255, 255, 0.45);
  font-size: 20px;
}

.pk-card.empty {
  background: rgba(255, 255, 255, 0.08);
  border: 2px dashed rgba(255, 255, 255, 0.2);
  box-shadow: none;
}

.pk-card-rank {
  font-size: 20px;
}

.pk-card-suit {
  font-size: 22px;
  margin-top: 2px;
}

.pk-seats-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.pk-seat {
  background: rgba(11, 17, 32, 0.88);
  border: 2px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.pk-seat.turn {
  border-color: #facc15;
  box-shadow: 0 0 20px rgba(250, 204, 21, 0.3);
  transform: translateY(-2px);
}

.pk-seat.folded {
  opacity: 0.48;
}

.pk-seat.out {
  opacity: 0.35;
  filter: grayscale(0.8);
}

.pk-seat-top {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
}

.pk-seat-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.pk-badge {
  font-size: 10px;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.pk-badge.dealer {
  background: #facc15;
  color: #0f172a;
}

.pk-badge.allin {
  background: #ef4444;
  color: #fff;
}

.pk-mini-cards {
  display: flex;
  gap: 6px;
}

.pk-mini-card {
  width: 34px;
  height: 46px;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.pk-mini-card.red {
  color: #dc2626;
}

.pk-mini-card.back {
  background: linear-gradient(135deg, #1e3a8a, #0f172a);
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: rgba(255, 255, 255, 0.5);
}

.pk-sidebar {
  background: rgba(11, 17, 32, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.pk-log {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.pk-log-item {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

/* Mobile Controller */
.pk-ctrl {
  display: grid;
  grid-template-columns: 1.05fr 1fr 1.15fr;
  gap: 10px;
  padding: 10px;
  height: 100%;
  background: radial-gradient(circle at 50% 25%, #0e2a23 0%, #070b14 80%);
}

.pk-ctrl-panel {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.pk-ctrl-cards {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  margin: 4px 0;
}

.pk-ctrl-card {
  width: 64px;
  height: 92px;
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  border: 2px solid #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

.pk-ctrl-card.red {
  color: #dc2626;
}

.pk-ctrl-card.hidden {
  background: linear-gradient(135deg, #1e3a8a, #0f172a);
  color: rgba(255, 255, 255, 0.55);
  border-color: rgba(148, 163, 184, 0.4);
  font-size: 24px;
}

.pk-ctrl-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  flex: 1;
}

.pk-action-btn {
  border: none;
  border-radius: 12px;
  font-weight: 900;
  font-size: 13px;
  color: #fff;
  cursor: pointer;
  padding: 10px 8px;
}

.pk-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pk-action-btn.call {
  background: linear-gradient(180deg, #22c55e, #15803d);
}

.pk-action-btn.raise {
  background: linear-gradient(180deg, #f59e0b, #b45309);
}

.pk-action-btn.allin {
  background: linear-gradient(180deg, #8b5cf6, #6d28d9);
}

.pk-action-btn.fold {
  background: linear-gradient(180deg, #ef4444, #991b1b);
}
`;
