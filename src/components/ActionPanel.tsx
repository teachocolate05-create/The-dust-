"use client";

import { ACTIONS, ACTION_RULES, RECIPES, type ActionCategory, type ActionDef } from "@/game/config/actions";
import { RULES } from "@/game/config/rules";
import type { GameState } from "@/game/core/types";
import { canDoAction } from "@/game/systems/actions";
import { isDayPhase, PHASE_NAMES } from "@/game/systems/phase";
import type { GameAction } from "@/game/state/reducer";
import { CostTag } from "./Panels";
import type { Mode, Selection } from "./uiTypes";

interface Props {
  state: GameState;
  selection: Selection;
  setMode: (m: Mode) => void;
  run: (a: GameAction, msg?: string) => void;
}

const CATEGORIES: ActionCategory[] = ["탐사", "생존", "구조", "작업"];

export default function ActionPanel({ state, selection, setMode, run }: Props) {
  const day = isDayPhase(state.phase);
  const last = state.lastAction;

  const onAction = (a: ActionDef) => {
    if (a.needsTarget === "debris") {
      setMode({ kind: "clearDebris", pos: null });
      return;
    }
    if (a.needsTarget === "facility") return; // 시설 패널의 '직접 수리' 버튼으로 실행
    run({ type: "DO_ACTION", actionId: a.id });
  };

  return (
    <div className="panel-body">
      <div className="panel-title-row spread">
        <h3 className="panel-title">행동</h3>
        {day && (
          <span className="pips" aria-label={`남은 행동 ${state.actionsLeft}회`}>
            {Array.from({ length: RULES.actionsPerPhase }, (_, i) => (
              <i key={i} className={i < state.actionsLeft ? "pip on" : "pip"} />
            ))}
            <span className="muted"> {state.actionsLeft}/{RULES.actionsPerPhase}</span>
          </span>
        )}
      </div>

      {!day ? (
        <div className="alert warn">
          지금은 <b>정비 시간</b>입니다. 행동 횟수를 쓰지 않고 건설·배치를 할 수 있습니다. 행동은 &lsquo;다음 날 시작&rsquo; 후 오전부터 가능합니다.
        </div>
      ) : (
        <p className="muted small-text">
          {PHASE_NAMES[state.phase]} 구간 · 행동 1회마다 횟수 1 소비 · 남은 횟수는 다음 구간으로 이월되지 않습니다.
          {state.phase === "night" && ` 야간 외부 활동은 효율 ${Math.round(ACTION_RULES.nightOutsideRate * 100)}%.`}
        </p>
      )}

      {last && (
        <div className="result-card" key={last.serial}>
          <div className="result-head">최근 결과 · {last.actionName}</div>
          <div>{last.text}</div>
          <div className="btn-row">
            {Object.keys(last.gained).length > 0 && <CostTag bundle={last.gained} label="획득" />}
            {Object.keys(last.spent).length > 0 && <CostTag bundle={last.spent} label="사용" />}
          </div>
        </div>
      )}

      {state.survivors.length > 1 && (
        <p className="muted small-text">생존자의 일은 '생존자' 탭에서 업무로 배정합니다. 여기 행동은 플레이어가 직접 하는 일입니다.</p>
      )}
      {CATEGORIES.map((cat) => (
        <div key={cat}>
          <h4 className="section-title">{cat}</h4>
          <ul className="card-list">
            {ACTIONS.filter((a) => a.category === cat).map((a) => {
              const chk = a.needsTarget ? null : canDoAction(state, a.id);
              let disabled = !a.implemented || !day || state.actionsLeft <= 0;
              let note: string;
              if (!a.implemented) note = `${a.plannedStage}단계 구현 예정`;
              else if (a.needsTarget === "debris") note = "지도에서 잔해 선택";
              else if (a.needsTarget === "facility") {
                note =
                  selection?.kind === "facility"
                    ? "선택한 시설 패널에서 실행"
                    : "지도에서 시설을 선택한 뒤 실행";
                disabled = true;
              } else note = chk && chk.ok ? chk.preview : chk ? chk.reason : "";
              if (a.needsTarget === "recipe") {
                const base = canDoAction(state, "craft");
                const noBench = !base.ok && base.reason.startsWith("전력이 들어오는 작업대");
                return (
                  <li key={a.id}>
                    <div className={`card action-card static ${!day || state.actionsLeft <= 0 ? "dim" : ""}`}>
                      <span className="card-main">
                        <span className="card-title">{a.name}</span>
                        <span className="card-desc">{a.desc}</span>
                        {noBench || !day || state.actionsLeft <= 0 ? (
                          <span className="card-note">{base.ok ? "" : base.reason}</span>
                        ) : (
                          <span className="recipe-row">
                            {RECIPES.map((rc) => {
                              const c = canDoAction(state, "craft", { kind: "recipe", recipeId: rc.id });
                              return (
                                <button
                                  key={rc.id}
                                  className="btn small"
                                  disabled={!c.ok}
                                  title={c.ok ? "" : c.reason}
                                  onClick={() => run({ type: "DO_ACTION", actionId: "craft", target: { kind: "recipe", recipeId: rc.id } })}
                                >
                                  {rc.name}
                                  <CostTag bundle={rc.input} have={state.resources} />→ <CostTag bundle={rc.output} />
                                </button>
                              );
                            })}
                          </span>
                        )}
                      </span>
                      <span className="card-side">행동 1</span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={a.id}>
                  <button className={`card action-card ${a.implemented ? "" : "planned"}`} disabled={disabled} onClick={() => onAction(a)}>
                    <span className="card-main">
                      <span className="card-title">
                        {a.name}
                        {a.outside && <span className="tag">외부</span>}
                      </span>
                      <span className="card-desc">{a.desc}</span>
                      <span className={`card-note ${a.implemented ? "" : "muted"}`}>{note}</span>
                    </span>
                    {a.implemented && !a.needsTarget && <span className="card-side">행동 1</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
