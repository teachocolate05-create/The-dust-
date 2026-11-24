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

  // ── 아래 수치는 데이터로만 정의되어 있으며, 실제 계산은 이후 단계에서 적용된다 ──
  /** 구간당 전력 생산(+)/소비(-) — 4단계 */
  power: number;
  /** 구간당 물 소비량 — 4단계 */
  waterUse: number;
  /** 구간당 생산 — 3단계 */
  produces: ResourceBundle;
  /** 구간당 소비 — 3단계 */
  consumes: ResourceBundle;
  /** 침상 수 — 5단계 */
  beds: number;
  /** 저장 용량 증가 — 3단계 */
  storage: number;

  /** 지도에 쓰는 짧은 표시 */
  glyph: string;
  desc: string;
}

const base = {
  buildable: true,
  fixed: false,
  maxDurability: 100,
  power: 0,
  waterUse: 0,
  produces: {},
  consumes: {},
  beds: 0,
  storage: 0,
};

export const FACILITIES: FacilityDef[] = [
  // 거주실
  { ...base, id: "cot", name: "간이 침상", w: 2, h: 1, room: "residence", cost: { materials: 4 }, beds: 1, glyph: "침상", desc: "낡은 매트를 깐 1인용 침상." },
  { ...base, id: "bunk", name: "이층 침대", w: 2, h: 2, room: "residence", cost: { materials: 10, parts: 2 }, beds: 2, glyph: "2층", desc: "공간을 아끼는 2인용 침대." },
  { ...base, id: "locker", name: "사물함", w: 1, h: 1, room: "residence", cost: { materials: 3 }, storage: 5, glyph: "함", desc: "개인 물품을 보관합니다." },
  // 창고
  { ...base, id: "shelf", name: "보관 선반", w: 2, h: 1, room: "storage", cost: { materials: 5 }, storage: 40, glyph: "선반", desc: "일반 물자를 쌓아 두는 선반." },
  { ...base, id: "foodbox", name: "식량 보관함", w: 1, h: 1, room: "storage", cost: { materials: 4, parts: 1 }, storage: 30, glyph: "식", desc: "밀폐형 식량 보관함. 부패를 늦춥니다." },
  { ...base, id: "crate", name: "자재 적재대", w: 2, h: 2, room: "storage", cost: { materials: 6 }, storage: 60, glyph: "적재", desc: "건설 자재와 부품을 쌓아 둡니다." },
  // 발전실
  { ...base, id: "emergency_gen", name: "비상 발전기", w: 2, h: 2, room: "power", cost: {}, buildable: false, fixed: true, power: 6, consumes: { fuel: 1 }, glyph: "발전", desc: "역사에 남아 있던 비상 발전기. 노후화되어 작동이 불안정합니다." },
  { ...base, id: "fuel_gen", name: "연료 발전기", w: 2, h: 2, room: "power", cost: { materials: 18, parts: 8 }, power: 12, consumes: { fuel: 2 }, glyph: "발전", desc: "연료를 태워 안정적으로 전력을 생산합니다." },
  { ...base, id: "switchboard", name: "배전반", w: 1, h: 1, room: "power", cost: { materials: 4, parts: 3 }, glyph: "배전", desc: "전력망의 분기점. 4단계 전력망에서 사용됩니다." },
  // 정수실
  { ...base, id: "filter", name: "정수 필터", w: 2, h: 2, room: "water", cost: { materials: 12, parts: 5 }, power: -2, produces: { water: 4 }, glyph: "정수", desc: "원수를 걸러 식수로 만듭니다." },
  { ...base, id: "tank", name: "저수 탱크", w: 2, h: 2, room: "water", cost: { materials: 10 }, storage: 40, glyph: "탱크", desc: "정수한 물을 저장합니다." },
  // 작업실
  { ...base, id: "workbench", name: "작업대", w: 2, h: 1, room: "workshop", cost: { materials: 8, parts: 2 }, power: -1, glyph: "작업", desc: "물품 제작과 수리에 쓰는 작업대." },
  { ...base, id: "toolrack", name: "공구함", w: 1, h: 1, room: "workshop", cost: { materials: 4, parts: 1 }, glyph: "공구", desc: "수리 작업의 효율을 높입니다." },
];

export const FACILITY_BY_ID = Object.fromEntries(FACILITIES.map((f) => [f.id, f])) as Record<FacilityTypeId, FacilityDef>;

export function facilitiesForRoom(room: RoomTypeId): FacilityDef[] {
  return FACILITIES.filter((f) => f.room === room);
}
