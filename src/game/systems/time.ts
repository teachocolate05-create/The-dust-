// 시간 진행 시스템: 구간 종료 계산, 정비 시간 진입, 다음 날 시작.
// forecast*() 함수는 진행 전 예상치를 보여 주고, 실제 진행 함수도 같은 계산을 사용한다.

import { RESOURCE_BY_ID } from "../config/resources";
import { RULES } from "../config/rules";
import type { GameState, LogEntry, ResourceBundle, ResourceId } from "../core/types";
import { isDayPhase, nextPhase, PHASE_NAMES } from "./phase";

/** 현재 거점 인원. 생존자 영입은 5단계에서 추가되며, 지금은 플레이어 1명이다. */
export function population(_state: GameState): number {
  return 1;
}

export interface PhaseForecast {
  /** 이번 구간 종료 시 자원 변화 (음수 = 소비) */
  delta: ResourceBundle;
  /** 변화 후 예상 보유량 */
  after: Partial<Record<ResourceId, number>>;
  /** 실제로 부족한 양 (보유량보다 많이 소비해야 하는 경우) */
  shortage: ResourceBundle;
  warnings: string[];
  /** 구간 종료 후 시간 */
  next: { day: number; phase: GameState["phase"] };
}

export function forecastPhaseEnd(state: GameState): PhaseForecast {
  const warnings: string[] = [];
  const delta: ResourceBundle = {};
  const after: PhaseForecast["after"] = {};
  const shortage: ResourceBundle = {};

  if (isDayPhase(state.phase)) {
    const people = population(state);
    for (const [k, perPerson] of Object.entries(RULES.upkeepPerPerson) as [ResourceId, number][]) {
      const use = perPerson * people;
      delta[k] = -use;
      const left = state.resources[k] - use;
      after[k] = Math.max(0, left);
      if (left < 0) {
        shortage[k] = -left;
        warnings.push(`${RESOURCE_BY_ID[k].name}이(가) ${-left} 부족합니다. 배급을 받지 못합니다.`);
      } else if (left < use * RULES.lowStockPeriods) {
        warnings.push(`${RESOURCE_BY_ID[k].name}이(가) 얼마 남지 않았습니다. (구간 종료 후 ${left})`);
      }
    }
    if (state.actionsLeft > 0) warnings.push(`사용하지 않은 행동 ${state.actionsLeft}회는 사라집니다.`);
    if (state.phase === "night") warnings.push("야간이 끝나면 정비 시간이 시작됩니다.");
  }

  const np = nextPhase(state.phase);
  return { delta, after, shortage, warnings, next: { day: np === "morning" ? state.day + 1 : state.day, phase: np } };
}

function addLog(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

/** 오전·오후·야간 구간을 끝낸다. (정비 시간에는 startNextDay 사용) */
export function endPhase(state: GameState): GameState {
  if (!isDayPhase(state.phase)) return state;
  const f = forecastPhaseEnd(state);

  const resources = { ...state.resources };
  for (const k of Object.keys(f.delta) as ResourceId[]) resources[k] = Math.max(0, resources[k] + (f.delta[k] ?? 0));

  const used = Object.entries(f.delta)
    .map(([k, v]) => `${RESOURCE_BY_ID[k as ResourceId].name} ${-(v ?? 0)}`)
    .join(", ");
  let s: GameState = { ...state, resources };
  s = addLog(s, `${PHASE_NAMES[state.phase]} 종료 — 소비: ${used}`);
  for (const k of Object.keys(f.shortage) as ResourceId[])
    s = addLog(s, `${RESOURCE_BY_ID[k].name} 부족! 제대로 먹고 마시지 못했다. (건강 영향은 5단계에서 적용)`, "warn");

  const np = nextPhase(state.phase);
  s = { ...s, phase: np, actionsLeft: np === "maintenance" ? 0 : RULES.actionsPerPhase };
  if (np === "maintenance") s = addLog(s, "하루 일과가 끝났다. 정비 시간 — 거점을 정리하고 내일을 준비한다.");
  return s;
}

/** 정비 시간을 끝내고 다음 날 오전을 시작한다. 하루 단위 처리는 이후 단계에서 여기에 추가한다. */
export function startNextDay(state: GameState): GameState {
  if (state.phase !== "maintenance") return state;
  const s: GameState = { ...state, day: state.day + 1, phase: "morning", actionsLeft: RULES.actionsPerPhase };
  return addLog(s, `${s.day}일차 아침이 밝았다.`);
}
