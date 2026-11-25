// 7일 이상 생존 테스트: 간단한 규칙으로 움직이는 자동 플레이어가 여러 시드로 게임을 진행한다.
// 매 구간 상태 불변식(자원 범위, 행동 횟수, 시간 순서)과 저장/불러오기를 검사한다.
import { describe, expect, it } from "vitest";
import { createInitialState, createTestState } from "@/game/state/initialState";
import { gameReducer, type GameAction } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { canDoAction } from "@/game/systems/actions";
import { computeAccess } from "@/game/systems/access";
import { capacity } from "@/game/systems/operation";
import { canAccept, bedCount, population } from "@/game/systems/survivors";
import * as space from "@/game/systems/space";
import type { GameState, Point } from "@/game/core/types";

/** 비상 발전실 쪽으로 길을 뚫는다 (위치는 게임마다 다르다) */
const genOf = (s: GameState) => {
  const r = s.rooms.find((x) => x.name === "비상 발전실")!.rect;
  return { x: r.x + 1, y: r.y + 1 };
};

function nextDebris(s: GameState): Point | null {
  const access = computeAccess(s);
  let best: Point | null = null;
  let bestD = Infinity;
  s.map.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t !== "debris") return;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => access.corridor.has(`${x + dx},${y + dy}`))) return;
      const g = genOf(s);
      const d = Math.abs(x - g.x) + Math.abs(y - g.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }),
  );
  return best;
}

function dayAction(s: GameState): GameAction | null {
  const ok = (a: GameAction) => (a.type === "DO_ACTION" && canDoAction(s, a.actionId, a.target).ok ? a : null);
  const player = s.survivors[0];
  if (player.fatigue >= 88) return null; // 쉬기
  const food = s.resources.food;
  const water = s.resources.water;
  const pop = population(s);
  return (
    (s.threat ? ok({ type: "DO_ACTION", actionId: "clearThreat" }) : null) ??
    ok({ type: "DO_ACTION", actionId: "rescue" }) ??
    ((food < pop * 6 || water < pop * 6) ? ok({ type: "DO_ACTION", actionId: "survey" }) ?? ok({ type: "DO_ACTION", actionId: "forage" }) : null) ??
    ok({ type: "DO_ACTION", actionId: "survey" }) ??
    (s.day >= 2 && pop < 3 && s.actionsLeft === 3 ? ok({ type: "DO_ACTION", actionId: "searchSurvivor" }) : null) ??
    (() => {
      const p = nextDebris(s);
      return p ? ok({ type: "DO_ACTION", actionId: "clearDebris", target: { kind: "debris", pos: p } }) : null;
    })() ??
    ok({ type: "DO_ACTION", actionId: "forage" })
  );
}

function maintenance(s0: GameState): GameState {
  let s = s0;
  // 침상이 모자라면 거주실에 간이 침상
  // 거주실이 없으면 탐색한 바닥에 2×2 거주실을 짓는다 (통로를 막지 않는 자리)
  if (!s.rooms.some((r) => r.type === "residence") && s.resources.materials >= 14) {
    outer: for (let y = 1; y <= 10; y++)
      for (let x = 1; x <= 27; x++) {
        const rect = { x, y, w: 2, h: 2 };
        if (!space.canCreateRoom(s, rect, "residence").ok) continue;
        const t = gameReducer(s, { type: "CREATE_ROOM", rect, roomType: "residence" });
        const acc = computeAccess(t);
        if (t.rooms.every((r) => acc.roomAccess[r.id] || !computeAccess(s).roomAccess[r.id]) && acc.roomAccess[t.rooms[t.rooms.length - 1].id] && acc.corridor.size >= computeAccess(s).corridor.size - 4) {
          s = t;
          break outer;
        }
      }
  }
  const res = s.rooms.find((r) => r.type === "residence");
  if (res && s.pending.some((p) => p.stage === "arrived") && bedCount(s) <= population(s)) {
    for (const [x, y, rot] of [
      [res.rect.x, res.rect.y, false],
      [res.rect.x, res.rect.y + 1, false],
      [12, 4, false],
      [12, 5, false],
      [14, 3, true],
    ] as [number, number, boolean][])
      if (space.canPlaceFacility(s, res.id, "cot", x, y, rot).ok) {
        s = gameReducer(s, { type: "PLACE_FACILITY", roomId: res.id, facilityType: "cot", x, y, rotated: rot });
        break;
      }
  }
  s.pending.forEach((_, i) => {
    if (canAccept(s, 0).ok) s = gameReducer(s, { type: "ACCEPT_SURVIVOR", index: 0 });
    void i;
  });
  // 업무: 식량이 모자라면 식량 확보, 아니면 잔해 정리 (발전기 방향 지정)
  const marks: Point[] = [];
  const g = genOf(s);
  for (let y = Math.min(3, g.y); y <= Math.max(3, g.y); y++) for (let x = Math.min(14, g.x); x <= Math.max(14, g.x); x++) marks.push({ x, y });
  s = gameReducer(s, { type: "MARK_DEBRIS", points: marks, on: true });
  for (const sv of s.survivors.slice(1)) {
    const job = sv.fatigue >= 70 ? "rest" : s.resources.food < population(s) * 8 ? "forage" : "debris";
    s = gameReducer(s, { type: "SET_JOB", survivorId: sv.id, job });
  }
  // 발전기 수리
  const pw = s.rooms.find((r) => r.type === "power")!;
  s = gameReducer(s, { type: "REPAIR_FACILITY", roomId: pw.id, facilityId: pw.facilities[0].id });
  return gameReducer(s, { type: "START_NEXT_DAY" });
}

function checkInvariants(s: GameState) {
  const cap = capacity(s);
  for (const k of ["food", "water", "fuel", "parts", "materials"] as const) {
    expect(Number.isFinite(s.resources[k])).toBe(true);
    expect(s.resources[k]).toBeGreaterThanOrEqual(0);
    expect(s.resources[k]).toBeLessThanOrEqual(cap[k]);
  }
  expect(s.actionsLeft).toBeGreaterThanOrEqual(0);
  expect(s.actionsLeft).toBeLessThanOrEqual(3);
  for (const sv of s.survivors) {
    expect(sv.health).toBeGreaterThanOrEqual(0);
    expect(sv.fatigue).toBeGreaterThanOrEqual(0);
    expect(sv.fatigue).toBeLessThanOrEqual(100);
  }
  // 저장 → 불러오기
  const loaded = migrateSave(JSON.parse(JSON.stringify(s)));
  expect(validateSave(loaded)).toBe(true);
}

function play(seed: number, days: number, real = false) {
  let s = real ? createInitialState(seed) : createTestState(seed);
  let events = 0;
  while (s.day <= days && !s.gameOver) {
    if (s.phase === "maintenance") {
      s = maintenance(s);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = dayAction(s);
        if (!a) break;
        const next = gameReducer(s, a);
        expect(next).not.toBe(s);
        s = next;
        if (s.gameOver) break;
      }
      if (s.gameOver) break;
      const order = ["morning", "afternoon", "night", "maintenance"];
      const before = s.phase;
      s = gameReducer(s, { type: "END_PHASE" });
      if (!s.gameOver) expect(order.indexOf(s.phase)).toBe(order.indexOf(before) + 1);
      events += s.events.list.length;
    }
    checkInvariants(s);
  }
  return { s, events };
}

describe("7일 이상 생존 테스트", () => {
  it("20개 시드로 10일 진행: 오류 없이 불변식 유지, 대부분 7일 이상 생존", () => {
    const results = Array.from({ length: 20 }, (_, i) => play(i + 1, 10));
    const survived7 = results.filter((r) => !r.s.gameOver || r.s.gameOver.day > 7).length;
    const reachedGen = results.filter((r) => computeAccess(r.s).roomAccess[r.s.rooms.find((x) => x.type === "power")!.id]).length;
    const recruited = results.filter((r) => r.s.survivors.length > 1).length;
    const totalEvents = results.reduce((n, r) => n + r.events, 0);
    // 결과 요약 (테스트 출력에 표시)
    console.log(
      `7일 생존 ${survived7}/20 · 발전기 도달 ${reachedGen}/20 · 생존자 영입 ${recruited}/20 · 사건 ${totalEvents}회 · 평균 도달 일차 ${(
        results.reduce((n, r) => n + r.s.day, 0) / 20
      ).toFixed(1)}`,
    );
    expect(survived7).toBeGreaterThanOrEqual(16);
    expect(totalEvents).toBeGreaterThan(20);
  });
});

describe("실제 시작(무작위 배치·안개)으로 7일 이상 생존 테스트", () => {
  it("20개 시드로 10일 진행: 오류 없이 불변식 유지", () => {
    const results = Array.from({ length: 20 }, (_, i) => play(i + 100, 10, true));
    const survived7 = results.filter((r) => !r.s.gameOver || r.s.gameOver.day > 7).length;
    const reachedGen = results.filter((r) => computeAccess(r.s).roomAccess[r.s.rooms.find((x) => x.name === "비상 발전실")!.id]).length;
    const explored = results.reduce((n, r) => n + r.s.explored.join("").split("").filter((c) => c === "1").length, 0) / 20;
    console.log(`실제 시작: 7일 생존 ${survived7}/20 · 발전기 도달 ${reachedGen}/20 · 평균 탐색 ${Math.round(explored)}칸`);
    expect(survived7).toBeGreaterThanOrEqual(14);
  });
});

describe("방치하면 게임 오버", () => {
  it("아무 행동도 하지 않으면 식량·식수가 바닥나 결국 쓰러진다", () => {
    let s = createTestState(3);
    let guard = 0;
    while (!s.gameOver && guard++ < 200) s = gameReducer(s, s.phase === "maintenance" ? { type: "START_NEXT_DAY" } : { type: "END_PHASE" });
    expect(s.gameOver).not.toBeNull();
    console.log(`방치 시 게임 오버: ${s.gameOver!.day}일차`);
    expect(s.gameOver!.day).toBeGreaterThanOrEqual(3);
  });
});
