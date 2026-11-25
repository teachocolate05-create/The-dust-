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

  /** 고급 설비: 가동 중인 건설 작업대가 있어야 지을 수 있다 */
  advanced: boolean;
  /** 쉬는 생존자의 구간당 추가 피로 회복 (공동 생활실) */
  restBonus: number;
  /** 재배 시설: 가동한 구간마다 1씩 자라 cycle에 이르면 식량 yield 수확 (업데이트 3) */
  crop?: { cycle: number; yield: number };
  /** 조리 설비: 가동 중이면 식량 소비 25% 절약, 구간마다 사기 +1 (업데이트 3) */
  kitchen?: boolean;
  /** 방어력 (경비실, 업데이트 4) */
  defense?: number;

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
  advanced: false,
  restBonus: 0,
};

export const FACILITIES: FacilityDef[] = [
  // 거주실
  { ...base, id: "cot", name: "간이 침상", w: 2, h: 1, room: "residence", cost: { materials: 4 }, beds: 1, glyph: "침상", desc: "낡은 매트를 깐 1인용 침상." },
  { ...base, id: "bunk", name: "이층 침대", w: 2, h: 2, room: "residence", cost: { materials: 10, parts: 2 }, beds: 2, glyph: "2층", desc: "공간을 아끼는 2인용 침대." },
  { ...base, id: "locker", name: "사물함", w: 1, h: 1, room: "residence", cost: { materials: 3 }, storage: { food: 3, parts: 3 }, glyph: "함", desc: "개인 물품과 비상식량을 보관합니다." },
  // 창고
  { ...base, id: "shelf", name: "보관 선반", w: 2, h: 1, room: "storage", cost: { materials: 5 }, storage: { materials: 15, parts: 10 }, glyph: "선반", desc: "자재와 부품을 쌓아 두는 선반." },
  { ...base, id: "foodbox", name: "식량 보관함", w: 1, h: 1, room: "storage", cost: { materials: 4, parts: 1 }, storage: { food: 10, water: 5 }, glyph: "식", desc: "밀폐형 식량 보관함." },
  { ...base, id: "crate", name: "자재 적재대", w: 2, h: 2, room: "storage", cost: { materials: 6 }, storage: { materials: 30, fuel: 15 }, glyph: "적재", desc: "건설 자재와 연료통을 쌓아 둡니다." },
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
  { ...base, id: "tank", name: "저수 탱크", w: 2, h: 2, room: "water", cost: { materials: 10 }, storage: { water: 20 }, glyph: "탱크", desc: "정수한 물을 저장합니다." },
  // 작업실
  { ...base, id: "workbench", name: "작업대", w: 2, h: 1, room: "workshop", cost: { materials: 8, parts: 2 }, operates: true, decay: 1, power: -1, glyph: "작업", desc: "전력이 들어오면 '직접 제작' 행동을 할 수 있습니다." },
  // ── 업데이트 1: 거점 확장 ──
  { ...base, id: "builder_bench", name: "건설 작업대", w: 3, h: 2, room: "workshop", cost: { materials: 20, parts: 8 }, operates: true, decay: 1, power: -2, glyph: "건설대", desc: "고급 설비를 만들 수 있게 하는 대형 작업대. 전력이 들어와야 합니다." },
  { ...base, id: "dining_table", name: "식탁", w: 2, h: 2, room: "common", cost: { materials: 8 }, restBonus: 10, glyph: "식탁", desc: "쉬는 생존자의 피로 회복 +10 (거점에 하나만 있어도 효과)." },
  { ...base, id: "large_storage", name: "대형 저장고", w: 3, h: 2, room: "storage", cost: { materials: 25, parts: 6 }, advanced: true, storage: { materials: 60, parts: 20, fuel: 10 }, glyph: "대형", desc: "고급 설비. 자재·부품·연료를 대량으로 보관합니다." },
  { ...base, id: "pantry", name: "식품 저장 선반", w: 2, h: 2, room: "storage", cost: { materials: 12, parts: 3 }, advanced: true, storage: { food: 25, water: 10 }, glyph: "식품", desc: "고급 설비. 서늘하게 밀폐된 식품 선반." },
  { ...base, id: "big_tank", name: "대형 물탱크", w: 3, h: 2, room: "water", cost: { materials: 20, parts: 4 }, advanced: true, storage: { water: 50 }, glyph: "대형탱크", desc: "고급 설비. 식수를 대량으로 저장합니다." },
  { ...base, id: "hi_gen", name: "고효율 발전기", w: 3, h: 2, room: "power", cost: { materials: 30, parts: 15 }, advanced: true, operates: true, decay: 1, power: 20, consumes: { fuel: 2 }, glyph: "고효율", desc: "고급 설비. 같은 연료로 훨씬 많은 전력을 만들고 덜 닳습니다." },
  { ...base, id: "big_filter", name: "대형 정수기", w: 3, h: 2, room: "water", cost: { materials: 25, parts: 10 }, advanced: true, operates: true, decay: 1, power: -3, produces: { water: 8 }, glyph: "대형정수", desc: "고급 설비. 급수원 원수 8을 모두 정수합니다." },
  // ── 업데이트 3: 생산 및 자급자족 ──
  { ...base, id: "planter", name: "재배상", w: 2, h: 2, room: "farm", cost: { materials: 10, parts: 2 }, operates: true, decay: 1, power: -1, consumes: { water: 1 }, crop: { cycle: 6, yield: 6 }, glyph: "재배", desc: "재배등(전력 1)과 물 1로 채소를 기릅니다. 6구간마다 식량 6 수확." },
  { ...base, id: "mushroom_bed", name: "버섯 재배상", w: 2, h: 1, room: "farm", cost: { materials: 6 }, operates: true, power: 0, consumes: { water: 1 }, crop: { cycle: 9, yield: 4 }, glyph: "버섯", desc: "빛 없이 물만으로 자랍니다. 느리지만 전력이 필요 없습니다. 9구간마다 식량 4." },
  { ...base, id: "hydroponics", name: "자동 재배기", w: 3, h: 2, room: "farm", cost: { materials: 25, parts: 10 }, advanced: true, operates: true, decay: 1, power: -3, consumes: { water: 2 }, crop: { cycle: 4, yield: 8 }, glyph: "수경", desc: "고급 설비. 수경 재배로 빠르게 많이 기릅니다. 4구간마다 식량 8." },
  { ...base, id: "stove", name: "조리대", w: 2, h: 1, room: "common", cost: { materials: 10, parts: 4 }, operates: true, decay: 1, power: -1, kitchen: true, glyph: "조리", desc: "따뜻한 식사로 식량을 아껴 먹습니다 (소비 25% 절약), 모두 사기 +1/구간." },
  { ...base, id: "refinery", name: "연료 정제기", w: 2, h: 2, room: "workshop", cost: { materials: 20, parts: 8 }, advanced: true, operates: true, decay: 1, power: -2, consumes: { materials: 3 }, produces: { fuel: 2 }, glyph: "정제", desc: "고급 설비. 구간마다 자재 3으로 연료 2를 자동 생산합니다." },
  { ...base, id: "lathe", name: "부품 가공기", w: 2, h: 2, room: "workshop", cost: { materials: 22, parts: 6 }, advanced: true, operates: true, decay: 1, power: -3, consumes: { materials: 4 }, produces: { parts: 1 }, glyph: "가공", desc: "고급 설비. 구간마다 자재 4로 부품 1을 자동 생산합니다." },
  // ── 업데이트 4: 외부 세계 ──
  { ...base, id: "barricade", name: "바리케이드", w: 2, h: 1, room: "guard", cost: { materials: 8 }, defense: 8, glyph: "방벽", desc: "습격 방어력 +8." },
  { ...base, id: "watch_post", name: "감시 초소", w: 1, h: 1, room: "guard", cost: { materials: 5, parts: 2 }, defense: 5, glyph: "감시", desc: "습격 방어력 +5." },
  // ── 업데이트 2: 생존자 생활 ──
  { ...base, id: "med_bed", name: "진료 침대", w: 2, h: 1, room: "medical", cost: { materials: 8, parts: 2 }, glyph: "진료", desc: "'치료' 업무 성공 확률 +15%." },
  { ...base, id: "med_cabinet", name: "약품 선반", w: 1, h: 1, room: "medical", cost: { materials: 5, parts: 3 }, glyph: "약", desc: "'치료' 업무 성공 확률 +10%." },
  { ...base, id: "toolrack", name: "공구함", w: 1, h: 1, room: "workshop", cost: { materials: 4, parts: 1 }, glyph: "공구", desc: "있으면 '직접 수리' 행동의 회복량이 늘어납니다." },
];

export const FACILITY_BY_ID = Object.fromEntries(FACILITIES.map((f) => [f.id, f])) as Record<FacilityTypeId, FacilityDef>;

export function facilitiesForRoom(room: RoomTypeId): FacilityDef[] {
  return FACILITIES.filter((f) => f.room === room);
}
