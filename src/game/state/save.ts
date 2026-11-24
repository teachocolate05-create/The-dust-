import { FACILITY_BY_ID } from "../config/facilities";
import { RESOURCES } from "../config/resources";
import { ROOM_TYPE_BY_ID } from "../config/rooms";
import type { GameState, TileType } from "../core/types";
import { SAVE_VERSION } from "./initialState";

// 브라우저 LocalStorage 저장.
// 불러온 데이터는 반드시 검증한다. 손상된 데이터는 사용하지 않는다.

export const SAVE_KEY = "the-dust-save";

const TILES: TileType[] = ["rock", "floor", "debris", "pillar", "platform", "track", "entrance", "watersource"];
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
    }
  }
  if (!Array.isArray(data.log)) return false;
  return true;
}

export type LoadResult = { status: "ok"; state: GameState } | { status: "empty" } | { status: "corrupt" };

export function loadGame(): LoadResult {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { status: "empty" };
    const data = JSON.parse(raw);
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
