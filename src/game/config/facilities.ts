import type { FacilityTypeId, ResourceBundle, RoomTypeId } from "../core/types";

export interface FacilityDef {
  id: FacilityTypeId;
  name: string;
  /** 회전 전 기준 크기 (칸) */
  w: number;
  h: number;
  room: RoomTypeId;
  cost: ResourceBundle;
  /** 플레이어가 새로 건설할 수 있는지 (false = 처음부터 있던 설비) */
  buildable: boolean;
  /** true면 이동·철거 불가 (역사에 고정된 설비) */
  fixed: boolean;
  maxDurability: number;

  /** 가동하는 기계인지 (false = 가구·보관함처럼 켜고 끌 필요 없는 시설) */
  operates: boolean;
  /** 가동 중 구간마다 줄어드는 내구도 */
  decay: number;
  /** 구간당 전력 생산(+)/소비(-) */
  power: number;
  /** 구간당 생산 */
  produces: ResourceBundle;
  /** 구간당 소비 (연료 등) */
  consumes: ResourceBundle;
  /** 늘려 주는 최대 저장량 */
  storage: ResourceBundle;
  /** 침상 수 — 5단계 */
  beds: number;
  /** 구간당 물 소비량 — 4단계 수도망 */
  waterUse: number;

  /** 지도에 쓰는 짧은 표시 */
  glyph: string;
  desc: string;
}

const base = {
  buildable: true,
  fixed: false,
  maxDurability: 100,
  operates: false,
  decay: 0,
  power: 0,
  produces: {},
  consumes: {},
  storage: {},
  beds: 0,
  waterUse: 0,
};

export const FACILITIES: FacilityDef[] = [
  // 거주실
  { ...base, id: "cot", name: "간이 침상", w: 2, h: 1, room: "residence", cost: { materials: 4 }, beds: 1, glyph: "침상", desc: "낡은 매트를 깐 1인용 침상." },
  { ...base, id: "bunk", name: "이층 침대", w: 2, h: 2, room: "residence", cost: { materials: 10, parts: 2 }, beds: 2, glyph: "2층", desc: "공간을 아끼는 2인용 침대." },
  { ...base, id: "locker", name: "사물함", w: 1, h: 1, room: "residence", cost: { materials: 3 }, storage: { food: 5, parts: 5 }, glyph: "함", desc: "개인 물품과 비상식량을 보관합니다." },
  // 창고
  { ...base, id: "shelf", name: "보관 선반", w: 2, h: 1, room: "storage", cost: { materials: 5 }, storage: { materials: 20, parts: 10 }, glyph: "선반", desc: "자재와 부품을 쌓아 두는 선반." },
  { ...base, id: "foodbox", name: "식량 보관함", w: 1, h: 1, room: "storage", cost: { materials: 4, parts: 1 }, storage: { food: 30, water: 10 }, glyph: "식", desc: "밀폐형 식량 보관함." },
  { ...base, id: "crate", name: "자재 적재대", w: 2, h: 2, room: "storage", cost: { materials: 6 }, storage: { materials: 40, fuel: 15 }, glyph: "적재", desc: "건설 자재와 연료통을 쌓아 둡니다." },
  // 발전실
  {
    ...base,
    id: "emergency_gen",
    name: "비상 발전기",
    w: 2,
    h: 2,
    room: "power",
    cost: {},
    buildable: false,
    fixed: true,
    operates: true,
    decay: 3,
    power: 6,
    consumes: { fuel: 1 },
    glyph: "발전",
    desc: "역사에 남아 있던 비상 발전기. 노후화되어 빨리 닳습니다.",
  },
  { ...base, id: "fuel_gen", name: "연료 발전기", w: 2, h: 2, room: "power", cost: { materials: 18, parts: 8 }, operates: true, decay: 2, power: 12, consumes: { fuel: 2 }, glyph: "발전", desc: "연료를 태워 안정적으로 전력을 생산합니다." },
  { ...base, id: "switchboard", name: "배전반", w: 1, h: 1, room: "power", cost: { materials: 4, parts: 3 }, storage: { fuel: 10 }, glyph: "배전", desc: "연료 보관 공간이 딸린 배전반. 4단계 전력망의 분기점이 됩니다." },
  // 정수실
  { ...base, id: "filter", name: "정수 필터", w: 2, h: 2, room: "water", cost: { materials: 12, parts: 5 }, operates: true, decay: 2, power: -2, produces: { water: 4 }, glyph: "정수", desc: "원수를 걸러 식수로 만듭니다. 전력이 필요합니다." },
  { ...base, id: "tank", name: "저수 탱크", w: 2, h: 2, room: "water", cost: { materials: 10 }, storage: { water: 40 }, glyph: "탱크", desc: "정수한 물을 저장합니다." },
  // 작업실
  { ...base, id: "workbench", name: "작업대", w: 2, h: 1, room: "workshop", cost: { materials: 8, parts: 2 }, operates: true, decay: 1, power: -1, glyph: "작업", desc: "전력이 들어오면 '직접 제작' 행동을 할 수 있습니다." },
  { ...base, id: "toolrack", name: "공구함", w: 1, h: 1, room: "workshop", cost: { materials: 4, parts: 1 }, glyph: "공구", desc: "있으면 '직접 수리' 행동의 회복량이 늘어납니다." },
];

export const FACILITY_BY_ID = Object.fromEntries(FACILITIES.map((f) => [f.id, f])) as Record<FacilityTypeId, FacilityDef>;

export function facilitiesForRoom(room: RoomTypeId): FacilityDef[] {
  return FACILITIES.filter((f) => f.room === room);
}
