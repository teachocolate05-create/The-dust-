import type { ResourceId } from "../core/types";

export interface ResourceDef {
  id: ResourceId;
  name: string;
  short: string;
  /** stock: 창고에 쌓이는 자원 / flow: 매 구간 생산·소비만 계산하는 자원 */
  kind: "stock" | "flow";
  desc: string;
}

export const RESOURCES: ResourceDef[] = [
  { id: "food", name: "식량", short: "식", kind: "stock", desc: "생존자의 식사에 사용합니다." },
  { id: "water", name: "식수", short: "수", kind: "stock", desc: "음용 및 생활에 사용합니다." },
  { id: "power", name: "전력", short: "전", kind: "flow", desc: "발전기가 만들고 시설이 씁니다. 저장되지 않고 구간마다 발전량과 소비량만 계산합니다." },
  { id: "fuel", name: "연료", short: "연", kind: "stock", desc: "발전기와 난방에 사용합니다." },
  { id: "parts", name: "부품", short: "부", kind: "stock", desc: "시설 수리와 기계 제작에 사용합니다." },
  { id: "materials", name: "건설 자재", short: "자", kind: "stock", desc: "방 생성과 시설 건설에 사용합니다." },
];

export const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r])) as Record<ResourceId, ResourceDef>;

/** 창고 시설이 없어도 쌓아 둘 수 있는 기본 저장량. 저장 시설을 지으면 늘어난다. */
export const BASE_CAPACITY: Record<ResourceId, number> = {
  food: 30,
  water: 30,
  power: 0,
  fuel: 20,
  parts: 15,
  materials: 60,
};

/** 새 게임 시작 자원 */
export const STARTING_RESOURCES: Record<ResourceId, number> = {
  food: 24,
  water: 18,
  power: 0,
  fuel: 12,
  parts: 10,
  materials: 60,
};
