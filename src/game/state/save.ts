import { FACILITY_BY_ID } from "../config/facilities";
import { RESOURCES } from "../config/resources";
import { ROOM_TYPE_BY_ID } from "../config/rooms";
import type { GameState, TileType } from "../core/types";
import { SAVE_VERSION, ZONE_PRESET_ROOMS } from "./initialState";
import { parseLayout, STATION_LAYOUT } from "../config/map";
import { ZONES } from "../config/zones";
import { createPlayer } from "../systems/survivors";
import { JOB_BY_ID } from "../config/survivors";
import { TRAIT_BY_ID } from "../config/life";
import { rollTraits } from "../systems/life";
import { createWorld } from "../systems/world";

// 브라우저 LocalStorage 저장.
// 불러온 데이터는 반드시 검증한다. 손상된 데이터는 사용하지 않는다.

export const SAVE_KEY = "the-dust-save";

const TILES: TileType[] = ["rock", "floor", "debris", "pillar", "platform", "track", "entrance", "watersource", "sealed"];
const PHASES = ["morning", "afternoon", "night", "maintenance"];

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isRect = (r: any) => r && isInt(r.x) && isInt(r.y) && isInt(r.w) && isInt(r.h) && r.w > 0 && r.h > 0;

export function validateSave(data: any): data is GameState {
  if (!data || typeof data !== "object") return false;
  if (data.version !== SAVE_VERSION) return false;
  if (!isInt(data.day) || data.day < 1) return false;
  if (!PHASES.includes(data.phase)) return false;
  if (!isInt(data.actionsLeft) || !isInt(data.nextId)) return false;
  if (!data.resources || !RESOURCES.every((r) => typeof data.resources[r.id] === "number")) return false;
  if (!Array.isArray(data.map) || data.map.length === 0) return false;
  const width = data.map[0]?.length;
  if (!data.map.every((row: any) => Array.isArray(row) && row.length === width && row.every((t: any) => TILES.includes(t))))
    return false;
  if (!Array.isArray(data.rooms)) return false;
  for (const room of data.rooms) {
    if (typeof room?.id !== "string" || typeof room.name !== "string") return false;
    if (!ROOM_TYPE_BY_ID[room.type as keyof typeof ROOM_TYPE_BY_ID] || !isRect(room.rect)) return false;
    if (!Array.isArray(room.facilities)) return false;
    for (const f of room.facilities) {
      if (typeof f?.id !== "string" || !FACILITY_BY_ID[f.type as keyof typeof FACILITY_BY_ID]) return false;
      if (!isInt(f.x) || !isInt(f.y) || typeof f.rotated !== "boolean" || typeof f.durability !== "number") return false;
      if (typeof f.enabled !== "boolean") return false;
      if (f.growth !== undefined && !isInt(f.growth)) return false;
      if (f.charge !== undefined && typeof f.charge !== "number") return false;
    }
  }
  if (!Array.isArray(data.log)) return false;
  if (!isInt(data.seed)) return false;
  if (data.lastAction !== null && typeof data.lastAction !== "object") return false;
  const isKey = (k: any) => typeof k === "string" && /^\d+,\d+$/.test(k);
  if (!data.lines || !["power", "water"].every((n) => Array.isArray(data.lines[n]) && data.lines[n].every(isKey))) return false;
  if (!Array.isArray(data.survivors) || data.survivors.length === 0 || !data.survivors[0]?.isPlayer) return false;
  for (const sv of data.survivors) if (!isSurvivor(sv)) return false;
  if (!Array.isArray(data.pending) || !data.pending.every((p: any) => p && isSurvivor(p.survivor) && ["found", "arrived"].includes(p.stage) && isInt(p.leavesAfterDay)))
    return false;
  if (!Array.isArray(data.debrisMarks) || !data.debrisMarks.every(isKey)) return false;
  if (data.threat !== null && (typeof data.threat?.name !== "string" || !isInt(data.threat?.sinceDay))) return false;
  if (!Array.isArray(data.places) || !data.places.every((p: any) => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.surveyed === "boolean"))
    return false;
  if (!data.events || !isInt(data.events.serial) || !Array.isArray(data.events.list)) return false;
  if (!data.relations || typeof data.relations !== "object" || !Object.values(data.relations).every((v) => typeof v === "number")) return false;
  if (!["parts", "fuel", "recycle"].includes(data.craftTarget)) return false;
  if (!isInt(data.feastDay)) return false;
  if (!Array.isArray(data.explored) || data.explored.length !== data.map.length || !data.explored.every((r: any, y: number) => typeof r === "string" && r.length === data.map[y].length && /^[01]*$/.test(r)))
    return false;
  if (!Array.isArray(data.goals) || !data.goals.every((g: any) => typeof g === "string")) return false;
  if (!data.stats || !isInt(data.stats.harvests) || !isInt(data.stats.expeditions) || !isInt(data.stats.raidsRepelled)) return false;
  if (data.cityDay !== null && !isInt(data.cityDay)) return false;
  const w = data.world;
  if (!w || typeof w.regions !== "object" || typeof w.factions !== "object" || !Array.isArray(w.expeditions)) return false;
  if (!Object.values(w.regions).every((r: any) => typeof r?.discovered === "boolean" && isInt(r?.visits))) return false;
  if (!Object.values(w.factions).every((f: any) => typeof f?.contacted === "boolean" && typeof f?.relation === "number" && isInt(f?.lastTradeDay)))
    return false;
  if (!w.expeditions.every((e: any) => e && typeof e.regionId === "string" && isInt(e.daysLeft) && Array.isArray(e.members) && e.members.every(isSurvivor)))
    return false;
  if (!Array.isArray(data.zones) || !data.zones.every((z: any) => typeof z === "string")) return false;
  if (data.gameOver !== null && (typeof data.gameOver?.reason !== "string" || !isInt(data.gameOver?.day))) return false;
  return true;
}

function isSurvivor(sv: any): boolean {
  return (
    sv &&
    typeof sv.id === "string" &&
    typeof sv.name === "string" &&
    typeof sv.health === "number" &&
    typeof sv.fatigue === "number" &&
    !!JOB_BY_ID[sv.job as keyof typeof JOB_BY_ID] &&
    sv.skills &&
    ["tech", "medic", "gather", "farm", "manage"].every((k) => typeof sv.skills[k] === "number") &&
    Array.isArray(sv.traits) &&
    sv.traits.every((t: any) => !!TRAIT_BY_ID[t as keyof typeof TRAIT_BY_ID]) &&
    Array.isArray(sv.conditions) &&
    sv.conditions.every((c: any) => (c?.kind === "injury" || c?.kind === "illness") && isInt(c.severity)) &&
    typeof sv.morale === "number"
  );
}

/** 예전 버전 저장 데이터를 현재 형식으로 바꾼다. (1단계 → … → 5단계) */
export function migrateSave(data: any): any {
  if (data && data.version === 1) {
    data = { ...data, version: 2, seed: Date.now() % 2147483647, lastAction: null, actionsLeft: data.phase === "maintenance" ? 0 : data.actionsLeft };
  }
  // 2단계 → 3단계: 시설 가동 스위치 추가
  if (data && data.version === 2 && Array.isArray(data.rooms)) {
    data = {
      ...data,
      version: 3,
      rooms: data.rooms.map((r: any) => ({
        ...r,
        facilities: Array.isArray(r?.facilities) ? r.facilities.map((f: any) => ({ enabled: true, ...f })) : r?.facilities,
      })),
    };
  }
  // 3단계 → 4단계: 기반 시설(전력선·수도관) 추가
  if (data && data.version === 3) data = { ...data, version: 4, lines: { power: [], water: [] } };
  // 4단계 → 5단계: 생존자 시스템 추가
  if (data && data.version === 4) data = { ...data, version: 5, survivors: [createPlayer()], pending: [], debrisMarks: [] };
  // 5단계 → 6단계: 사건·위협·장소·게임 오버
  if (data && data.version === 5) data = { ...data, version: 6, threat: null, places: [], events: { serial: 0, list: [] }, gameOver: null };
  // 6단계 → 업데이트 1: 확장 구역이 붙은 넓은 맵, 구역 안의 방
  if (data && data.version === 6 && Array.isArray(data.map) && Array.isArray(data.rooms)) {
    const fresh = parseLayout(STATION_LAYOUT);
    const oldW = data.map[0]?.length ?? 0;
    // 기존 맵에서 플레이어가 바꾼 부분(29열 왼쪽)은 그대로 두고, 오른쪽은 새 맵으로 붙인다
    const map = fresh.map((row, y) => row.map((t, x) => (x < Math.min(29, oldW) && data.map[y]?.[x] ? data.map[y][x] : t)));
    let nextId = data.nextId;
    const extra = ZONE_PRESET_ROOMS.map((p) => ({
      id: `room${nextId++}`,
      name: p.name,
      type: p.type,
      rect: p.rect,
      facilities: p.facilities.map((f) => ({
        id: `fac${nextId++}`,
        type: f.type,
        x: f.x,
        y: f.y,
        rotated: f.rotated ?? false,
        durability: f.durability ?? FACILITY_BY_ID[f.type].maxDurability,
        enabled: true,
      })),
    }));
    data = { ...data, version: 7, map, rooms: [...data.rooms, ...extra], nextId, zones: [] };
  }
  // 업데이트 1 → 업데이트 2: 특성·부상·질병·사기·관계
  if (data && data.version === 7 && Array.isArray(data.survivors)) {
    let seed = isInt(data.seed) ? data.seed : 1;
    const upgrade = (sv: any) => {
      let traits: string[] = [];
      if (!sv.isPlayer) [traits, seed] = rollTraits(seed);
      return { ...sv, traits, conditions: [], morale: sv.isPlayer ? 100 : 60 };
    };
    data = {
      ...data,
      version: 8,
      survivors: data.survivors.map(upgrade),
      pending: Array.isArray(data.pending) ? data.pending.map((p: any) => ({ ...p, survivor: upgrade(p.survivor) })) : data.pending,
      relations: {},
      seed,
    };
  }
  // 업데이트 2 → 업데이트 3: 제작 품목 지정
  if (data && data.version === 8) data = { ...data, version: 9, craftTarget: "parts" };
  // 업데이트 3 → 업데이트 4: 외부 세계, 특별 배급
  if (data && data.version === 9) data = { ...data, version: 10, feastDay: 0, world: createWorld() };
  // 업데이트 4 → 업데이트 5: 지하 2층(맵 아래로 확장), 옛 변전소, 장기 목표
  if (data && data.version === 10 && Array.isArray(data.map) && Array.isArray(data.rooms)) {
    const fresh = parseLayout(STATION_LAYOUT);
    const oldH = data.map.length;
    const map = fresh.map((row, y) =>
      row.map((t, x) => {
        // 지하 2층으로 내려가는 점검 통로·셔터는 새 맵을 따르고, 나머지 기존 칸은 그대로
        const passage = x === 3 && y >= 14 && y <= 16;
        return y < oldH && !passage && data.map[y]?.[x] ? data.map[y][x] : t;
      }),
    );
    let nextId = data.nextId;
    const names = new Set(data.rooms.map((r: any) => r.name));
    const extra = ZONE_PRESET_ROOMS.filter((p) => !names.has(p.name)).map((p) => ({
      id: `room${nextId++}`,
      name: p.name,
      type: p.type,
      rect: p.rect,
      facilities: p.facilities.map((f) => ({
        id: `fac${nextId++}`,
        type: f.type,
        x: f.x,
        y: f.y,
        rotated: f.rotated ?? false,
        durability: f.durability ?? FACILITY_BY_ID[f.type].maxDurability,
        enabled: true,
      })),
    }));
    data = {
      ...data,
      version: 11,
      map,
      rooms: [...data.rooms, ...extra],
      nextId,
      goals: [],
      stats: { harvests: 0, expeditions: 0, raidsRepelled: 0 },
      cityDay: null,
    };
  }
  // 업데이트 5 → 탐색 개편: 지금까지 본 곳은 모두 밝히고, 열지 않은 봉쇄 구역만 가린다
  if (data && data.version === 11 && Array.isArray(data.map)) {
    let explored = data.map.map((row: any[]) => "1".repeat(row.length));
    const opened: string[] = Array.isArray(data.zones) ? data.zones : [];
    for (const z of ZONES)
      if (!opened.includes(z.id))
        explored = explored.map((row: string, y: number) =>
          y < z.rect.y || y >= z.rect.y + z.rect.h ? row : row.slice(0, z.rect.x) + "0".repeat(z.rect.w) + row.slice(z.rect.x + z.rect.w),
        );
    data = { ...data, version: 12, explored };
  }
  return data;
}

export type LoadResult = { status: "ok"; state: GameState } | { status: "empty" } | { status: "corrupt" };

export function loadGame(): LoadResult {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { status: "empty" };
    const data = migrateSave(JSON.parse(raw));
    return validateSave(data) ? { status: "ok", state: data } : { status: "corrupt" };
  } catch {
    return { status: "corrupt" };
  }
}

export function saveGame(state: GameState): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 무시 */
  }
}
