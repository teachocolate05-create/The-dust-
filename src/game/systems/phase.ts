import type { GameState, Phase } from "../core/types";

// 시간 구간 규칙의 단일 출처.
//  - 오전/오후/야간(낮 구간): 행동만 가능 (구간당 최대 3회), 건설·배치 불가
//  - 정비 시간: 건설·배치·관리만 가능, 행동 불가 (행동 횟수 소비 없음)
// 건설 시스템과 행동 시스템은 모두 이 파일의 함수로만 판단하므로 서로 충돌하지 않는다.

export const PHASE_NAMES: Record<Phase, string> = {
  morning: "오전",
  afternoon: "오후",
  night: "야간",
  maintenance: "정비 시간",
};

/** 낮 구간 순서. 야간 다음은 정비 시간, 정비 시간 다음은 다음 날 오전 */
export const DAY_PHASES: Phase[] = ["morning", "afternoon", "night"];

export function isDayPhase(phase: Phase): boolean {
  return phase !== "maintenance";
}

export function nextPhase(phase: Phase): Phase {
  if (phase === "morning") return "afternoon";
  if (phase === "afternoon") return "night";
  if (phase === "night") return "maintenance";
  return "morning";
}

export function canModifyBase(state: GameState): boolean {
  return state.phase === "maintenance";
}

export const NOT_MAINTENANCE_REASON = "건설과 배치는 정비 시간에만 할 수 있습니다.";
