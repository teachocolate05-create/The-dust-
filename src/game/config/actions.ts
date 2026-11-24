// 행동 정의 (기획서 3-3). 수치는 여기서 조정한다.
import type { ResourceId } from "../core/types";

export type ActionId =
  | "explore"
  | "scavenge"
  | "survey"
  | "forage"
  | "clearThreat"
  | "searchSurvivor"
  | "rescue"
  | "repair"
  | "craft"
  | "clearDebris";

export type ActionCategory = "탐사" | "생존" | "구조" | "작업";

/** [최소, 최대] 범위의 무작위 획득량 */
export type YieldTable = Partial<Record<ResourceId, [number, number]>>;

export interface ActionDef {
  id: ActionId;
  name: string;
  category: ActionCategory;
  desc: string;
  /** 거점 밖에서 하는 행동인지 (야간 효율 감소 대상) */
  outside: boolean;
  /** false면 아직 구현되지 않은 행동 (화면에 예정 단계 표시) */
  implemented: boolean;
  plannedStage?: number;
  /** 지도에서 대상을 골라야 하는 행동 */
  needsTarget?: "debris" | "facility" | "recipe";
  yields?: YieldTable;
}

export const ACTIONS: ActionDef[] = [
  {
    id: "explore",
    name: "주변 탐색",
    category: "탐사",
    desc: "역 주변을 둘러본다. 무엇을 찾을지는 운에 달렸다.",
    outside: true,
    implemented: true,
  },
  {
    id: "scavenge",
    name: "자원 수집",
    category: "탐사",
    desc: "가까운 폐허에서 쓸 만한 자재와 부품을 모은다.",
    outside: true,
    implemented: true,
    yields: { materials: [3, 6], parts: [0, 2], fuel: [0, 1] },
  },
  { id: "survey", name: "장소 조사", category: "탐사", desc: "발견한 장소의 상태를 확인한다.", outside: true, implemented: false, plannedStage: 6 },
  {
    id: "forage",
    name: "식량 확보",
    category: "생존",
    desc: "버려진 상점과 집에서 먹을 것과 마실 물을 찾는다.",
    outside: true,
    implemented: true,
    yields: { food: [2, 4], water: [1, 3] },
  },
  { id: "clearThreat", name: "위험 제거", category: "생존", desc: "거점 주변의 위협을 제거한다.", outside: true, implemented: false, plannedStage: 6 },
  {
    id: "searchSurvivor",
    name: "생존자 수색",
    category: "구조",
    desc: "주변을 돌며 다른 생존자의 흔적을 찾는다. 발견하면 구조할 수 있다.",
    outside: true,
    implemented: true,
  },
  {
    id: "rescue",
    name: "생존자 구조",
    category: "구조",
    desc: "발견한 생존자를 거점 입구까지 데려온다. 수용 여부는 정비 시간에 정한다.",
    outside: true,
    implemented: true,
  },
  {
    id: "clearDebris",
    name: "잔해 정리",
    category: "작업",
    desc: "통로와 맞닿은 잔해 1칸을 치워 바닥으로 만든다. 쓸 만한 자재 1을 건진다.",
    outside: false,
    implemented: true,
    needsTarget: "debris",
  },
  {
    id: "repair",
    name: "직접 수리",
    category: "작업",
    desc: "부품을 써서 시설의 내구도를 직접 회복한다.",
    outside: false,
    implemented: true,
    needsTarget: "facility",
  },
  {
    id: "craft",
    name: "직접 제작",
    category: "작업",
    desc: "전력이 들어오는 작업대에서 자재를 가공해 필요한 물품을 만든다.",
    outside: false,
    implemented: true,
    needsTarget: "recipe",
  },
];

export type RecipeId = "parts" | "fuel";

/** 직접 제작 목록 (작업대 필요) */
export const RECIPES: { id: RecipeId; name: string; input: Partial<Record<ResourceId, number>>; output: Partial<Record<ResourceId, number>> }[] = [
  { id: "parts", name: "부품 제작", input: { materials: 4 }, output: { parts: 1 } },
  { id: "fuel", name: "고체 연료 만들기", input: { materials: 3 }, output: { fuel: 1 } },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;

/** 주변 탐색 결과표: 가중치와 획득량 */
export const EXPLORE_TABLE: { weight: number; text: string; yields: YieldTable }[] = [
  { weight: 30, text: "무너진 편의점 창고에서 자재를 찾았다.", yields: { materials: [2, 5] } },
  { weight: 20, text: "버려진 차량에서 연료를 빼냈다.", yields: { fuel: [1, 3] } },
  { weight: 15, text: "고장 난 개찰구에서 부품을 떼어냈다.", yields: { parts: [1, 3] } },
  { weight: 15, text: "자판기 안에 통조림과 생수가 남아 있었다.", yields: { food: [1, 3], water: [1, 2] } },
  { weight: 20, text: "먼지뿐이다. 아무것도 찾지 못했다.", yields: {} },
];

export const ACTION_RULES = {
  /** 야간 외부 활동 효율 (어두워서 덜 찾는다) */
  nightOutsideRate: 0.6,
  /** 잔해 정리 범위 (1 = 한 번에 1칸) */
  debrisArea: 1,
  /** 잔해 1칸당 건지는 자재 */
  debrisSalvage: 1,
  /** 직접 수리: 부품 비용과 회복량 */
  repairParts: 1,
  repairAmount: 25,
  /** 공구함이 있으면 직접 수리 회복량 추가 */
  toolrackBonus: 10,
};
