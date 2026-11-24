import { createInitialState } from "@/game/state/initialState";
import type { GameState } from "@/game/core/types";

/**
 * 규칙 테스트용: 시작 맵의 잔해를 모두 치운 상태.
 * 열린 맵 좌표: 1~11행 바닥 (기둥 (7,3)(21,3)(7,7)(14,7)(21,7), 급수원 (1,9)), 12~13행 승강장
 * 시작 방: 임시 거주 구역 (12,3,3,3) 침상 (12,3) / 비상 발전실 (3,9,4,3) 발전기 (4,10) / 옛 창고 (22,4,3,2) 선반 (22,4)
 */
export function opened(seed = 1): GameState {
  const s = createInitialState(seed);
  return { ...s, map: s.map.map((row) => row.map((t) => (t === "debris" ? "floor" : t))) };
}

export const toMaintenance = (s: GameState): GameState => ({ ...s, phase: "maintenance", actionsLeft: 0 });
export const toMorning = (s: GameState): GameState => ({ ...s, phase: "morning", actionsLeft: 3 });
export const rich = (s: GameState): GameState => ({ ...s, resources: { ...s.resources, materials: 55, parts: 15, fuel: 15 } });
