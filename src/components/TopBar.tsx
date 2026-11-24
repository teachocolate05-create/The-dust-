"use client";

import { RESOURCES } from "@/game/config/resources";
import type { GameState, ResourceId } from "@/game/core/types";
import type { PhaseForecast } from "@/game/systems/time";
import { PHASE_NAMES } from "@/game/systems/phase";
import { RULES } from "@/game/config/rules";
import { bedCount, population } from "@/game/systems/survivors";

interface Props {
  state: GameState;
  cap: Record<ResourceId, number>;
  forecast: PhaseForecast;
  onOpenStatus: () => void;
  onNewGame: () => void;
}

const PHASE_ORDER = ["morning", "afternoon", "night", "maintenance"] as const;

export default function TopBar({ state, cap, forecast, onOpenStatus, onNewGame }: Props) {
  // 부족하거나 곧 바닥날 자원은 붉게 표시
  const low = new Set(
    (Object.keys(state.resources) as ResourceId[]).filter((k) => {
      const d = forecast.delta[k] ?? 0;
      return forecast.shortage[k] || (d < 0 && forecast.after[k] < -d * RULES.lowStockPeriods);
    }),
  );
  const { supply, demand, used } = forecast.sim.power;
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
          {state.phase !== "maintenance" && (
            <span className="pips" title="이번 구간 남은 행동">
              {Array.from({ length: RULES.actionsPerPhase }, (_, i) => (
                <i key={i} className={i < state.actionsLeft ? "pip on" : "pip"} />
              ))}
            </span>
          )}
        </div>
        <span className="pop-chip" title="인원 / 침상">
          인원 <b>{population(state)}</b>
          <span className="muted">/침상 {bedCount(state)}</span>
        </span>
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
          <div
            key={r.id}
            role="listitem"
            className={`res-chip res-${r.id} ${low.has(r.id) || (r.kind === "stock" && state.resources[r.id] === 0) ? "low" : ""} ${
              r.kind === "flow" && used < demand ? "low" : ""
            }`}
            title={r.desc}
          >
            <span className="res-icon" aria-hidden>
              {r.short}
            </span>
            <span className="res-name">{r.name}</span>
            {r.kind === "stock" ? (
              <span className="res-val">
                {state.resources[r.id]}
                <span className="res-cap">/{cap[r.id]}</span>
                {(forecast.delta[r.id] ?? 0) !== 0 && (
                  <span className={`res-delta ${(forecast.delta[r.id] ?? 0) > 0 ? "pos" : "neg"}`}>
                    {(forecast.delta[r.id] ?? 0) > 0 ? "+" : ""}
                    {forecast.delta[r.id]}
                  </span>
                )}
              </span>
            ) : (
              <span className="res-val" title={`발전량 ${supply} / 필요량 ${demand}`}>
                {used}
                <span className="res-cap">/{supply}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </header>
  );
}
