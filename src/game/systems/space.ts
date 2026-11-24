// 방 및 공간 시스템 + 시설 배치 규칙.
// 모든 함수는 순수 함수다: 상태를 직접 바꾸지 않고 새 상태를 돌려준다.
// can*() 함수로 먼저 검사하고(미리보기·버튼 활성화에 사용), 통과하면 apply 함수로 적용한다.

import { FACILITY_BY_ID } from "../config/facilities";
import { ROOM_TYPE_BY_ID } from "../config/rooms";
import { RULES } from "../config/rules";
import { area, rectContains, rectsOverlap, rectTiles, sameRect, tilesOutside } from "../core/geometry";
import { applyBundle, bundleText, canAfford, missingText, scaleBundle } from "../core/resources";
import type {
  Check,
  Facility,
  FacilityTypeId,
  GameState,
  LogEntry,
  Rect,
  ResourceBundle,
  Room,
  RoomTypeId,
} from "../core/types";
import { canModifyBase, NOT_MAINTENANCE_REASON } from "./phase";

// ───────────── 공통 도우미 ─────────────

const fail = (reason: string): Check => ({ ok: false, reason });
const pass = (cost: ResourceBundle = {}, refund: ResourceBundle = {}): Check => ({ ok: true, cost, refund });

export function getRoom(state: GameState, roomId: string): Room | undefined {
  return state.rooms.find((r) => r.id === roomId);
}

export function facilityRect(f: Pick<Facility, "type" | "x" | "y" | "rotated">): Rect {
  const def = FACILITY_BY_ID[f.type];
  return { x: f.x, y: f.y, w: f.rotated ? def.h : def.w, h: f.rotated ? def.w : def.h };
}

export function roomCost(rect: Rect): ResourceBundle {
  return { materials: RULES.room.baseMaterials + RULES.room.materialsPerTile * area(rect) };
}

function withLog(state: GameState, text: string, kind: LogEntry["kind"] = "build"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

function newId(state: GameState, prefix: string): [string, GameState] {
  return [`${prefix}${state.nextId}`, { ...state, nextId: state.nextId + 1 }];
}

function replaceRoom(state: GameState, room: Room): GameState {
  return { ...state, rooms: state.rooms.map((r) => (r.id === room.id ? room : r)) };
}

function defaultRoomName(state: GameState, type: RoomTypeId): string {
  const base = ROOM_TYPE_BY_ID[type].name;
  const used = new Set(state.rooms.map((r) => r.name));
  for (let i = 1; ; i++) {
    const name = `${base} ${i}`;
    if (!used.has(name)) return name;
  }
}

// ───────────── 방 영역 검사 ─────────────

/** 방 영역이 규칙에 맞는지 검사한다. 문제가 있으면 이유를, 없으면 null을 돌려준다. */
export function validateRoomRect(
  state: GameState,
  rect: Rect,
  type: RoomTypeId,
  ignoreRoomId?: string,
): string | null {
  const H = state.map.length;
  const W = state.map[0].length;
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > W || rect.y + rect.h > H) return "맵 밖으로 나갈 수 없습니다.";

  const def = ROOM_TYPE_BY_ID[type];
  const short = Math.min(rect.w, rect.h);
  const long = Math.max(rect.w, rect.h);
  if (short < def.minShort || long < def.minLong)
    return `${def.name}은(는) 최소 ${def.minShort}×${def.minLong} 크기가 필요합니다.`;
  if (area(rect) > RULES.room.maxArea) return `방은 최대 ${RULES.room.maxArea}칸까지 만들 수 있습니다.`;

  for (const p of rectTiles(rect)) {
    const t = state.map[p.y][p.x];
    if (t !== "floor") {
      if (t === "debris") return "잔해가 남아 있는 칸에는 방을 만들 수 없습니다.";
      if (t === "pillar") return "구조 기둥이 있는 칸에는 방을 만들 수 없습니다.";
      if (t === "platform") return "승강장에는 방을 만들 수 없습니다.";
      return "정리된 바닥에만 방을 만들 수 있습니다.";
    }
  }
  for (const r of state.rooms) {
    if (r.id === ignoreRoomId) continue;
    if (rectsOverlap(r.rect, rect)) return `'${r.name}'과(와) 겹칩니다.`;
  }
  return null;
}

// ───────────── 방 생성 ─────────────

export function canCreateRoom(state: GameState, rect: Rect, type: RoomTypeId): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const err = validateRoomRect(state, rect, type);
  if (err) return fail(err);
  const cost = roomCost(rect);
  if (!canAfford(state.resources, cost)) return fail(missingText(state.resources, cost));
  return pass(cost);
}

export function createRoom(state: GameState, rect: Rect, type: RoomTypeId, name?: string): GameState {
  const check = canCreateRoom(state, rect, type);
  if (!check.ok) return state;
  const [id, s1] = newId(state, "room");
  const room: Room = { id, name: name?.trim() || defaultRoomName(state, type), type, rect, facilities: [] };
  const s2 = { ...s1, rooms: [...s1.rooms, room], resources: applyBundle(s1.resources, check.cost, -1) };
  return withLog(s2, `'${room.name}' 생성 (${rect.w}×${rect.h}, ${bundleText(check.cost)} 사용)`);
}

// ───────────── 방 크기 변경 ─────────────

export function canResizeRoom(state: GameState, roomId: string, rect: Rect): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  if (!room) return fail("방을 찾을 수 없습니다.");
  if (sameRect(room.rect, rect)) return fail("크기가 바뀌지 않았습니다.");
  const err = validateRoomRect(state, rect, room.type, room.id);
  if (err) return fail(err);
  for (const f of room.facilities) {
    if (!rectContains(rect, facilityRect(f)))
      return fail(`'${FACILITY_BY_ID[f.type].name}'이(가) 방 밖으로 벗어납니다. 먼저 옮기거나 철거하세요.`);
  }
  const added = tilesOutside(rect, room.rect);
  const removed = tilesOutside(room.rect, rect);
  const cost: ResourceBundle = added > 0 ? { materials: added * RULES.room.materialsPerTile } : {};
  const refund = scaleBundle({ materials: removed * RULES.room.materialsPerTile }, RULES.refundRate);
  if (!canAfford(state.resources, cost)) return fail(missingText(state.resources, cost));
  return pass(cost, refund);
}

export function resizeRoom(state: GameState, roomId: string, rect: Rect): GameState {
  const check = canResizeRoom(state, roomId, rect);
  if (!check.ok) return state;
  const room = getRoom(state, roomId)!;
  let s = replaceRoom(state, { ...room, rect });
  s = { ...s, resources: applyBundle(applyBundle(s.resources, check.cost, -1), check.refund, 1) };
  return withLog(s, `'${room.name}' 크기 변경 ${room.rect.w}×${room.rect.h} → ${rect.w}×${rect.h}`);
}

// ───────────── 방 철거 / 이름 / 용도 ─────────────

export function canDeleteRoom(state: GameState, roomId: string): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  if (!room) return fail("방을 찾을 수 없습니다.");
  if (room.facilities.length > 0) return fail("방 안의 시설을 먼저 모두 철거해야 합니다.");
  return pass({}, scaleBundle(roomCost(room.rect), RULES.refundRate));
}

export function deleteRoom(state: GameState, roomId: string): GameState {
  const check = canDeleteRoom(state, roomId);
  if (!check.ok) return state;
  const room = getRoom(state, roomId)!;
  const s = {
    ...state,
    rooms: state.rooms.filter((r) => r.id !== roomId),
    resources: applyBundle(state.resources, check.refund, 1),
  };
  return withLog(s, `'${room.name}' 철거 (${bundleText(check.refund)} 회수)`);
}

export function canRenameRoom(state: GameState, roomId: string, name: string): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  if (!room) return fail("방을 찾을 수 없습니다.");
  const n = name.trim();
  if (!n) return fail("이름을 입력하세요.");
  if (n.length > RULES.room.maxNameLength) return fail(`이름은 ${RULES.room.maxNameLength}자 이하로 입력하세요.`);
  if (n === room.name) return fail("이름이 같습니다.");
  if (state.rooms.some((r) => r.id !== roomId && r.name === n)) return fail("같은 이름의 방이 이미 있습니다.");
  return pass();
}

export function renameRoom(state: GameState, roomId: string, name: string): GameState {
  if (!canRenameRoom(state, roomId, name).ok) return state;
  const room = getRoom(state, roomId)!;
  return withLog(replaceRoom(state, { ...room, name: name.trim() }), `'${room.name}' 이름 변경 → '${name.trim()}'`, "info");
}

export function canChangeRoomType(state: GameState, roomId: string, type: RoomTypeId): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  if (!room) return fail("방을 찾을 수 없습니다.");
  if (room.type === type) return fail("이미 같은 용도입니다.");
  if (room.facilities.some((f) => FACILITY_BY_ID[f.type].room !== type))
    return fail("새 용도에 맞지 않는 시설이 있습니다. 먼저 철거하세요.");
  const err = validateRoomRect(state, room.rect, type, room.id);
  if (err) return fail(err);
  const cost = { materials: RULES.room.changeTypeMaterials };
  if (!canAfford(state.resources, cost)) return fail(missingText(state.resources, cost));
  return pass(cost);
}

export function changeRoomType(state: GameState, roomId: string, type: RoomTypeId): GameState {
  const check = canChangeRoomType(state, roomId, type);
  if (!check.ok) return state;
  const room = getRoom(state, roomId)!;
  const s = { ...replaceRoom(state, { ...room, type }), resources: applyBundle(state.resources, check.cost, -1) };
  return withLog(s, `'${room.name}' 용도 변경: ${ROOM_TYPE_BY_ID[room.type].name} → ${ROOM_TYPE_BY_ID[type].name}`);
}

// ───────────── 시설 배치 ─────────────

function checkFacilitySpot(room: Room, rect: Rect, ignoreFacilityId?: string): string | null {
  if (!rectContains(room.rect, rect)) return "시설이 방 밖으로 벗어납니다.";
  for (const f of room.facilities) {
    if (f.id === ignoreFacilityId) continue;
    if (rectsOverlap(facilityRect(f), rect)) return `'${FACILITY_BY_ID[f.type].name}'과(와) 겹칩니다.`;
  }
  return null;
}

export function canPlaceFacility(
  state: GameState,
  roomId: string,
  type: FacilityTypeId,
  x: number,
  y: number,
  rotated: boolean,
): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  if (!room) return fail("방을 찾을 수 없습니다.");
  const def = FACILITY_BY_ID[type];
  if (!def.buildable) return fail(`${def.name}은(는) 새로 건설할 수 없습니다.`);
  if (def.room !== room.type) return fail(`${def.name}은(는) ${ROOM_TYPE_BY_ID[def.room].name}에만 설치할 수 있습니다.`);
  const err = checkFacilitySpot(room, facilityRect({ type, x, y, rotated }));
  if (err) return fail(err);
  if (!canAfford(state.resources, def.cost)) return fail(missingText(state.resources, def.cost));
  return pass(def.cost);
}

export function placeFacility(
  state: GameState,
  roomId: string,
  type: FacilityTypeId,
  x: number,
  y: number,
  rotated: boolean,
): GameState {
  const check = canPlaceFacility(state, roomId, type, x, y, rotated);
  if (!check.ok) return state;
  const def = FACILITY_BY_ID[type];
  const [id, s1] = newId(state, "fac");
  const room = getRoom(s1, roomId)!;
  const fac: Facility = { id, type, x, y, rotated, durability: def.maxDurability, enabled: true };
  let s = replaceRoom(s1, { ...room, facilities: [...room.facilities, fac] });
  s = { ...s, resources: applyBundle(s.resources, check.cost, -1) };
  return withLog(s, `'${room.name}'에 ${def.name} 설치 (${bundleText(check.cost)} 사용)`);
}

export function canMoveFacility(
  state: GameState,
  roomId: string,
  facilityId: string,
  x: number,
  y: number,
  rotated: boolean,
): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  const fac = room?.facilities.find((f) => f.id === facilityId);
  if (!room || !fac) return fail("시설을 찾을 수 없습니다.");
  const def = FACILITY_BY_ID[fac.type];
  if (def.fixed) return fail(`${def.name}은(는) 역사에 고정된 설비라 옮길 수 없습니다.`);
  if (fac.x === x && fac.y === y && fac.rotated === rotated) return fail("위치가 바뀌지 않았습니다.");
  const err = checkFacilitySpot(room, facilityRect({ type: fac.type, x, y, rotated }), fac.id);
  if (err) return fail(err);
  return pass();
}

export function moveFacility(
  state: GameState,
  roomId: string,
  facilityId: string,
  x: number,
  y: number,
  rotated: boolean,
): GameState {
  if (!canMoveFacility(state, roomId, facilityId, x, y, rotated).ok) return state;
  const room = getRoom(state, roomId)!;
  const fac = room.facilities.find((f) => f.id === facilityId)!;
  const s = replaceRoom(state, {
    ...room,
    facilities: room.facilities.map((f) => (f.id === facilityId ? { ...f, x, y, rotated } : f)),
  });
  return withLog(s, `${FACILITY_BY_ID[fac.type].name} 위치 변경`, "info");
}

export function canRemoveFacility(state: GameState, roomId: string, facilityId: string): Check {
  if (!canModifyBase(state)) return fail(NOT_MAINTENANCE_REASON);
  const room = getRoom(state, roomId);
  const fac = room?.facilities.find((f) => f.id === facilityId);
  if (!room || !fac) return fail("시설을 찾을 수 없습니다.");
  const def = FACILITY_BY_ID[fac.type];
  if (def.fixed) return fail(`${def.name}은(는) 역사에 고정된 설비라 철거할 수 없습니다.`);
  return pass({}, scaleBundle(def.cost, RULES.refundRate));
}

export function removeFacility(state: GameState, roomId: string, facilityId: string): GameState {
  const check = canRemoveFacility(state, roomId, facilityId);
  if (!check.ok) return state;
  const room = getRoom(state, roomId)!;
  const fac = room.facilities.find((f) => f.id === facilityId)!;
  let s = replaceRoom(state, { ...room, facilities: room.facilities.filter((f) => f.id !== facilityId) });
  s = { ...s, resources: applyBundle(s.resources, check.refund, 1) };
  return withLog(s, `${FACILITY_BY_ID[fac.type].name} 철거 (${bundleText(check.refund)} 회수)`);
}
