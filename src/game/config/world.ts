// 업데이트 4: 외부 세계 — 지상 지역, 원정, 다른 생존자 집단, 교역과 갈등.
import type { ResourceBundle, ResourceId } from "../core/types";

export type RegionId = "plaza" | "market" | "apartments" | "hospital" | "depot" | "factory" | "reservoir" | "farmland";
export type FactionId = "traders" | "clinic" | "raiders";

export interface RegionDef {
  id: RegionId;
  name: string;
  desc: string;
  /** 왕복에 걸리는 날 수 */
  distance: number;
  /** 위험도 1~3: 원정대 부상 확률에 영향 */
  danger: number;
  /** 원정 1회 기본 획득량 [최소, 최대] */
  loot: Partial<Record<ResourceId, [number, number]>>;
  /** 원정으로 이 지역에 다녀오면 함께 알게 되는 이웃 지역 */
  links: RegionId[];
  faction?: FactionId;
  /** 지도 위 위치 (0~100) */
  pos: { x: number; y: number };
}

export const REGIONS: RegionDef[] = [
  { id: "plaza", name: "역 앞 광장", desc: "출입구 바로 위. 버려진 차와 노점이 늘어서 있다.", distance: 1, danger: 1, loot: { materials: [4, 8], food: [1, 3] }, links: ["market", "apartments"], pos: { x: 50, y: 50 } },
  { id: "market", name: "남부 재래시장", desc: "천막이 무너진 시장. 상인회가 자리를 잡았다.", distance: 1, danger: 1, loot: { food: [3, 6], water: [2, 4] }, links: ["plaza", "hospital", "farmland"], faction: "traders", pos: { x: 45, y: 78 } },
  { id: "apartments", name: "무너진 아파트 단지", desc: "반쯤 무너진 고층 아파트. 쓸 만한 집기가 많다.", distance: 2, danger: 2, loot: { materials: [8, 14], parts: [2, 4] }, links: ["plaza", "depot"], pos: { x: 22, y: 30 } },
  { id: "hospital", name: "시립 병원", desc: "의료진 몇이 남아 공동체를 꾸렸다.", distance: 2, danger: 2, loot: { water: [4, 8], parts: [2, 4] }, links: ["market", "reservoir"], faction: "clinic", pos: { x: 76, y: 68 } },
  { id: "depot", name: "버스 차고지", desc: "연료 탱크가 남아 있지만 약탈단이 진을 치고 있다.", distance: 2, danger: 3, loot: { fuel: [5, 9], parts: [3, 5] }, links: ["apartments", "factory"], faction: "raiders", pos: { x: 15, y: 62 } },
  { id: "factory", name: "폐공장", desc: "부품 창고가 통째로 남은 공장 지대. 길이 험하다.", distance: 3, danger: 3, loot: { parts: [6, 10], materials: [10, 16] }, links: ["depot"], pos: { x: 8, y: 15 } },
  { id: "reservoir", name: "정수장", desc: "도시 정수장. 물탱크에 깨끗한 물이 남아 있다.", distance: 3, danger: 2, loot: { water: [10, 16] }, links: ["hospital"], pos: { x: 90, y: 30 } },
  { id: "farmland", name: "외곽 농장", desc: "도시 밖 비닐하우스 단지. 저장 작물이 남아 있다.", distance: 3, danger: 2, loot: { food: [10, 16] }, links: ["market"], pos: { x: 60, y: 95 } },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionDef>;

export interface TradeOffer {
  give: ResourceBundle;
  get: ResourceBundle;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  desc: string;
  home: RegionId;
  startRelation: number;
  /** 교역 목록 (관계 0 이상, 하루 한 번) */
  offers: TradeOffer[];
  /** 선물: 이만큼 주면 관계 +gift.gain */
  gift: { give: ResourceBundle; gain: number };
  /** 병원 공동체: 진료 의뢰 비용 */
  clinic?: ResourceBundle;
  /** 약탈단: 습격 */
  hostile?: boolean;
}

export const FACTIONS: FactionDef[] = [
  {
    id: "traders",
    name: "시장 상인회",
    desc: "물건만 맞으면 누구와도 거래한다.",
    home: "market",
    startRelation: 10,
    offers: [
      { give: { materials: 8 }, get: { food: 5 } },
      { give: { materials: 8 }, get: { water: 5 } },
      { give: { food: 6 }, get: { parts: 2 } },
      { give: { parts: 3 }, get: { fuel: 4 } },
    ],
    gift: { give: { food: 3 }, gain: 10 },
  },
  {
    id: "clinic",
    name: "병원 공동체",
    desc: "의료진이 남은 공동체. 사람을 돕지만 대가는 받는다.",
    home: "hospital",
    startRelation: 0,
    offers: [{ give: { food: 4 }, get: { water: 6 } }],
    gift: { give: { food: 4 }, gain: 12 },
    clinic: { food: 4 },
  },
  {
    id: "raiders",
    name: "철로 약탈단",
    desc: "버스 차고지를 차지한 무리. 약해 보이는 곳을 노린다.",
    home: "depot",
    startRelation: -40,
    offers: [{ give: { food: 5, water: 5 }, get: { fuel: 6 } }],
    gift: { give: { materials: 10 }, gain: 15 },
    hostile: true,
  },
];

export const FACTION_BY_ID = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<FactionId, FactionDef>;

export const WORLD_RULES = {
  /** 원정대 최대 인원 */
  maxTeam: 3,
  /** 원정 준비물: 인원 × 날 수 만큼 식량·식수 */
  rationPerMemberDay: 1,
  /** 출발 조건: 피로 이 값 미만, 부상 없음 */
  maxFatigue: 70,
  /** 인원이 늘수록 획득량 배수: 1 + 0.5 × (인원-1) */
  teamBonus: 0.5,
  /** 위험도 1당 대원별 부상 확률 */
  injuryPerDanger: 0.1,
  injuryDamage: 12,
  /** 원정 다녀올 때마다 지역 물자가 줄어든다 (최소치까지) */
  depletion: 0.25,
  minStock: 0.25,
  /** 지상 탐사 행동: 새 지역 발견 확률 */
  scoutChance: 0.45,
  /** 관계 50 이상이면 교역 시 받는 양 +1 */
  friendlyBonusAt: 50,

  // ── 습격 ──
  raidStartDay: 6,
  /** 약탈단과의 관계가 이보다 낮으면 매일 습격 가능 */
  raidRelation: -20,
  raidChance: 0.18,
  /** 습격 세기 = 기본 + 날짜 × 배수 */
  raidBase: 8,
  raidPerDay: 1.2,
  /** 방어력: 인원당 기본, 경비 업무 1명당, 바리케이드·감시 초소는 시설 값 */
  defensePerPerson: 2,
  defensePerGuard: 7,
  /** 습격을 막지 못하면 잃는 비율 */
  raidLoss: [0.2, 0.35] as [number, number],

  // ── 사기 회복 ──
  /** 격려하기 행동: 생존자 사기 + */
  encourage: 8,
  /** 특별 배급 (정비 시간, 하루 한 번): 인원당 식량·식수 1, 사기 + */
  feast: 12,
};
