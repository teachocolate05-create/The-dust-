// 게임 전체에서 쓰는 기본 타입 정의.
// UI 코드와 분리되어 있으며, 게임 규칙(systems)과 데이터(config)가 이 타입을 공유한다.

export type ResourceId = "food" | "water" | "power" | "fuel" | "parts" | "materials";

/** 비용/환급 등 자원 묶음. 필요한 자원만 적는다. */
export type ResourceBundle = Partial<Record<ResourceId, number>>;

/** 맵 타일 종류 */
export type TileType =
  | "rock" // 암반·외벽 (사용 불가)
  | "floor" // 정리된 바닥 (방 생성 가능)
  | "debris" // 잔해 (정리 전에는 사용 불가)
  | "pillar" // 구조 기둥 (사용 불가)
  | "platform" // 승강장 (통행 가능, 건설 불가)
  | "track" // 선로 (사용 불가)
  | "entrance" // 지상 출입구 계단
  | "watersource" // 급수원 (지하수 배관)
  | "sealed"; // 봉쇄된 셔터 (구역 개방으로 열림)

export type RoomTypeId = "residence" | "storage" | "power" | "water" | "workshop" | "common" | "medical" | "farm" | "guard";

export type FacilityTypeId =
  | "cot"
  | "bunk"
  | "locker"
  | "shelf"
  | "foodbox"
  | "crate"
  | "emergency_gen"
  | "fuel_gen"
  | "switchboard"
  | "filter"
  | "tank"
  | "workbench"
  | "toolrack"
  | "dining_table"
  | "builder_bench"
  | "large_storage"
  | "pantry"
  | "big_tank"
  | "hi_gen"
  | "big_filter"
  | "med_bed"
  | "med_cabinet"
  | "planter"
  | "mushroom_bed"
  | "hydroponics"
  | "stove"
  | "refinery"
  | "lathe"
  | "barricade"
  | "watch_post";

/** 시간 구간. 오전/오후/야간 + 정비 시간 */
export type Phase = "morning" | "afternoon" | "night" | "maintenance";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Facility {
  id: string;
  type: FacilityTypeId;
  /** 맵 기준 좌상단 타일 좌표 */
  x: number;
  y: number;
  /** 90도 회전 여부 (가로·세로 크기 교환) */
  rotated: boolean;
  durability: number;
  /** 가동 스위치 (가동하는 기계만 의미 있음) */
  enabled: boolean;
  /** 작물 성장 단계 (재배 시설만, 업데이트 3) */
  growth?: number;
}

export interface Room {
  id: string;
  name: string;
  type: RoomTypeId;
  rect: Rect;
  facilities: Facility[];
}

export interface LogEntry {
  day: number;
  phase: Phase;
  text: string;
  kind: "info" | "build" | "warn" | "event";
}

export interface GameState {
  /** 저장 데이터 형식 버전 */
  version: number;
  day: number;
  phase: Phase;
  /** 남은 행동 횟수 (2단계에서 사용) */
  actionsLeft: number;
  resources: Record<ResourceId, number>;
  /** 맵 타일. 잔해 정리 등으로 바뀔 수 있으므로 상태에 보관 */
  map: TileType[][];
  rooms: Room[];
  nextId: number;
  log: LogEntry[];
  /** 무작위 결과용 시드 (저장·불러오기 후에도 결과가 일관되도록 상태에 보관) */
  seed: number;
  /** 가장 최근 행동 결과 (화면 표시용) */
  lastAction: ActionResult | null;
  /** 기반 시설: 전력선·수도관이 깔린 칸 ("x,y") */
  lines: Record<NetKind, string[]>;
  /** 거점 인원. 0번은 항상 플레이어 */
  survivors: Survivor[];
  /** 발견했거나 입구에 도착한, 아직 수용하지 않은 생존자 */
  pending: PendingSurvivor[];
  /** 생존자가 치울 잔해로 지정한 칸 ("x,y") */
  debrisMarks: string[];
  /** 거점 주변 위협 (위험 제거 행동으로 없앤다) */
  threat: { name: string; sinceDay: number } | null;
  /** 탐색으로 발견한 장소 (장소 조사 행동으로 한 번 뒤질 수 있다) */
  places: Place[];
  /** 가장 최근 구간 종료 때 일어난 사건 (화면 알림용) */
  events: { serial: number; list: GameEvent[] };
  /** 개방한 확장 구역 id */
  zones: string[];
  /** 생존자 사이 관계 점수 (-100~100). 키는 두 id를 정렬해 "a|b" */
  relations: Record<string, number>;
  /** '제작' 업무가 만드는 품목 (업데이트 3) */
  craftTarget: "parts" | "fuel" | "recycle";
  /** 특별 배급을 한 마지막 날 */
  feastDay: number;
  /** 외부 세계 (업데이트 4) */
  world: WorldState;
  /** 게임 오버 정보. null이면 진행 중 */
  gameOver: { day: number; phase: Phase; reason: string } | null;
}

export interface WorldState {
  regions: Record<string, { discovered: boolean; visits: number }>;
  factions: Record<string, { contacted: boolean; relation: number; lastTradeDay: number }>;
  expeditions: Expedition[];
}

export interface Expedition {
  id: string;
  regionId: string;
  /** 원정 중인 생존자 (거점 인원에서 빠진다) */
  members: Survivor[];
  daysLeft: number;
  departedDay: number;
}

export interface Place {
  id: string;
  type: string;
  name: string;
  surveyed: boolean;
  foundDay: number;
}

export interface GameEvent {
  id: string;
  title: string;
  text: string;
  /** good = 이득, bad = 피해 */
  tone: "good" | "bad";
}

export type SkillLevels = Record<"tech" | "medic" | "gather" | "farm" | "manage", number>;

export interface Survivor {
  id: string;
  name: string;
  age: number;
  isPlayer: boolean;
  /** 건강 0~100 */
  health: number;
  /** 피로 0~100 */
  fatigue: number;
  skills: SkillLevels;
  job: "rest" | "debris" | "scavenge" | "forage" | "maintain" | "craft" | "heal" | "farm" | "guard";
  /** '치료' 업무일 때 돌볼 사람 (없으면 가장 심한 환자) */
  healTarget?: string;
  background: string;
  /** 성격·특성 (업데이트 2) */
  traits: TraitId[];
  /** 부상·질병 (업데이트 2) */
  conditions: Condition[];
  /** 사기 0~100 (업데이트 2) */
  morale: number;
}

export type TraitId = "hardworking" | "lazy" | "sturdy" | "frail" | "optimist" | "pessimist" | "social" | "grumpy" | "handy" | "scout";

export interface Condition {
  kind: "injury" | "illness";
  /** 심각도 1~3 */
  severity: number;
}

export interface PendingSurvivor {
  survivor: Survivor;
  /** found = 발견만 함(구조 필요) / arrived = 입구에 도착(수용 결정 필요) */
  stage: "found" | "arrived";
  /** 이 날짜가 지나면 떠난다 */
  leavesAfterDay: number;
}

/** 기반 시설 종류: 전력망 / 수도망 */
export type NetKind = "power" | "water";

export interface ActionResult {
  /** 결과마다 증가하는 번호 (화면에서 새 결과인지 판단) */
  serial: number;
  actionName: string;
  text: string;
  gained: ResourceBundle;
  spent: ResourceBundle;
}

/** 규칙 검사 결과 */
export type Check =
  | { ok: true; cost: ResourceBundle; refund: ResourceBundle }
  | { ok: false; reason: string };
