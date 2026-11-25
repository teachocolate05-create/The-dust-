// 시야(전장의 안개) 시스템
//  - 열린 곳: 출입구와 이어진 통로(바닥·승강장·출입구) + 출입 가능한 방
//  - 보이는 곳: 열린 곳과 그 상하좌우 한 칸
//  - 한 번 본 칸은 지도에 계속 남는다 (state.explored)
//  - 봉쇄 구역은 셔터를 열기 전까지 보이지 않고, 열면 구역 전체가 드러난다

import type { GameState, Rect } from "../core/types";
import { computeAccess } from "./access";

const DIRS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function isExplored(state: GameState, x: number, y: number): boolean {
  return state.explored[y]?.[x] === "1";
}

export function emptyExplored(h: number, w: number): string[] {
  return Array.from({ length: h }, () => "0".repeat(w));
}

export function fullExplored(h: number, w: number): string[] {
  return Array.from({ length: h }, () => "1".repeat(w));
}

/** 직사각형 영역을 탐색한 것으로 표시 */
export function revealRect(explored: string[], r: Rect): string[] {
  return explored.map((row, y) => {
    if (y < r.y || y >= r.y + r.h) return row;
    const chars = [...row];
    for (let x = r.x; x < r.x + r.w && x < chars.length; x++) chars[x] = "1";
    return chars.join("");
  });
}

/** 지금 열린 곳과 그 주변 한 칸을 탐색 기록에 더한다 */
export function updateExplored(state: GameState): GameState {
  const H = state.map.length;
  const W = state.map[0].length;
  const access = computeAccess(state);
  const open: [number, number][] = [];
  for (const k of access.corridor) {
    const [x, y] = k.split(",").map(Number);
    open.push([x, y]);
  }
  for (const room of state.rooms) {
    if (!access.roomAccess[room.id]) continue;
    const { x, y, w, h } = room.rect;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) open.push([xx, yy]);
  }
  const grid = state.explored.map((row) => [...row]);
  let changed = false;
  for (const [x, y] of open)
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grid[ny][nx] !== "1") {
        grid[ny][nx] = "1";
        changed = true;
      }
    }
  if (!changed) return state;
  return { ...state, explored: grid.map((r) => r.join("")) };
}

/** 방의 한 칸이라도 본 적이 있으면 알고 있는 방 (못 본 방은 목록·지도 이름표에 나오지 않는다) */
export function roomKnown(state: GameState, rect: Rect): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (state.explored[y]?.[x] === "1") return true;
  return false;
}
