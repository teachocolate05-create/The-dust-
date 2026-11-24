// 행동 시스템: 오전·오후·야간에 행동 횟수를 1회씩 소비해 수행하는 현장 활동.

import { ACTION_BY_ID, ACTION_RULES, EXPLORE_TABLE, type ActionId, type YieldTable } from "../config/actions";
import { FACILITY_BY_ID } from "../config/facilities";
import { RESOURCE_BY_ID } from "../config/resources";
import { RULES } from "../config/rules";
import { pickWeighted, randomInt } from "../core/random";
import { applyBundle, bundleText, canAfford, missingText } from "../core/resources";
import type { ActionResult, GameState, LogEntry, Point, Rect, ResourceBundle, ResourceId } from "../core/types";
import { computeAccess } from "./access";
import { isDayPhase, PHASE_NAMES } from "./phase";

export type ActionTarget = { kind: "debris"; pos: Point } | { kind: "facility"; roomId: string; facilityId: string };

export type ActionCheck = { ok: true; cost: ResourceBundle; preview: string } | { ok: false; reason: string };

const no = (reason: string): ActionCheck => ({ ok: false, reason });

/** 잔해 정리 범위: 누른 칸을 왼쪽 위로 하는 2×2 (맵 밖은 잘라냄) */
export function debrisArea(state: GameState, pos: Point): Rect {
  const n = ACTION_RULES.debrisArea;
  const H = state.map.length;
  const W = state.map[0].length;
  return { x: pos.x, y: pos.y, w: Math.min(n, W - pos.x), h: Math.min(n, H - pos.y) };
}

/** 범위 안에서 실제로 치울 수 있는 잔해 칸 */
export function clearableDebris(state: GameState, pos: Point): Point[] {
  const r = debrisArea(state, pos);
  const out: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (state.map[y][x] === "debris") out.push({ x, y });
  return out;
}

function debrisReachable(state: GameState, tiles: Point[]): boolean {
  const access = computeAccess(state);
  return tiles.some((t) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => access.corridor.has(`${t.x + dx},${t.y + dy}`)),
  );
}

/** 야간 외부 활동이면 효율 감소 */
function yieldRate(state: GameState, id: ActionId): number {
  return state.phase === "night" && ACTION_BY_ID[id].outside ? ACTION_RULES.nightOutsideRate : 1;
}

export function canDoAction(state: GameState, id: ActionId, target?: ActionTarget): ActionCheck {
  const def = ACTION_BY_ID[id];
  if (!def.implemented) return no(`${def.plannedStage}단계에서 구현 예정입니다.`);
  if (!isDayPhase(state.phase)) return no("정비 시간에는 행동할 수 없습니다. '다음 날 시작'을 누르세요.");
  if (state.actionsLeft <= 0) return no(`${PHASE_NAMES[state.phase]} 행동을 모두 사용했습니다. 구간을 종료하세요.`);

  const rate = yieldRate(state, id);
  const nightNote = rate < 1 ? ` (야간 효율 ${Math.round(rate * 100)}%)` : "";

  if (id === "clearDebris") {
    if (target?.kind !== "debris") return no("지도에서 정리할 잔해를 고르세요.");
    const tiles = clearableDebris(state, target.pos);
    if (tiles.length === 0) return no("선택한 범위에 잔해가 없습니다.");
    if (!debrisReachable(state, tiles)) return no("통로와 맞닿은 잔해부터 치울 수 있습니다.");
    return { ok: true, cost: {}, preview: `잔해 ${tiles.length}칸 정리 · 자재 +${tiles.length * ACTION_RULES.debrisSalvage}` };
  }

  if (id === "repair") {
    if (target?.kind !== "facility") return no("수리할 시설을 고르세요.");
    const room = state.rooms.find((r) => r.id === target.roomId);
    const fac = room?.facilities.find((f) => f.id === target.facilityId);
    if (!fac) return no("시설을 찾을 수 없습니다.");
    const max = FACILITY_BY_ID[fac.type].maxDurability;
    if (fac.durability >= max) return no("이미 내구도가 최대입니다.");
    const cost = { parts: ACTION_RULES.repairParts };
    if (!canAfford(state.resources, cost)) return no(missingText(state.resources, cost));
    const gain = Math.min(ACTION_RULES.repairAmount, max - fac.durability);
    return { ok: true, cost, preview: `내구도 +${gain} (${fac.durability} → ${fac.durability + gain})` };
  }

  if (id === "explore") return { ok: true, cost: {}, preview: `무작위 발견${nightNote}` };

  const range = Object.entries(def.yields ?? {})
    .map(([k, [a, b]]) => `${RESOURCE_BY_ID[k as ResourceId].name} ${a}~${b}`)
    .join(", ");
  return { ok: true, cost: {}, preview: `${range}${nightNote}` };
}

function rollYields(seed: number, table: YieldTable, rate: number): [ResourceBundle, number] {
  const out: ResourceBundle = {};
  let s = seed;
  for (const [k, [min, max]] of Object.entries(table) as [ResourceId, [number, number]][]) {
    let v: number;
    [v, s] = randomInt(s, min, max);
    v = Math.floor(v * rate);
    if (v > 0) out[k] = v;
  }
  return [out, s];
}

function withLog(state: GameState, text: string, kind: LogEntry["kind"] = "info"): GameState {
  const entry: LogEntry = { day: state.day, phase: state.phase, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, RULES.maxLogEntries) };
}

export function doAction(state: GameState, id: ActionId, target?: ActionTarget): GameState {
  const check = canDoAction(state, id, target);
  if (!check.ok) return state;
  const def = ACTION_BY_ID[id];
  const rate = yieldRate(state, id);
  let s: GameState = { ...state, actionsLeft: state.actionsLeft - 1 };
  let seed = state.seed;
  let gained: ResourceBundle = {};
  let text = "";

  if (id === "explore") {
    let entry: (typeof EXPLORE_TABLE)[number];
    [entry, seed] = pickWeighted(seed, EXPLORE_TABLE);
    [gained, seed] = rollYields(seed, entry.yields, rate);
    text = Object.keys(gained).length || !Object.keys(entry.yields).length ? entry.text : "무언가 있었지만 어두워서 챙기지 못했다.";
  } else if (id === "scavenge" || id === "forage") {
    [gained, seed] = rollYields(seed, def.yields ?? {}, rate);
    text = Object.keys(gained).length ? (id === "scavenge" ? "폐허를 뒤져 쓸 만한 것을 챙겼다." : "먹을 것과 물을 찾아 돌아왔다.") : "허탕을 쳤다.";
  } else if (id === "clearDebris" && target?.kind === "debris") {
    const tiles = clearableDebris(s, target.pos);
    const map = s.map.map((row) => [...row]);
    for (const t of tiles) map[t.y][t.x] = "floor";
    s = { ...s, map };
    gained = { materials: tiles.length * ACTION_RULES.debrisSalvage };
    text = `잔해 ${tiles.length}칸을 치워 새 공간을 확보했다.`;
  } else if (id === "repair" && target?.kind === "facility") {
    const max = (type: keyof typeof FACILITY_BY_ID) => FACILITY_BY_ID[type].maxDurability;
    let name = "";
    s = {
      ...s,
      rooms: s.rooms.map((r) =>
        r.id !== target.roomId
          ? r
          : {
              ...r,
              facilities: r.facilities.map((f) => {
                if (f.id !== target.facilityId) return f;
                name = FACILITY_BY_ID[f.type].name;
                return { ...f, durability: Math.min(max(f.type), f.durability + ACTION_RULES.repairAmount) };
              }),
            },
      ),
    };
    text = `${name}을(를) 손봤다.`;
  }

  s = { ...s, resources: applyBundle(applyBundle(s.resources, check.cost, -1), gained, 1), seed };
  const result: ActionResult = {
    serial: (state.lastAction?.serial ?? 0) + 1,
    actionName: def.name,
    text,
    gained,
    spent: check.cost,
  };
  s = { ...s, lastAction: result };
  const gainText = Object.keys(gained).length ? ` (+${bundleText(gained)})` : "";
  const spentText = Object.keys(check.cost).length ? ` (-${bundleText(check.cost)})` : "";
  return withLog(s, `[${def.name}] ${text}${gainText}${spentText}`, "build");
}

