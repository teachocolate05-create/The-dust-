// 시설 운영 시스템: 저장 용량, 시설 가동 상태, 구간별 생산·소비, 내구도, 고장·수리.
// simulatePeriod()는 "지금 구간이 끝나면 어떻게 되는가"를 계산한다.
// 구간 종료 미리보기와 실제 진행이 같은 함수를 쓰므로 예상치와 결과가 어긋나지 않는다.

import { FACILITY_BY_ID } from "../config/facilities";
import { BASE_CAPACITY, RESOURCE_BY_ID, RESOURCES } from "../config/resources";
import { RULES } from "../config/rules";
import { bundleText, canAfford, missingText } from "../core/resources";
import type { Check, Facility, FacilityTypeId, GameState, LogEntry, ResourceBundle, ResourceId, Room } from "../core/types";
import { computeAccess } from "./access";
import { computeNets } from "./network";
import { canModifyBase } from "./phase";

// ───────────── 저장 용량 ─────────────

/** 최대 저장량 = 기본 + 출입 가능한 방에 있는 저장 시설의 합 */
export function capacity(state: GameState): Record<ResourceId, number> {
  const cap = { ...BASE_CAPACITY };
  const access = computeAccess(state);
  for (const room of state.rooms) {
    if (!access.roomAccess[room.id]) continue;
    for (const f of room.facilities)
      for (const [k, v] of Object.entries(FACILITY_BY_ID[f.type].storage) as [ResourceId, number][]) cap[k] += v;
  }
  return cap;
}

/** 자원을 더하되 최대 저장량을 넘는 양은 버린다. */
export function addCapped(
  state: GameState,
  bundle: ResourceBundle,
): { resources: GameState["resources"]; lost: ResourceBundle } {
  const cap = capacity(state);
  const resources = { ...state.resources };
  const lost: ResourceBundle = {};
  for (const k of Object.keys(bundle) as ResourceId[]) {
    const v = resources[k] + (bundle[k] ?? 0);
    if (RESOURCE_BY_ID[k].kind === "stock" && v > cap[k]) {
      lost[k] = v - Math.max(cap[k], resources[k]);
      resources[k] = Math.max(cap[k], resources[k]);
    } else resources[k] = Math.max(0, v);
  }
  return { resources, lost };
}

/** 저장량 초과분을 버리고 기록을 남긴다. (창고 철거 등으로 용량이 줄었을 때) */
export function enforceCapacity(state: GameState): GameState {
  const cap = capacity(state);
  const lost: ResourceBundle = {};
  const resources = { ...state.resources };
  for (const r of RESOURCES) {
    if (r.kind !== "stock") continue;
    if (resources[r.id] > cap[r.id]) {
      lost[r.id] = resources[r.id] - cap[r.id];
      resources[r.id] = cap[r.id];
    }
  }
  if (!Object.keys(lost).length) return state;
  const entry: LogEntry = { day: state.day, phase: state.phase, kind: "warn", text: `저장 공간이 부족해 ${bundleText(lost)}을(를) 버렸다.` };
  return { ...state, resources, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

// ───────────── 효율 ─────────────

export function efficiency(f: Pick<Facility, "type" | "durability">): number {
  const ratio = f.durability / FACILITY_BY_ID[f.type].maxDurability;
  for (const [min, eff] of RULES.facility.efficiencySteps) if (ratio >= min) return eff;
  return 0;
}

export function atRisk(f: Pick<Facility, "type" | "durability">): boolean {
  const ratio = f.durability / FACILITY_BY_ID[f.type].maxDurability;
  return ratio > 0 && ratio < RULES.facility.riskBelow;
}

// ───────────── 구간 시뮬레이션 ─────────────

export type FacilityStatus =
  | "running" // 가동 중
  | "passive" // 가구·보관함 (가동 개념 없음)
  | "off" // 플레이어가 정지
  | "broken" // 내구도 0
  | "noFuel" // 연료 부족
  | "noPower" // 전력망의 전력 부족
  | "noPowerLine" // 전력선 미연결
  | "noWaterLine" // 급수원과 이어진 수도관 없음
  | "noRawWater" // 급수원 공급량 부족
  | "isolated"; // 방이 통로와 끊겨 접근 불가

export const STATUS_LABEL: Record<FacilityStatus, string> = {
  running: "가동 중",
  passive: "사용 중",
  off: "정지",
  broken: "고장",
  noFuel: "연료 부족",
  noPower: "전력 부족",
  noPowerLine: "전력선 미연결",
  noWaterLine: "수도관 미연결",
  noRawWater: "원수 부족",
  isolated: "접근 불가",
};

export interface FacilityReport {
  roomId: string;
  facilityId: string;
  type: FacilityTypeId;
  status: FacilityStatus;
  efficiency: number;
  powerOut: number;
  powerIn: number;
  produced: ResourceBundle;
  consumed: ResourceBundle;
  decay: number;
  /** 연결된 전력망·수도망 번호 */
  powerNet?: number;
  waterNet?: number;
}

export interface PowerNetSummary {
  id: number;
  supply: number;
  demand: number;
  used: number;
  tiles: number;
}

export interface WaterNetSummary {
  id: number;
  sources: number;
  rawCapacity: number;
  rawUsed: number;
  tiles: number;
}

export interface PeriodSim {
  reports: FacilityReport[];
  byId: Record<string, FacilityReport>;
  /** 전체 합계 */
  power: { supply: number; demand: number; used: number };
  powerNets: PowerNetSummary[];
  waterNets: WaterNetSummary[];
  /** 시설 생산 합계 */
  production: ResourceBundle;
  /** 시설 소비 합계 (인원 소비 제외) */
  facilityUse: ResourceBundle;
}

function add(b: ResourceBundle, k: ResourceId, v: number) {
  if (v) b[k] = (b[k] ?? 0) + v;
}

export function simulatePeriod(state: GameState): PeriodSim {
  const access = computeAccess(state);
  const stock = { ...state.resources };
  const reports: FacilityReport[] = [];
  const all: { room: Room; f: Facility }[] = state.rooms.flatMap((room) => room.facilities.map((f) => ({ room, f })));

  const mk = (room: Room, f: Facility, status: FacilityStatus): FacilityReport => ({
    roomId: room.id,
    facilityId: f.id,
    type: f.type,
    status,
    efficiency: efficiency(f),
    powerOut: 0,
    powerIn: 0,
    produced: {},
    consumed: {},
    decay: 0,
  });

  // 1) 기본 상태
  const candidates: FacilityReport[] = [];
  for (const { room, f } of all) {
    const def = FACILITY_BY_ID[f.type];
    let r: FacilityReport;
    if (!access.roomAccess[room.id]) r = mk(room, f, "isolated");
    else if (!def.operates) r = mk(room, f, "passive");
    else if (!f.enabled) r = mk(room, f, "off");
    else if (f.durability <= 0) r = mk(room, f, "broken");
    else {
      r = mk(room, f, "running");
      candidates.push(r);
    }
    reports.push(r);
  }

  const pNets = computeNets(state, "power");
  const wNets = computeNets(state, "water");
  for (const r of reports) {
    r.powerNet = pNets.facilityNet[r.facilityId];
    r.waterNet = wNets.facilityNet[r.facilityId];
  }
  const tileCount = (info: typeof pNets, id: number) => [...info.netOf.values()].filter((v) => v === id).length;
  const powerNets: PowerNetSummary[] = pNets.ids.map((id) => ({ id, supply: 0, demand: 0, used: 0, tiles: tileCount(pNets, id) }));
  const waterNets: WaterNetSummary[] = wNets.ids.map((id) => ({
    id,
    sources: wNets.sources[id] ?? 0,
    rawCapacity: (wNets.sources[id] ?? 0) * RULES.network.sourceOutput,
    rawUsed: 0,
    tiles: tileCount(wNets, id),
  }));
  const pn = (id?: number) => powerNets.find((n) => n.id === id);
  const wn = (id?: number) => waterNets.find((n) => n.id === id);

  // 2) 발전기: 연료를 쓰고 전력 생산. 전력선에 연결되지 않으면 만든 전력을 쓸 곳이 없다.
  let supply = 0;
  for (const r of candidates.filter((c) => FACILITY_BY_ID[c.type].power > 0)) {
    const def = FACILITY_BY_ID[r.type];
    if (!canAfford(stock, def.consumes)) {
      r.status = "noFuel";
      continue;
    }
    for (const [k, v] of Object.entries(def.consumes) as [ResourceId, number][]) {
      stock[k] -= v;
      add(r.consumed, k, v);
    }
    r.powerOut = Math.floor(def.power * r.efficiency);
    supply += r.powerOut;
    const net = pn(r.powerNet);
    if (net) net.supply += r.powerOut;
  }

  // 3) 소비 시설: 수도관 → 전력선 → 전력량 → 원수량 순서로 확인
  let used = 0;
  let demand = 0;
  for (const r of candidates.filter((c) => FACILITY_BY_ID[c.type].power <= 0)) {
    const def = FACILITY_BY_ID[r.type];
    const need = -def.power;
    const rawNeed = Math.floor((def.produces.water ?? 0) * r.efficiency);
    demand += need;
    const water = wn(r.waterNet);
    if (def.produces.water && (!water || water.sources === 0)) {
      r.status = "noWaterLine";
      continue;
    }
    if (need > 0) {
      const net = pn(r.powerNet);
      if (!net) {
        r.status = "noPowerLine";
        continue;
      }
      net.demand += need;
      if (net.supply - net.used < need) {
        r.status = "noPower";
        continue;
      }
      net.used += need;
      used += need;
      r.powerIn = need;
    }
    if (water && rawNeed > 0) {
      if (water.rawCapacity - water.rawUsed < rawNeed) {
        r.status = "noRawWater";
        // 전력은 이미 배정했으므로 되돌린다
        if (r.powerIn) {
          pn(r.powerNet)!.used -= r.powerIn;
          used -= r.powerIn;
          r.powerIn = 0;
        }
        continue;
      }
      water.rawUsed += rawNeed;
    }
    for (const [k, v] of Object.entries(def.produces) as [ResourceId, number][]) add(r.produced, k, Math.floor(v * r.efficiency));
  }

  // 4) 가동한 시설은 닳는다
  const production: ResourceBundle = {};
  const facilityUse: ResourceBundle = {};
  for (const r of candidates) {
    if (r.status !== "running") continue;
    r.decay = FACILITY_BY_ID[r.type].decay;
    for (const [k, v] of Object.entries(r.produced) as [ResourceId, number][]) add(production, k, v);
    for (const [k, v] of Object.entries(r.consumed) as [ResourceId, number][]) add(facilityUse, k, v);
  }

  return {
    reports,
    byId: Object.fromEntries(reports.map((r) => [r.facilityId, r])),
    power: { supply, demand, used },
    powerNets,
    waterNets,
    production,
    facilityUse,
  };
}

/** 이번 구간에 실제로 쓸 수 있는(가동 중이거나 사용 중인) 시설이 있는지 */
export function hasWorking(state: GameState, type: FacilityTypeId, sim: PeriodSim = simulatePeriod(state)): boolean {
  return sim.reports.some((r) => r.type === type && (r.status === "running" || r.status === "passive"));
}

export function findFacility(state: GameState, facilityId: string): Facility | undefined {
  for (const room of state.rooms) {
    const f = room.facilities.find((x) => x.id === facilityId);
    if (f) return f;
  }
  return undefined;
}

// ───────────── 가동 스위치 / 정비 시간 수리 ─────────────

export function canToggleFacility(state: GameState, roomId: string, facilityId: string): Check {
  const room = state.rooms.find((r) => r.id === roomId);
  const f = room?.facilities.find((x) => x.id === facilityId);
  if (!f) return { ok: false, reason: "시설을 찾을 수 없습니다." };
  if (!FACILITY_BY_ID[f.type].operates) return { ok: false, reason: "켜고 끌 수 있는 시설이 아닙니다." };
  return { ok: true, cost: {}, refund: {} };
}

function updateFacility(state: GameState, roomId: string, facilityId: string, fn: (f: Facility) => Facility): GameState {
  return {
    ...state,
    rooms: state.rooms.map((r) => (r.id !== roomId ? r : { ...r, facilities: r.facilities.map((f) => (f.id === facilityId ? fn(f) : f)) })),
  };
}

function log(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

export function toggleFacility(state: GameState, roomId: string, facilityId: string): GameState {
  if (!canToggleFacility(state, roomId, facilityId).ok) return state;
  const f = findFacility(state, facilityId)!;
  const s = updateFacility(state, roomId, facilityId, (x) => ({ ...x, enabled: !x.enabled }));
  return log(s, `${FACILITY_BY_ID[f.type].name} ${f.enabled ? "정지" : "가동"}`);
}

export function repairCost(f: Facility): ResourceBundle {
  const missing = FACILITY_BY_ID[f.type].maxDurability - f.durability;
  return missing > 0 ? { parts: Math.ceil(missing / RULES.facility.repairPerPart) } : {};
}

export function canRepairFacility(state: GameState, roomId: string, facilityId: string): Check {
  if (!canModifyBase(state)) return { ok: false, reason: "정비 수리는 정비 시간에만 할 수 있습니다. 낮에는 '직접 수리' 행동을 쓰세요." };
  const room = state.rooms.find((r) => r.id === roomId);
  const f = room?.facilities.find((x) => x.id === facilityId);
  if (!f || !room) return { ok: false, reason: "시설을 찾을 수 없습니다." };
  if (f.durability >= FACILITY_BY_ID[f.type].maxDurability) return { ok: false, reason: "이미 내구도가 최대입니다." };
  if (!computeAccess(state).roomAccess[room.id]) return { ok: false, reason: "잔해에 막혀 갈 수 없는 방입니다. 먼저 길을 뚫으세요." };
  const cost = repairCost(f);
  if (!canAfford(state.resources, cost)) return { ok: false, reason: missingText(state.resources, cost) };
  return { ok: true, cost, refund: {} };
}

export function repairFacility(state: GameState, roomId: string, facilityId: string): GameState {
  const chk = canRepairFacility(state, roomId, facilityId);
  if (!chk.ok) return state;
  const f = findFacility(state, facilityId)!;
  const def = FACILITY_BY_ID[f.type];
  let s = updateFacility(state, roomId, facilityId, (x) => ({ ...x, durability: def.maxDurability }));
  const resources = { ...s.resources };
  for (const [k, v] of Object.entries(chk.cost) as [ResourceId, number][]) resources[k] -= v;
  s = { ...s, resources };
  return log(s, `${def.name} 정비 수리 완료 (${bundleText(chk.cost)} 사용, 내구도 ${f.durability} → ${def.maxDurability})`, "build");
}
