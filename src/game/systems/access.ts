import { pointInRect } from "../core/geometry";
import type { GameState, Point, Room, TileType } from "../core/types";

// 출입 판정: 지상 출입구에서 시작해 방이 아닌 통행 가능 타일(바닥·승강장·출입구)을 따라 도달할 수 있는
// "통로"를 구한다. 방은 이 통로와 한 변이라도 맞닿아 있어야 출입할 수 있다.

const WALKABLE: TileType[] = ["floor", "platform", "entrance"];

const key = (x: number, y: number) => `${x},${y}`;

export interface AccessInfo {
  /** 출입구에서 도달 가능한 통로 타일 */
  corridor: Set<string>;
  /** 방별 출입 가능 여부 */
  roomAccess: Record<string, boolean>;
  /** 방별 출입문 위치 (방 안쪽 타일 + 문이 난 방향) */
  doors: Record<string, { inside: Point; outside: Point } | null>;
}

function roomAtPoint(rooms: Room[], p: Point): Room | undefined {
  return rooms.find((r) => pointInRect(p, r.rect));
}

export function computeAccess(state: GameState): AccessInfo {
  const { map, rooms } = state;
  const H = map.length;
  const W = map[0].length;
  const corridor = new Set<string>();
  const queue: Point[] = [];

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (map[y][x] === "entrance") {
        corridor.add(key(x, y));
        queue.push({ x, y });
      }

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length) {
    const p = queue.shift()!;
    for (const [dx, dy] of dirs) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (corridor.has(key(nx, ny))) continue;
      if (!WALKABLE.includes(map[ny][nx])) continue;
      if (roomAtPoint(rooms, { x: nx, y: ny })) continue;
      corridor.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }

  const roomAccess: Record<string, boolean> = {};
  const doors: AccessInfo["doors"] = {};
  for (const room of rooms) {
    const { x, y, w, h } = room.rect;
    // 문 후보: 각 변의 가운데부터 바깥쪽으로 탐색 → 자연스러운 위치에 문 배치
    const candidates: { inside: Point; outside: Point }[] = [];
    const order = (n: number) => {
      const mid = Math.floor((n - 1) / 2);
      const res: number[] = [];
      for (let d = 0; res.length < n; d++) {
        if (mid - d >= 0) res.push(mid - d);
        if (d > 0 && mid + d < n) res.push(mid + d);
      }
      return res;
    };
    for (const i of order(w)) {
      candidates.push({ inside: { x: x + i, y: y + h - 1 }, outside: { x: x + i, y: y + h } });
      candidates.push({ inside: { x: x + i, y }, outside: { x: x + i, y: y - 1 } });
    }
    for (const j of order(h)) {
      candidates.push({ inside: { x, y: y + j }, outside: { x: x - 1, y: y + j } });
      candidates.push({ inside: { x: x + w - 1, y: y + j }, outside: { x: x + w, y: y + j } });
    }
    const door = candidates.find((c) => corridor.has(key(c.outside.x, c.outside.y))) ?? null;
    roomAccess[room.id] = door !== null;
    doors[room.id] = door;
  }

  return { corridor, roomAccess, doors };
}

export function isCorridor(info: AccessInfo, p: Point): boolean {
  return info.corridor.has(key(p.x, p.y));
}
