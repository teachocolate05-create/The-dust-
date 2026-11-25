import { describe, expect, it } from "vitest";
import { createInitialState, createTestState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { computeAccess } from "@/game/systems/access";
import { canCreateRoom, validateRoomRect } from "@/game/systems/space";
import { gateSeen } from "@/game/systems/zones";
import { isExplored, updateExplored } from "@/game/systems/vision";
import type { GameState } from "@/game/core/types";
import { toMaintenance } from "./helpers";

const exploredCount = (s: GameState) => s.explored.join("").split("").filter((c) => c === "1").length;

describe("시작 지도", () => {
  it("입구 아래 2×2만 열려 있고, 보이는 곳은 그 주변 한 칸뿐", () => {
    const s = createInitialState(5);
    const access = computeAccess(s);
    const open = [...access.corridor].filter((k) => s.map[+k.split(",")[1]][+k.split(",")[0]] === "floor");
    expect(open.sort()).toEqual(["14,1", "14,2", "15,1", "15,2"]);
    // 출입구 2 + 2×2 4 + 주변 (13,1)(13,2)(16,1)(16,2)(14,3)(15,3) 6 + 출입구 옆 벽 (13,0)(16,0) 2
    expect(exploredCount(s)).toBe(14);
    expect(isExplored(s, 14, 3)).toBe(true);
    expect(isExplored(s, 14, 4)).toBe(false);
  });
  it("방은 처음에 하나도 열려 있지 않다 (침낭 하나로 잔다)", () => {
    const s = createInitialState(5);
    const access = computeAccess(s);
    expect(s.rooms.every((r) => !access.roomAccess[r.id])).toBe(true);
  });
});

describe("주요 시설 무작위 배치", () => {
  it("급수원·비상 발전실·옛 창고가 게임마다 다른 곳에 놓이고, 대합실 안에서 서로 겹치지 않으며 규칙에 맞다", () => {
    const spots = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = createInitialState(seed);
      const gen = s.rooms.find((r) => r.name === "비상 발전실")!;
      const store = s.rooms.find((r) => r.name === "옛 창고")!;
      let water: [number, number] | null = null;
      s.map.forEach((row, y) => row.forEach((t, x) => (t === "watersource" && y <= 11 && x <= 28 ? (water = [x, y]) : null)));
      expect(water).not.toBeNull();
      spots.add(`${gen.rect.x},${gen.rect.y}|${store.rect.x},${store.rect.y}|${water}`);
      for (const r of [gen, store]) {
        expect(r.rect.x).toBeGreaterThanOrEqual(1);
        expect(r.rect.x + r.rect.w - 1).toBeLessThanOrEqual(28);
        expect(r.rect.y + r.rect.h - 1).toBeLessThanOrEqual(11);
        // 탐색하고 나면 규칙에 맞는 방
        const all = { ...s, explored: s.explored.map((row) => "1".repeat(row.length)) };
        expect(validateRoomRect(all, r.rect, r.type, r.id)).toBeNull();
      }
      // 서로 겹치지 않음 (1칸 이상 띄움)
      const a = gen.rect;
      const b = store.rect;
      expect(a.x - 1 < b.x + b.w && b.x < a.x + a.w + 1 && a.y - 1 < b.y + b.h && b.y < a.y + a.h + 1).toBe(false);
      // 셔터 앞 칸은 비어 있다
      expect(["28,4", "28,5"].some((k) => s.rooms.some((r) => r.rect.x <= +k.split(",")[0] && +k.split(",")[0] < r.rect.x + r.rect.w && r.rect.y <= +k.split(",")[1] && +k.split(",")[1] < r.rect.y + r.rect.h))).toBe(false);
    }
    expect(spots.size).toBeGreaterThan(50);
  });
  it("잔해를 모두 치우면 세 시설 모두에 닿을 수 있다", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s0 = createInitialState(seed);
      const s = updateExplored({ ...s0, map: s0.map.map((row) => row.map((t) => (t === "debris" ? "floor" : t))) });
      const access = computeAccess(s);
      for (const r of s.rooms.filter((x) => x.rect.y < 12 && x.rect.x < 29)) expect(access.roomAccess[r.id]).toBe(true);
      let water = false;
      s.map.forEach((row, y) =>
        row.forEach((t, x) => {
          if (t === "watersource" && y <= 11 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => access.corridor.has(`${x + dx},${y + dy}`))) water = true;
        }),
      );
      expect(water).toBe(true);
    }
  });
});

describe("시야", () => {
  it("잔해를 치우면 그 칸 주변 한 칸이 새로 보인다", () => {
    const s = createInitialState(5);
    const before = exploredCount(s);
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "clearDebris", target: { kind: "debris", pos: { x: 14, y: 3 } } });
    expect(s2.map[3][14]).toBe("floor");
    expect(isExplored(s2, 14, 4)).toBe(true);
    expect(isExplored(s2, 13, 3)).toBe(true);
    expect(isExplored(s2, 14, 5)).toBe(false);
    expect(exploredCount(s2)).toBeGreaterThan(before);
  });
  it("탐색하지 않은 곳에는 방을 지을 수 없다", () => {
    const s = toMaintenance(createInitialState(5));
    const all = { ...s, map: s.map.map((row) => row.map((t) => (t === "debris" ? "floor" : t))) };
    expect(canCreateRoom(all, { x: 10, y: 6, w: 2, h: 2 }, "storage").ok).toBe(false);
  });
});

describe("봉쇄 구역", () => {
  it("셔터를 보기 전에는 존재를 알 수 없고, 열면 구역 전체가 지도에 영구히 드러난다", () => {
    const s0 = createInitialState(5);
    expect(gateSeen(s0, "east")).toBe(false);
    // 대합실 잔해를 모두 치운 상태
    let s = updateExplored({ ...s0, map: s0.map.map((row, y) => row.map((t, x) => (x < 29 && y < 12 && t === "debris" ? "floor" : t))) });
    expect(gateSeen(s, "east")).toBe(true); // 셔터는 이웃 칸이라 보인다
    expect(isExplored(s, 30, 4)).toBe(false); // 셔터 너머는 안 보인다
    expect(isExplored(s, 37, 8)).toBe(false);
    s = toMaintenance({ ...s, resources: { ...s.resources, materials: 30, parts: 10 } });
    s = gameReducer(s, { type: "OPEN_ZONE", zoneId: "east" });
    expect(s.zones).toContain("east");
    expect(isExplored(s, 37, 8)).toBe(true);
    expect(isExplored(s, 44, 10)).toBe(true);
    // 다른 봉쇄 구역은 여전히 가려져 있다
    expect(isExplored(s, 35, 12)).toBe(false);
  });
});

describe("저장 변환 (업데이트 5 → 탐색 개편)", () => {
  it("예전 저장 데이터는 본 곳을 모두 밝히고 열지 않은 구역만 가린다", () => {
    const s = createTestState(1);
    const v11: any = { ...JSON.parse(JSON.stringify(s)), version: 11, explored: undefined, zones: ["east"] };
    const m = migrateSave(v11);
    expect(validateSave(m)).toBe(true);
    expect(isExplored(m, 5, 5)).toBe(true);
    expect(isExplored(m, 37, 8)).toBe(true); // 연 구역
    expect(isExplored(m, 35, 12)).toBe(false); // 안 연 구역
  });
});
