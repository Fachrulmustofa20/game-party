export const LUDO_CSS = `
.ld3-stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 35%, #16243f 0%, #070b14 80%);
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
  color: #f8fafc;
}

.ld3-topbar {
  position: absolute;
  top: 12px;
  left: 14px;
  right: 14px;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.ld3-topbar > * {
  pointer-events: auto;
}

.ld3-sidebar {
  position: absolute;
  top: 64px;
  right: 14px;
  width: 240px;
  z-index: 20;
  background: rgba(8, 12, 23, 0.78);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.ld3-player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1.5px solid transparent;
  font-size: 12px;
  font-weight: 800;
}

.ld3-player-row.turn {
  border-color: #facc15;
  background: rgba(250, 204, 21, 0.12);
}

/* Mobile Controller */
.ld3-ctrl {
  display: grid;
  grid-template-columns: 0.85fr 0.75fr 1.65fr;
  align-items: stretch;
  gap: 10px;
  padding: 8px;
  width: 100%;
  height: 100%;
  min-height: 100%;
  background: radial-gradient(circle at 50% 25%, #16243f 0%, #070b14 80%);
}

.ld3-ctrl-panel {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.ld3-ctrl-panel-action {
  padding: 8px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.ld3-ctrl-panel-action.active {
  border-color: rgba(250, 204, 21, 0.65);
  box-shadow: 0 0 24px rgba(250, 204, 21, 0.16);
}

.ld3-pawn-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  justify-content: center;
}

.ld3-pawn-pill {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 800;
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.ld3-roll-btn {
  width: 100%;
  height: 100%;
  min-height: 110px;
  flex: 1;
  border: none;
  border-radius: 18px;
  background: linear-gradient(180deg, #22c55e, #15803d);
  color: #052e16;
  font-size: clamp(20px, 3.4vw, 28px);
  font-weight: 900;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 22px rgba(34, 197, 94, 0.35);
  cursor: pointer;
  transition: transform 0.1s ease, opacity 0.15s ease;
}

.ld3-roll-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.ld3-roll-btn:disabled {
  opacity: 0.35;
  box-shadow: none;
  cursor: not-allowed;
}

.ld3-pawn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
  width: 100%;
  height: 100%;
  flex: 1;
}

.ld3-pawn-btn {
  width: 100%;
  height: 100%;
  min-height: 64px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(180deg, #f59e0b, #b45309);
  color: #fff;
  font-size: clamp(16px, 2.7vw, 22px);
  font-weight: 900;
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.32);
  cursor: pointer;
  transition: transform 0.1s ease, opacity 0.15s ease;
}

.ld3-pawn-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.ld3-pawn-btn:disabled {
  opacity: 0.3;
  box-shadow: none;
  cursor: not-allowed;
}
`;
