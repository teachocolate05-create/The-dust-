import { FACILITY_BY_ID } from "../config/facilities";
import { parseLayout, STATION_LAYOUT } from "../config/map";
import { STARTING_RESOURCES } from "../config/resources";
import { RULES } from "../config/rules";
import { createPlayer } from "../systems/survivors";
import { createWorld } from "../systems/world";
import type { FacilityTypeId, GameState, Point, Rect, Room, RoomTypeId, TileType } from "../core/types";
import { randomInt } from "../core/random";
import { emptyExplored, fullExplored, updateExplored } from "../systems/vision";

export const SAVE_VERSION = 13;

/** 확장 구역 안에 남아 있는 방 (구역을 열고 길을 뚫어야 쓸 수 있다) */
export const ZONE_PRESET_ROOMS: PresetRoom[] = [
  {
    name: "버려진 자재 창고",
    type: "storage",
    rect: { x: 36, y: 4, w: 3, h: 2 },
    facilities: [{ type: "crate", x: 36, y: 4, durability: 50 }],
  },
  {
    name: "옛 변전소",
    type: "power",
    rect: { x: 5, y: 19, w: 5, h: 4 },
    facilities: [{ type: "substation", x: 6, y: 20, durability: 0 }],
  },
];

// 시작 시 역사에 남아 있는 공간 (기획서 2-2, 2-3)
export interface PresetRoom {
  name: string;
  type: RoomTypeId;
  rect: Rect;
  facilities: { type: FacilityTypeId; x: number; y: number; rotated?: boolean; durability?: number }[];
}

/** 게임마다 위치가 바뀌는 대합실의 주요 시설 */
export interface StartFeatures {
  water: Point;
  generator: Rect; // 4×3, 안쪽에 비상 발전기
  storage: Rect; // 3×2, 안쪽에 보관 선반
}

function featureRooms(f: StartFeatures): PresetRoom[] {
  return [
    {
      name: "비상 발전실",
      type: "power",
      rect: f.generator,
      facilities: [{ type: "emergency_gen", x: f.generator.x + 1, y: f.generator.y + 1, durability: 38 }],
    },
    {
      name: "옛 창고",
      type: "storage",
      rect: f.storage,
      facilities: [{ type: "shelf", x: f.storage.x, y: f.storage.y, durability: 70 }],
    },
  ];
}

/** 대합실 범위와 피해야 할 칸 */
const CONCOURSE = { x1: 1, y1: 1, x2: 28, y2: 11 };
const ENTRANCE = { x: 14.5, y: 1.5 };
/** 봉쇄 셔터(29,4~5) 앞 칸은 비워 둔다 (막히면 구역을 열 수 없다) */
const KEEP_FREE = ["28,4", "28,5"];

/** 시작 시설 위치를 무작위로 정한다. 서로 1칸 이상 떨어지고, 입구에서 충분히 멀다 */
export function rollStartFeatures(seed: number, map: TileType[][]): [StartFeatures, number] {
  let s = seed;
  const taken: Rect[] = [{ x: 12, y: 0, w: 6, h: 5 }]; // 입구 주변
  const fits = (r: Rect, minDist: number) => {
    if (r.x < CONCOURSE.x1 || r.y < CONCOURSE.y1 || r.x + r.w - 1 > CONCOURSE.x2 || r.y + r.h - 1 > CONCOURSE.y2) return false;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (map[y][x] !== "debris") return false;
        if (KEEP_FREE.includes(`${x},${y}`)) return false;
      }
    // 다른 것과 1칸 이상 띄우기
    const grown = { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 };
    if (taken.some((t) => grown.x < t.x + t.w && t.x < grown.x + grown.w && grown.y < t.y + t.h && t.y < grown.y + grown.h)) return false;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return Math.abs(cx - ENTRANCE.x) + Math.abs(cy - ENTRANCE.y) >= minDist;
  };
  const place = (w: number, h: number, minDist: number): Rect => {
    for (let tries = 0; tries < 500; tries++) {
      let x: number;
      let y: number;
      [x, s] = randomInt(s, CONCOURSE.x1, CONCOURSE.x2 - w + 1);
      [y, s] = randomInt(s, CONCOURSE.y1, CONCOURSE.y2 - h + 1);
      const r = { x, y, w, h };
      if (fits(r, minDist)) {
        taken.push(r);
        return r;
      }
    }
    throw new Error("시작 시설을 놓을 자리를 찾지 못했습니다.");
  };
  const generator = place(4, 3, 9);
  const storage = place(3, 2, 8);
  const w = place(1, 1, 7);
  return [{ water: { x: w.x, y: w.y }, generator, storage }, s];
}

/** 시설을 맵에 새긴다: 방 안쪽은 바닥, 급수원 칸 */
function stamp(map: TileType[][], f: StartFeatures): TileType[][] {
  const m = map.map((row) => [...row]);
  for (const r of [f.generator, f.storage]) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) m[y][x] = "floor";
  m[f.water.y][f.water.x] = "watersource";
  return m;
}

function buildRooms(list: PresetRoom[], startId: number): [Room[], number] {
  let nextId = startId;
  const rooms: Room[] = list.map((p) => ({
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
  return [rooms, nextId];
}

export function createInitialState(seed: number = Date.now() % 2147483647): GameState {
  const base = parseLayout(STATION_LAYOUT);
  const [features, seed2] = rollStartFeatures(seed, base);
  const map = stamp(base, features);
  const [rooms, nextId] = buildRooms([...featureRooms(features), ...ZONE_PRESET_ROOMS], 1);
  const state: GameState = {
    version: SAVE_VERSION,
    day: 1,
    phase: "morning",
    actionsLeft: RULES.actionsPerPhase,
    resources: { ...STARTING_RESOURCES },
    map,
    rooms,
    nextId,
    seed: seed2,
    lastAction: null,
    lines: { power: [], water: [] },
    survivors: [createPlayer()],
    pending: [],
    debrisMarks: [],
    threat: null,
    places: [],
    events: { serial: 0, list: [] },
    gameOver: null,
    zones: [],
    relations: {},
    craftTarget: "parts",
    feastDay: 0,
    goals: [],
    stats: { harvests: 0, expeditions: 0, raidsRepelled: 0 },
    cityDay: null,
    world: createWorld(),
    explored: emptyExplored(map.length, map[0].length),
    medicine: 0,
    medicineFound: { day: 0, count: 0 },
    log: [
      {
        day: 1,
        phase: "morning",
        kind: "info",
        text: "폐쇄된 환승역에 도착했다. 출입구 아래 좁은 공간 말고는 어둠과 잔해뿐이다. 이 대합실 어딘가에 비상 발전기와 옛 창고, 그리고 물이 나오는 배관이 있다고 들었다.",
      },
    ],
  };
  return updateExplored(state);
}

/**
 * 테스트용 고정 시작 상태: 예전(4단계~업데이트 5) 고정 배치를 그대로 쓰고, 지도를 모두 밝힌다.
 * 임시 거주 구역(12,3 3×3, 침상)·비상 발전실(3,9 4×3)·옛 창고(22,4 3×2)·급수원(1,9)
 */
export function createTestState(seed = 1): GameState {
  const s = createInitialState(seed);
  const features: StartFeatures = { water: { x: 1, y: 9 }, generator: { x: 3, y: 9, w: 4, h: 3 }, storage: { x: 22, y: 4, w: 3, h: 2 } };
  let map = stamp(parseLayout(STATION_LAYOUT), features);
  map = map.map((row) => [...row]);
  for (let y = 3; y <= 5; y++) for (let x = 12; x <= 17; x++) map[y][x] = "floor";
  const residence: PresetRoom = { name: "임시 거주 구역", type: "residence", rect: { x: 12, y: 3, w: 3, h: 3 }, facilities: [{ type: "cot", x: 12, y: 3 }] };
  const [rooms, nextId] = buildRooms([residence, ...featureRooms(features), ...ZONE_PRESET_ROOMS], 1);
  return { ...s, map, rooms, nextId, seed, explored: fullExplored(map.length, map[0].length) };
}
