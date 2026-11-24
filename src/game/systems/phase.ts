import type { GameState, Phase } from "../core/types";

// 시간 구간 규칙의 단일 출처.
// 방·시설·기반 시설 변경은 "정비 시간"에만 가능하다. 행동(탐사 등)은 오전/오후/야간에만 가능하다.
// 2단계에서 시간 진행이 추가되어도 이 함수만 통해 판단하므로 두 시스템이 충돌하지 않는다.

export const PHASE_NAMES: Record<Phase, string> = {
  morning: "오전",
  afternoon: "오후",
  night: "야간",
  maintenance: "정비 시간",
};

export function canModifyBase(state: GameState): boolean {
  return state.phase === "maintenance";
}

export const NOT_MAINTENANCE_REASON = "건설과 배치는 정비 시간에만 할 수 있습니다.";
