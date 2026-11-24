// 기반 시설 시스템 (기획서 7장): 전력선·수도관 설치/철거와 연결 판정.
//  - 선/관은 칸 단위로 깐다. 바닥·승강장(수도관은 급수원 칸도)에만 설치할 수 있다.
//  - 이어진 선 묶음 하나가 "망" 하나다. 시설은 차지한 칸이나 바로 옆 칸에 선이 지나가면 그 망에 연결된다.
//  - 시설 하나가 서로 다른 선 묶음 두 개에 닿으면 두 망은 하나로 합쳐진다 (시설이 분기점 역할).

import { FACILITY_BY_ID } from "../config/facilities";
import { RULES } from "../config/rules";
import { bundleText, canAfford, missingText, scaleBundle } from "../core/resources";
import type { Check, Facility, GameState, LogEntry, NetKind, Point, ResourceBundle, TileType } from "../core/types";
import { canModifyBase, NOT_MAINTENANCE_REASON } from "./phase";
import { facilityRect } from "./space";

export const NET_NAMES: Record<NetKind, { net: string; line: string }> = {
  power: { net: "전력망", line: "전력선" },
  water: { net: "수도망", line: "수도관" },
};

export const key = (x: number, y: number) => `${x},${y}`;
export const parseKey = (k: string): Point => {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
};

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function lineAllowedOn(kind: NetKind, t: TileType): boolean {
  if (t === "floor" || t === "platform") return true;
  return kind === "water" && t === "watersource";
}

/** 시작점에서 끝점까지 ㄱ자 경로 (가로 먼저, 그다음 세로) */
export function linePath(a: Point, b: Point): Point[] {
  const out: Point[] = [];
  const sx = Math.sign(b.x - a.x);
  for (let x = a.x; x !== b.x; x += sx) out.push({ x, y: a.y });
  const sy = Math.sign(b.y - a.y);
  for (let y = a.y; y !== b.y; y += sy) out.push({ x: b.x, y });
  out.push({ x: b.x, y: b.y });
  return out;
}

// ───────────── 설치 / 철거 ─────────────

export type LineCheck =
  | { ok: true; cost: ResourceBundle; refund: ResourceBundle; count: number }
  | { ok: false; reason: string };

export function canBuildLines(state: GameState, kind: NetKind, path: Point[]): LineCheck {
  if (!canModifyBase(state)) return { ok: false, reason: NOT_MAINTENANCE_REASON };
  const have = new Set(state.lines[kind]);
  let count = 0;
  for (const p of path) {
    const t = state.map[p.y]?.[p.x];
    if (!t || !lineAllowedOn(kind, t)) {
      const why = t === "debris" ? "잔해" : t === "pillar" ? "기둥" : t === "track" ? "선로" : "벽";
      return { ok: false, reason: `${why} 위에는 ${NET_NAMES[kind].line}을 깔 수 없습니다. (${p.x},${p.y})` };
    }
    if (!have.has(key(p.x, p.y))) count++;
  }
  if (count === 0) return { ok: false, reason: `이미 ${NET_NAMES[kind].line}이 깔려 있습니다.` };
  const unit = RULES.network.lineCost[kind] as ResourceBundle;
  const cost: ResourceBundle = {};
  for (const [k, v] of Object.entries(unit)) cost[k as keyof ResourceBundle] = (v as number) * count;
  if (!canAfford(state.resources, cost)) return { ok: false, reason: missingText(state.resources, cost) };
  return { ok: true, cost, refund: {}, count };
}

export function canRemoveLines(state: GameState, kind: NetKind, path: Point[]): LineCheck {
  if (!canModifyBase(state)) return { ok: false, reason: NOT_MAINTENANCE_REASON };
  const have = new Set(state.lines[kind]);
  const count = path.filter((p) => have.has(key(p.x, p.y))).length;
  if (count === 0) return { ok: false, reason: `철거할 ${NET_NAMES[kind].line}이 없습니다.` };
  const unit = RULES.network.lineCost[kind] as ResourceBundle;
  const total: ResourceBundle = {};
  for (const [k, v] of Object.entries(unit)) total[k as keyof ResourceBundle] = (v as number) * count;
  return { ok: true, cost: {}, refund: scaleBundle(total, RULES.refundRate), count };
}

function log(state: GameState, text: string, kind: LogEntry["kind"] = "build"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

function applyRes(state: GameState, b: ResourceBundle, sign: 1 | -1): GameState["resources"] {
  const r = { ...state.resources };
  for (const [k, v] of Object.entries(b)) r[k as keyof typeof r] += sign * (v as number);
  return r;
}

export function buildLines(state: GameState, kind: NetKind, path: Point[]): GameState {
  const chk = canBuildLines(state, kind, path);
  if (!chk.ok) return state;
  const set = new Set(state.lines[kind]);
  for (const p of path) set.add(key(p.x, p.y));
  const s = { ...state, lines: { ...state.lines, [kind]: [...set].sort() }, resources: applyRes(state, chk.cost, -1) };
  return log(s, `${NET_NAMES[kind].line} ${chk.count}칸 설치 (${bundleText(chk.cost)} 사용)`);
}

export function removeLines(state: GameState, kind: NetKind, path: Point[]): GameState {
  const chk = canRemoveLines(state, kind, path);
  if (!chk.ok) return state;
  const del = new Set(path.map((p) => key(p.x, p.y)));
  const s = {
    ...state,
    lines: { ...state.lines, [kind]: state.lines[kind].filter((k) => !del.has(k)) },
    resources: applyRes(state, chk.refund, 1),
  };
  return log(s, `${NET_NAMES[kind].line} ${chk.count}칸 철거${Object.keys(chk.refund).length ? ` (${bundleText(chk.refund)} 회수)` : ""}`);
}

// ───────────── 연결 판정 ─────────────

/** 시설이 닿는 칸: 차지한 칸 + 바로 옆 칸 */
export function touchKeys(f: Pick<Facility, "type" | "x" | "y" | "rotated">): string[] {
  const r = facilityRect(f);
  const out = new Set<string>();
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      out.add(key(x, y));
      for (const [dx, dy] of DIRS) out.add(key(x + dx, y + dy));
    }
  return [...out];
}

export interface NetInfo {
  /** 칸 → 망 번호 (1부터) */
  netOf: Map<string, number>;
  /** 시설 → 망 번호 */
  facilityNet: Record<string, number | undefined>;
  /** 망 번호 목록 */
  ids: number[];
  /** 수도망: 망마다 연결된 급수원 수 */
  sources: Record<number, number>;
}

export function computeNets(state: GameState, kind: NetKind): NetInfo {
  const tiles = new Set(state.lines[kind]);
  // 1) 이어진 선 묶음 찾기
  const comp = new Map<string, number>();
  let n = 0;
  for (const k of tiles) {
    if (comp.has(k)) continue;
    n++;
    const queue = [k];
    comp.set(k, n);
    while (queue.length) {
      const p = parseKey(queue.pop()!);
      for (const [dx, dy] of DIRS) {
        const nk = key(p.x + dx, p.y + dy);
        if (tiles.has(nk) && !comp.has(nk)) {
          comp.set(nk, n);
          queue.push(nk);
        }
      }
    }
  }
  // 2) 시설이 여러 묶음에 닿으면 합치기 (union-find)
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const facTouch: Record<string, number[]> = {};
  for (const room of state.rooms)
    for (const f of room.facilities) {
      const ids = [...new Set(touchKeys(f).map((k) => comp.get(k)).filter((v): v is number => v !== undefined))];
      facTouch[f.id] = ids;
      for (let i = 1; i < ids.length; i++) parent[find(ids[i])] = find(ids[0]);
    }
  // 3) 번호를 1부터 다시 매김
  const renum = new Map<number, number>();
  const id = (c: number) => {
    const r = find(c);
    if (!renum.has(r)) renum.set(r, renum.size + 1);
    return renum.get(r)!;
  };
  const netOf = new Map<string, number>();
  for (const [k, c] of comp) netOf.set(k, id(c));
  const facilityNet: NetInfo["facilityNet"] = {};
  for (const [fid, ids] of Object.entries(facTouch)) facilityNet[fid] = ids.length ? id(ids[0]) : undefined;

  // 4) 급수원 연결 (수도관이 급수원 칸 위나 바로 옆을 지나면 연결)
  const sources: Record<number, number> = {};
  if (kind === "water") {
    state.map.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t !== "watersource") return;
        const nets = new Set<number>();
        for (const [dx, dy] of [[0, 0], ...DIRS]) {
          const v = netOf.get(key(x + dx, y + dy));
          if (v) nets.add(v);
        }
        for (const v of nets) sources[v] = (sources[v] ?? 0) + 1;
      }),
    );
  }
  return { netOf, facilityNet, ids: [...renum.values()].sort((a, b) => a - b), sources };
}

/** 시설이 어떤 망을 필요로 하는지 */
export function needsNet(type: Facility["type"]): { power: boolean; water: boolean } {
  const def = FACILITY_BY_ID[type];
  return { power: def.power !== 0, water: !!def.produces.water };
}

export function lineCheckToCheck(c: LineCheck): Check {
  return c.ok ? { ok: true, cost: c.cost, refund: c.refund } : c;
}
