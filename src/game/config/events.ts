// 사건·장소·위협 설정 (기획서 9장). 확률과 피해량은 여기서 조정한다.

export type EventId =
  | "genFailure"
  | "waterContamination"
  | "spoilage"
  | "storageLoss"
  | "injury"
  | "badAir"
  | "survivorFound"
  | "resourceCache"
  | "threat"
  | "outbreak";

export interface EventDef {
  id: EventId;
  title: string;
  weight: number;
  tone: "good" | "bad";
}

export const EVENTS: EventDef[] = [
  { id: "genFailure", title: "발전기 고장", weight: 10, tone: "bad" },
  { id: "waterContamination", title: "급수 오염", weight: 8, tone: "bad" },
  { id: "spoilage", title: "식량 부패", weight: 10, tone: "bad" },
  { id: "storageLoss", title: "창고 침수", weight: 6, tone: "bad" },
  { id: "injury", title: "부상", weight: 8, tone: "bad" },
  { id: "badAir", title: "환기 이상", weight: 6, tone: "bad" },
  { id: "survivorFound", title: "외부 생존자 발견", weight: 7, tone: "good" },
  { id: "resourceCache", title: "물자 발견", weight: 9, tone: "good" },
  { id: "threat", title: "위협 출현", weight: 7, tone: "bad" },
  { id: "outbreak", title: "질병 발생", weight: 6, tone: "bad" },
];

export const EVENT_RULES = {
  /** 구간이 끝날 때 사건이 일어날 확률 */
  chancePerPeriod: 0.3,
  /** 이 날짜부터 사건 발생 (첫날은 적응 기간) */
  startDay: 2,

  genFailureDamage: 30,
  /** 오염으로 잃는 식수 비율 [최소, 최대] */
  contaminationLoss: [0.25, 0.4] as [number, number],
  filterDamage: 15,
  /** 부패로 잃는 식량 비율. 식량 보관함이 있으면 절반 */
  spoilageLoss: [0.15, 0.3] as [number, number],
  storageLoss: [0.1, 0.2] as [number, number],
  injuryDamage: 15,
  badAirFatigue: 15,
  cache: { materials: [3, 6] as [number, number], parts: [1, 2] as [number, number] },
};

export const THREAT_RULES = {
  names: ["들개 무리", "약탈자 정찰대", "무너지는 지상 건물", "독성 먼지 폭풍"],
  /** 위협이 있을 때 외부 행동·업무의 획득량 */
  outsideYieldRate: 0.7,
  /** 외부 행동 중 플레이어 부상 확률과 피해 */
  actionInjuryChance: 0.25,
  actionInjuryDamage: 10,
  /** 외부 업무 중 생존자 부상 확률과 피해 */
  workInjuryChance: 0.15,
  workInjuryDamage: 15,
  /** 위험 제거 성공 확률 (낮 / 야간), 실패 시 플레이어 피해 */
  clearChance: 0.55,
  clearChanceNight: 0.35,
  clearFailDamage: 10,
};

export interface PlaceDef {
  type: string;
  name: string;
  /** 장소 조사 1회로 얻는 물자 [최소, 최대] */
  loot: Partial<Record<"food" | "water" | "fuel" | "parts" | "materials", [number, number]>>;
  desc: string;
}

export const PLACES: PlaceDef[] = [
  { type: "store", name: "버려진 편의점", loot: { food: [4, 7], water: [3, 6] }, desc: "진열대 아래에 통조림이 남아 있을지도 모른다." },
  { type: "hardware", name: "철물점", loot: { parts: [3, 6], materials: [4, 8] }, desc: "공구와 부품이 흩어져 있다." },
  { type: "gas", name: "주유소", loot: { fuel: [4, 8] }, desc: "지하 탱크에 연료가 남아 있을 수 있다." },
  { type: "site", name: "공사 현장", loot: { materials: [8, 14] }, desc: "쌓아 둔 건설 자재가 보인다." },
  { type: "clinic", name: "동네 의원", loot: { water: [4, 8], parts: [1, 3] }, desc: "정수된 물과 장비가 남아 있을지도." },
];

export const PLACE_RULES = {
  /** 주변 탐색에서 새 장소를 발견할 확률 */
  discoverChance: 0.25,
  /** 동시에 조사 대기 중인 장소 최대 수 */
  maxUnsurveyed: 2,
};
