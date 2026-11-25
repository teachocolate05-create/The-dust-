// 구역 개방 시스템 (업데이트 1)
import { ZONE_BY_ID, ZONES, type ZoneDef } from "../config/zones";
import { RULES } from "../config/rules";
import { pointInRect } from "../core/geometry";
import { bundleText, canAfford, missingText } from "../core/resources";
import type { Check, GameState, LogEntry, Point } from "../core/types";
import { computeAccess } from "./access";
import { canModifyBase, NOT_MAINTENANCE_REASON } from "./phase";
import { isExplored, revealRect } from "./vision";

export function isZoneOpen(state: GameState, id: string): boolean {
  return state.zones.includes(id);
}

/** 이 칸이 아직 열리지 않은 구역 안에 있으면 그 구역 */
export function lockedZoneAt(state: GameState, p: Point): ZoneDef | undefined {
  return ZONES.find((z) => !isZoneOpen(state, z.id) && pointInRect(p, z.rect));
}

/** 셔터를 본 적이 있는 구역 (열기 전에는 이름도 모른다) */
export function gateSeen(state: GameState, id: string): boolean {
  const z = ZONE_BY_ID[id];
  return !!z && z.gates.some((g) => isExplored(state, g.x, g.y));
}

/** 이 칸이 아직 열리지 않은 구역의 셔터면 그 구역 */
export function gateZoneAt(state: GameState, p: Point): ZoneDef | undefined {
  return ZONES.find((z) => !isZoneOpen(state, z.id) && z.gates.some((g) => g.x === p.x && g.y === p.y));
}

export function canOpenZone(state: GameState, id: string): Check {
  const z = ZONE_BY_ID[id];
  if (!z) return { ok: false, reason: "알 수 없는 구역입니다." };
  if (isZoneOpen(state, id)) return { ok: false, reason: "이미 개방한 구역입니다." };
  if (z.requires && !isZoneOpen(state, z.requires)) return { ok: false, reason: `먼저 '${ZONE_BY_ID[z.requires].name}'을(를) 개방해야 합니다.` };
  if (!canModifyBase(state)) return { ok: false, reason: NOT_MAINTENANCE_REASON };
  const access = computeAccess(state);
  const reach = z.gates.some((g) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => access.corridor.has(`${g.x + dx},${g.y + dy}`)));
  if (!reach) return { ok: false, reason: "셔터 앞까지 길이 뚫려 있지 않습니다. 잔해를 치워 셔터에 닿게 하세요." };
  if (!canAfford(state.resources, z.cost)) return { ok: false, reason: missingText(state.resources, z.cost) };
  return { ok: true, cost: z.cost, refund: {} };
}

export function openZone(state: GameState, id: string): GameState {
  const chk = canOpenZone(state, id);
  if (!chk.ok) return state;
  const z = ZONE_BY_ID[id];
  const map = state.map.map((row) => [...row]);
  for (const g of z.gates) map[g.y][g.x] = "floor";
  const resources = { ...state.resources };
  for (const [k, v] of Object.entries(chk.cost)) resources[k as keyof typeof resources] -= v as number;
  const entry: LogEntry = {
    day: state.day,
    phase: state.phase,
    kind: "build",
    text: `셔터를 열어 '${z.name}'을(를) 개방했다. (${bundleText(chk.cost)} 사용) ${z.desc}`,
  };
  // 셔터를 열면 구역 전체가 지도에 드러나고 계속 남는다
  const explored = revealRect(state.explored, z.rect);
  return { ...state, map, resources, explored, zones: [...state.zones, id], log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}
