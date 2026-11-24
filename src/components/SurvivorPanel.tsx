"use client";

import { JOBS, SKILLS, SURVIVOR_RULES } from "@/game/config/survivors";
import type { GameState, Survivor } from "@/game/core/types";
import type { JobId } from "@/game/config/survivors";
import { canModifyBase } from "@/game/systems/phase";
import { bedCount, canAccept, planWork, population, STATUS_TEXT, survivorStatus } from "@/game/systems/survivors";
import type { GameAction } from "@/game/state/reducer";
import type { AskFn, Mode } from "./uiTypes";

interface Props {
  state: GameState;
  run: (a: GameAction, msg?: string) => void;
  setMode: (m: Mode) => void;
  ask: AskFn;
}

function Bar({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  // invert: 피로처럼 높을수록 나쁜 값
  const good = invert ? value < 50 : value > 60;
  const bad = invert ? value >= SURVIVOR_RULES.tiredAt : value < SURVIVOR_RULES.criticalHealth;
  return (
    <div className="mini-meter">
      <span className="mini-label">{label}</span>
      <div className="meter-track">
        <div className={`meter-fill ${bad ? "bad" : good ? "good" : "mid"}`} style={{ width: `${value}%` }} />
      </div>
      <span className="mini-val">{value}</span>
    </div>
  );
}

function Skills({ sv }: { sv: Survivor }) {
  return (
    <div className="skill-row">
      {SKILLS.map((sk) => (
        <span key={sk.id} className={`skill ${sv.skills[sk.id] >= 4 ? "high" : ""} ${sk.used ? "" : "unused"}`} title={sk.desc}>
          {sk.name} {sv.skills[sk.id]}
        </span>
      ))}
    </div>
  );
}

export default function SurvivorPanel({ state, run, setMode, ask }: Props) {
  const beds = bedCount(state);
  const pop = population(state);
  const plans = Object.fromEntries(planWork(state).map((p) => [p.survivorId, p]));
  const maint = canModifyBase(state);
  const hasDebrisWorker = state.survivors.some((s) => s.job === "debris");

  return (
    <div className="panel-body">
      <h3 className="panel-title">생존자</h3>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-val">{pop}</span>
          <span className="stat-label">인원</span>
        </div>
        <div className={`stat ${beds < pop ? "stat-warn" : ""}`}>
          <span className="stat-val">{beds}</span>
          <span className="stat-label">침상</span>
        </div>
        <div className="stat">
          <span className="stat-val">{pop}</span>
          <span className="stat-label">구간당 식량·식수</span>
        </div>
      </div>
      <p className="muted small-text">
        업무는 언제든 바꿀 수 있고, 각 구간이 끝날 때 결과가 나옵니다. 일하면 피로가 {SURVIVOR_RULES.workFatigue} 쌓이고, 휴식하면 {SURVIVOR_RULES.restRecovery} 풀립니다. 밤에는 침상에서 자야 많이
        회복합니다.
      </p>

      {state.pending.length > 0 && (
        <>
          <h4 className="section-title">새 생존자</h4>
          <ul className="sv-list">
            {state.pending.map((p, i) => {
              const acc = canAccept(state, i);
              return (
                <li key={p.survivor.id} className="sv-card pending">
                  <div className="sv-head">
                    <b>{p.survivor.name}</b>
                    <span className="muted">{p.survivor.age}세</span>
                    <span className="grow" />
                    <span className={`status-pill ${p.stage === "found" ? "st-noPowerLine" : "st-noFuel"}`}>
                      {p.stage === "found" ? `발견 · ${p.leavesAfterDay}일차까지 구조` : "입구에서 대기"}
                    </span>
                  </div>
                  <p className="small-text">{p.survivor.background}</p>
                  <Bar label="건강" value={p.survivor.health} />
                  <Skills sv={p.survivor} />
                  {p.stage === "found" ? (
                    <p className="muted small-text">낮에 '생존자 구조' 행동으로 데려오세요.</p>
                  ) : (
                    <>
                      <div className="btn-row">
                        <button className="btn primary" disabled={!acc.ok} onClick={() => run({ type: "ACCEPT_SURVIVOR", index: i }, `${p.survivor.name}을(를) 받아들였습니다.`)}>
                          수용
                        </button>
                        <button
                          className="btn ghost"
                          onClick={() => ask(`${p.survivor.name}을(를) 돌려보낼까요?`, () => run({ type: "DISMISS_SURVIVOR", index: i }, "돌려보냈습니다."), "돌려보내기")}
                        >
                          돌려보내기
                        </button>
                      </div>
                      {!acc.ok && <p className="warn-text small-text">{acc.reason}</p>}
                      {maint && <p className="muted small-text">오늘 정비 시간 안에 정하지 않으면 떠납니다.</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h4 className="section-title">거점 인원</h4>
      <ul className="sv-list">
        {state.survivors.map((sv) => {
          const st = survivorStatus(sv);
          const plan = plans[sv.id];
          return (
            <li key={sv.id} className={`sv-card ${sv.isPlayer ? "player" : ""}`}>
              <div className="sv-head">
                <b>{sv.name}</b>
                <span className="muted">{sv.isPlayer ? "플레이어" : `${sv.age}세`}</span>
                <span className="grow" />
                <span className={`status-pill sv-${st}`}>{STATUS_TEXT[st]}</span>
              </div>
              <p className="small-text muted">{sv.background}</p>
              <Bar label="건강" value={sv.health} />
              <Bar label="피로" value={sv.fatigue} invert />
              <Skills sv={sv} />
              {sv.isPlayer ? (
                <p className="muted small-text">행동 1회마다 피로 +{SURVIVOR_RULES.actionFatigue}. 피로 100이면 행동할 수 없습니다.</p>
              ) : (
                <>
                  <label className="job-row">
                    <span>업무</span>
                    <select
                      className="input compact"
                      value={sv.job}
                      onChange={(e) => run({ type: "SET_JOB", survivorId: sv.id, job: e.target.value as JobId }, `${sv.name}: ${JOBS.find((j) => j.id === e.target.value)?.name}`)}
                    >
                      {JOBS.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                          {j.skill ? ` (${SKILLS.find((k) => k.id === j.skill)?.name} ${sv.skills[j.skill]})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {plan && (
                    <p className={`small-text ${plan.blocked ? "warn-text" : ""}`}>
                      {plan.blocked ? plan.blocked : `구간 예상: ${plan.expect}`}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <h4 className="section-title">잔해 정리 지정</h4>
      <p className="muted small-text">
        '잔해 정리' 업무를 맡은 생존자는 지정한 잔해 중 통로와 맞닿은 칸부터 치웁니다. 지정은 언제든 무료입니다. 지정된 잔해: {state.debrisMarks.length}칸
      </p>
      <div className="btn-row">
        <button className={`btn ${hasDebrisWorker ? "primary" : ""}`} onClick={() => setMode({ kind: "markDebris", remove: false, anchor: null, rect: null, dragging: false })}>
          정리 지정
        </button>
        <button className="btn" disabled={!state.debrisMarks.length} onClick={() => setMode({ kind: "markDebris", remove: true, anchor: null, rect: null, dragging: false })}>
          지정 해제
        </button>
      </div>
      <p className="muted small-text">의료·농업·관리 능력은 의료실·농업실 등과 함께 이후 업데이트에서 쓰입니다.</p>
    </div>
  );
}
