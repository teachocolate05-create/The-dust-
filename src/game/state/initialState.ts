import { FACILITY_BY_ID } from "../config/facilities";
import { parseLayout, STATION_LAYOUT } from "../config/map";
import { STARTING_RESOURCES } from "../config/resources";
import { RULES } from "../config/rules";
import { createPlayer } from "../systems/survivors";
import type { FacilityTypeId, GameState, Rect, Room, RoomTypeId } from "../core/types";

export const SAVE_VERSION = 7;

/** 확장 구역 안에 남아 있는 방 (구역을 열고 길을 뚫어야 쓸 수 있다) */
export const ZONE_PRESET_ROOMS: PresetRoom[] = [
  {
    name: "버려진 자재 창고",
    type: "storage",
    rect: { x: 36, y: 4, w: 3, h: 2 },
    facilities: [{ type: "crate", x: 36, y: 4, durability: 50 }],
  },
];

// 시작 시 역사에 남아 있는 공간 (기획서 2-2, 2-3)
export interface PresetRoom {
  name: string;
  type: RoomTypeId;
  rect: Rect;
  facilities: { type: FacilityTypeId; x: number; y: number; rotated?: boolean; durability?: number }[];
}

const PRESET_ROOMS: PresetRoom[] = [
  {
    name: "임시 거주 구역",
    type: "residence",
    rect: { x: 12, y: 3, w: 3, h: 3 },
    facilities: [{ type: "cot", x: 12, y: 3 }],
  },
  {
    name: "비상 발전실",
    type: "power",
    rect: { x: 3, y: 9, w: 4, h: 3 },
    facilities: [{ type: "emergency_gen", x: 4, y: 10, durability: 38 }],
  },
  {
    name: "옛 창고",
    type: "storage",
    rect: { x: 22, y: 4, w: 3, h: 2 },
    facilities: [{ type: "shelf", x: 22, y: 4, durability: 70 }],
  },
  ...ZONE_PRESET_ROOMS,
];

export function createInitialState(seed: number = Date.now() % 2147483647): GameState {
  let nextId = 1;
  const rooms: Room[] = PRESET_ROOMS.map((p) => ({
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

  return {
    version: SAVE_VERSION,
    day: 1,
    phase: "morning",
    actionsLeft: RULES.actionsPerPhase,
    resources: { ...STARTING_RESOURCES },
    map: parseLayout(STATION_LAYOUT),
    rooms,
    nextId,
    seed,
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
    log: [
      {
        day: 1,
        phase: "morning",
        kind: "info",
        text: "폐쇄된 환승역에 도착했다. 출입구 아래 좁은 공간만 겨우 쓸 수 있다. 잔해 너머 어딘가에 비상 발전기와 옛 창고가 있다고 들었다.",
      },
    ],
  };
}
