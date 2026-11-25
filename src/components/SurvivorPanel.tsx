"use client";

import { JOBS, SKILLS, SURVIVOR_RULES } from "@/game/config/survivors";
import type { GameState, Survivor } from "@/game/core/types";
import type { JobId } from "@/game/config/survivors";
import { canModifyBase } from "@/game/systems/phase";
import { bedCount, canAccept, planWork, population, STATUS_TEXT, survivorStatus, xpNeeded } from "@/game/systems/survivors";
import type { GameAction } from "@/game/state/reducer";
import type { AskFn, Mode } from "./uiTypes";
import { useState } from "react";
import { RECIPES } from "@/game/config/actions";
import { bundleText } from "@/game/core/resources";
import { canFeast, feastCost } from "@/game/systems/world";
import { REGION_BY_ID, WORLD_RULES, type RegionId } from "@/game/config/world";
import { CostTag } from "./Panels";
import { LIFE_RULES, MEDICINE, TRAIT_BY_ID } from "@/game/config/life";
import { closest, conditionName, moraleLabel } from "@/game/systems/life";

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

/** 특성: 눌러서 설명 보기 (모바일에서도 확인 가능) */
function Traits({ sv }: { sv: Survivor }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!sv.traits.length) return null;
  const def = open ? TRAIT_BY_ID[open as keyof typeof TRAIT_BY_ID] : null;
  return (
    <>
      <div className="skill-row">
        {sv.traits.map((t) => (
          <button
            key={t}
            type="button"
            className={`trait ${open === t ? "on" : ""}`}
            aria-expanded={open === t}
            onClick={() => setOpen(open === t ? null : t)}
          >
            {TRAIT_BY_ID[t].name} <span aria-hidden>ⓘ</span>
          </button>
        ))}
      </div>
      {def && (
        <div className="trait-info" role="note">
          <b>{def.name}</b> — {def.desc}
        </div>
      )}
    </>
  );
}

function Conditions({ sv }: { sv: Survivor }) {
  if (!sv.conditions.length) return null;
  return (
    <div className="skill-row">
      {sv.conditions.map((c) => (
        <span key={c.kind} className={`cond cond-${c.kind}`} title={c.kind === "injury" ? "부상: 외부 일 불가, 효율 절반" : "질병: 효율 절반, 구간마다 건강 감소"}>
          {c.kind === "injury" ? "부상" : "질병"} · {conditionName(c)}
        </span>
      ))}
    </div>
  );
}

function Skills({ sv }: { sv: Survivor }) {
  return (
    <div className="skill-row">
      {SKILLS.map((sk) => (
        <span key={sk.id} className={`skill ${sv.skills[sk.id] >= 4 ? "high" : ""} ${sk.used ? "" : "unused"}`} title={sk.desc}>
          {sk.name} {sv.skills[sk.id]}
          {sv.skills[sk.id] >= 5 ? " ★" : sv.xp?.[sk.id] ? <span className="xp"> ({sv.xp[sk.id]}/{xpNeeded(sv.skills[sk.id])})</span> : null}
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
  const others = state.survivors.filter((s) => !s.isPlayer);
  const avgMorale = others.length ? Math.round(others.reduce((n, s) => n + s.morale, 0) / others.length) : null;
  const patients = state.survivors.filter((s) => s.conditions.length).length;
  const feastChk = canFeast(state);

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
        <div className={`stat ${avgMorale !== null && avgMorale < LIFE_RULES.lowMorale ? "stat-warn" : ""}`}>
          <span className="stat-val">{avgMorale ?? "—"}</span>
          <span className="stat-label">평균 사기</span>
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
                  <Traits sv={p.survivor} />
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

      <p className="small-text">
        의약품 <b>{state.medicine}</b>개 <span className="muted">— 밖에서 행동하거나 원정에서 돌아올 때 5% 확률로 발견 (하루 최대 {MEDICINE.dailyMax}개). 언제든 써서 건강 +{MEDICINE.heal}.</span>
      </p>
      <p className="muted small-text">건강이 0이 되면 생존자는 숨지고, 남은 사람들의 사기가 1~5 떨어집니다.</p>
      {patients > 0 && (
        <div className="alert warn">
          부상·질병 {patients}명. 쉬게 하면 대체로 하루 사이 낫고, '치료' 업무를 맡기면 더 빨리 낫습니다. 의료실(진료 침대·약품 선반)이 있으면 치료가 잘 됩니다.
        </div>
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
              <Traits sv={sv} />
              <Conditions sv={sv} />
              <Bar label="건강" value={sv.health} />
              <Bar label="피로" value={sv.fatigue} invert />
              {!sv.isPlayer && <Bar label="사기" value={sv.morale} />}
              {state.medicine > 0 && sv.health < 100 && (
                <div className="btn-row">
                  <button className="btn small" onClick={() => run({ type: "USE_MEDICINE", survivorId: sv.id }, `의약품 사용 · 건강 +${MEDICINE.heal}`)}>
                    의약품 쓰기 (건강 +{MEDICINE.heal})
                  </button>
                  <span className="muted small-text">남은 의약품 {state.medicine}</span>
                </div>
              )}
              {!sv.isPlayer && (
                <p className="small-text muted">
                  {moraleLabel(sv.morale)}
                  {(() => {
                    const { friend, rival } = closest(state, sv.id);
                    return (
                      <>
                        {friend && <span className="rel rel-friend"> · 친구: {friend.name}</span>}
                        {rival && <span className="rel rel-rival"> · 앙숙: {rival.name}</span>}
                      </>
                    );
                  })()}
                </p>
              )}
              <Skills sv={sv} />
              {sv.isPlayer ? (
                <p className="muted small-text">
                  행동 1회마다 피로 +{SURVIVOR_RULES.actionFatigue}. 피로 100이면 '휴식' 말고는 행동할 수 없습니다. 행동 탭의 '휴식'으로 피로를 풀고 건강을 조금
                  회복할 수 있습니다.
                </p>
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
                  {sv.job === "heal" && (
                    <label className="job-row">
                      <span>환자</span>
                      <select
                        className="input compact"
                        value={sv.healTarget ?? ""}
                        onChange={(e) => run({ type: "SET_HEAL_TARGET", survivorId: sv.id, targetId: e.target.value || null }, "치료 대상을 정했습니다.")}
                      >
                        <option value="">자동 (가장 심한 환자)</option>
                        {state.survivors.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.isPlayer ? "나" : p.name}
                            {p.conditions.length ? ` — ${p.conditions.map((c) => conditionName(c)).join(", ")}` : " (아픈 곳 없음)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
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

      {others.length > 0 && (
        <>
          <h4 className="section-title">사기 올리기</h4>
          <div className="btn-row">
            <button className="btn" disabled={!feastChk.ok} onClick={() => run({ type: "FEAST" }, `특별 배급! 모두 사기 +${WORLD_RULES.feast}`)}>
              특별 배급 (사기 +{WORLD_RULES.feast})
            </button>
            <CostTag bundle={feastCost(state)} have={state.resources} />
          </div>
          {!feastChk.ok && <p className="muted small-text">{feastChk.reason}</p>}
          <p className="muted small-text">
            정비 시간에 하루 한 번. 낮에는 '행동 → 격려하기'(행동 1, 사기 +{WORLD_RULES.encourage})로도 올릴 수 있습니다. 공동 생활실 식탁·조리대도 사기에 도움이 됩니다.
          </p>
        </>
      )}

      {state.world.expeditions.length > 0 && (
        <>
          <h4 className="section-title">원정 중</h4>
          <ul className="list">
            {state.world.expeditions.flatMap((e) =>
              e.members.map((m) => (
                <li key={m.id} className="list-item static">
                  <span className="grow">{m.name}</span>
                  <span className="muted small-text">
                    {REGION_BY_ID[e.regionId as RegionId].name} · {e.daysLeft}일 뒤 귀환
                  </span>
                </li>
              )),
            )}
          </ul>
        </>
      )}

      <h4 className="section-title">제작 업무 품목</h4>
      <label className="job-row">
        <span>만들 것</span>
        <select
          className="input compact"
          value={state.craftTarget}
          onChange={(e) => run({ type: "SET_CRAFT_TARGET", target: e.target.value as GameState["craftTarget"] }, "제작 품목을 바꿨습니다.")}
        >
          {RECIPES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({bundleText(r.input)} → {bundleText(r.output)})
            </option>
          ))}
        </select>
      </label>
      <p className="muted small-text">'제작' 업무를 맡은 생존자가 구간마다 이 품목을 하나씩 만듭니다. 전력이 들어오는 작업대가 필요합니다.</p>

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
      <p className="muted small-text">
        숙련: 같은 업무를 계속하면 그 능력치가 오릅니다 (괄호 안은 다음 단계까지 남은 작업 구간, ★ = 전문가). 사기: 쉬면 오르고, 일하거나 굶거나 아프면 떨어집니다. 30 미만이면 효율이 떨어지고, 15 미만이면 밤사이 떠날 수 있습니다. 같은 일을 하는 사람끼리 친해지고, 친구가 있으면 사기가 오릅니다.
      </p>
      <p className="muted small-text">관리 능력은 이후 업데이트에서 쓰입니다.</p>
    </div>
  );
}
