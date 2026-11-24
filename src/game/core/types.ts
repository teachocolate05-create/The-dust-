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
  | "watersource"; // 급수원 (지하수 배관)

export type RoomTypeId = "residence" | "storage" | "power" | "water" | "workshop";

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
  | "toolrack";

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
  kind: "info" | "build" | "warn";
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
  job: "rest" | "debris" | "scavenge" | "forage" | "maintain" | "craft";
  background: string;
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
