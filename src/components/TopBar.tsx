"use client";

import { RESOURCES } from "@/game/config/resources";
import type { GameState } from "@/game/core/types";
import { PHASE_NAMES } from "@/game/systems/phase";

interface Props {
  state: GameState;
  onOpenStatus: () => void;
  onNewGame: () => void;
}

const PHASE_ORDER = ["morning", "afternoon", "night", "maintenance"] as const;

export default function TopBar({ state, onOpenStatus, onNewGame }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-name">THE DUST</span>
        </div>
        <div className="clock">
          <span className="day">{state.day}일차</span>
          <ol className="phase-track" aria-label="시간 구간">
            {PHASE_ORDER.map((ph) => (
              <li key={ph} className={ph === state.phase ? "active" : ""}>
                {PHASE_NAMES[ph]}
              </li>
            ))}
          </ol>
        </div>
        <div className="top-actions">
          <button className="btn ghost small" onClick={onOpenStatus}>
            개발 현황
          </button>
          <button className="btn ghost small" onClick={onNewGame}>
            새 게임
          </button>
        </div>
      </div>
      <div className="resource-strip" role="list" aria-label="자원">
        {RESOURCES.map((r) => (
          <div key={r.id} role="listitem" className={`res-chip res-${r.id}`} title={r.desc}>
            <span className="res-icon" aria-hidden>
              {r.short}
            </span>
            <span className="res-name">{r.name}</span>
            {r.kind === "stock" ? (
              <span className="res-val">{state.resources[r.id]}</span>
            ) : (
              <span className="res-val muted" title="전력 계산은 4단계에서 구현됩니다">
                미계산
              </span>
            )}
          </div>
        ))}
      </div>
    </header>
  );
}
