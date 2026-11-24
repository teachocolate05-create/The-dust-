"use client";

import { RESOURCES } from "@/game/config/resources";
import { RULES } from "@/game/config/rules";
import type { GameState, ResourceId } from "@/game/core/types";
import { PHASE_NAMES } from "@/game/systems/phase";
import { forecastPhaseEnd, population } from "@/game/systems/time";

/** 지도 위 도구 줄에 들어가는 시간 진행 버튼 */
export function PhaseButton({ state, onClick }: { state: GameState; onClick: () => void }) {
  const maint = state.phase === "maintenance";
  return (
    <button className={`btn ${maint ? "primary" : "advance"}`} onClick={onClick}>
      {maint ? `${state.day + 1}일차 시작 ▶` : `${PHASE_NAMES[state.phase]} 종료 ▶`}
    </button>
  );
}

/** 진행 전 예상 변화와 경고를 보여 주는 확인 창 */
export function AdvanceModal({ state, onConfirm, onClose }: { state: GameState; onConfirm: () => void; onClose: () => void }) {
  const maint = state.phase === "maintenance";
  const f = forecastPhaseEnd(state);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="시간 진행" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{maint ? "정비 종료 · 다음 날 시작" : `${PHASE_NAMES[state.phase]} 종료`}</h2>
        </div>
        <p className="muted small-text">
          {state.day}일차 {PHASE_NAMES[state.phase]} → <b>{f.next.day}일차 {PHASE_NAMES[f.next.phase]}</b>
        </p>

        {maint ? (
          <>
            <p className="small-text">
              정비 시간을 마치고 {f.next.day}일차 오전을 시작합니다. 오전에는 행동 {RULES.actionsPerPhase}회가 주어지며, 건설·배치는 다시 야간이 끝난 뒤
              정비 시간에 할 수 있습니다.
            </p>
            <p className="muted small-text">하루 단위 처리(시설 유지비, 피로 누적 등)는 3·5단계에서 추가됩니다.</p>
          </>
        ) : (
          <>
            <h4 className="section-title">예상 자원 변화 (인원 {population(state)}명)</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>자원</th>
                  <th className="num">현재</th>
                  <th className="num">변화</th>
                  <th className="num">예상</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.filter((r) => r.kind === "stock").map((r) => {
                  const d = f.delta[r.id as ResourceId] ?? 0;
                  const after = f.after[r.id as ResourceId] ?? state.resources[r.id];
                  return (
                    <tr key={r.id} className={f.shortage[r.id as ResourceId] ? "row-bad" : ""}>
                      <td>
                        <span className={`res-dot res-${r.id}`} /> {r.name}
                      </td>
                      <td className="num">{state.resources[r.id]}</td>
                      <td className={`num ${d < 0 ? "neg" : d > 0 ? "pos" : "muted"}`}>{d === 0 ? "—" : d > 0 ? `+${d}` : d}</td>
                      <td className="num">{after}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted small-text">시설 생산·소비와 전력 계산은 3·4단계에서 이 표에 추가됩니다.</p>
            {f.warnings.length > 0 && (
              <ul className="warn-list">
                {f.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="btn-row end">
          <button className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" onClick={onConfirm}>
            {maint ? "다음 날 시작" : "진행"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ text, yesLabel, onYes, onClose }: { text: string; yesLabel: string; onYes: () => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="btn-row end">
          <button className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            className="btn danger"
            onClick={() => {
              onYes();
              onClose();
            }}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
