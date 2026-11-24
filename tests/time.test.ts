import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canDoAction, clearableDebris } from "@/game/systems/actions";
import { canCreateRoom } from "@/game/systems/space";
import { forecastPhaseEnd } from "@/game/systems/time";
import type { GameState } from "@/game/core/types";

const start = () => createInitialState(42);

describe("하루 사이클", () => {
  it("오전 → 오후 → 야간 → 정비 → 다음 날 오전", () => {
    let s = start();
    expect([s.day, s.phase, s.actionsLeft]).toEqual([1, "morning", 3]);
    s = gameReducer(s, { type: "END_PHASE" });
    expect([s.phase, s.actionsLeft]).toEqual(["afternoon", 3]);
    s = gameReducer(s, { type: "END_PHASE" });
    expect(s.phase).toBe("night");
    s = gameReducer(s, { type: "END_PHASE" });
    expect([s.phase, s.actionsLeft]).toEqual(["maintenance", 0]);
    // 정비 시간에는 END_PHASE가 아니라 START_NEXT_DAY로만 넘어간다
    expect(gameReducer(s, { type: "END_PHASE" })).toBe(s);
    s = gameReducer(s, { type: "START_NEXT_DAY" });
    expect([s.day, s.phase, s.actionsLeft]).toEqual([2, "morning", 3]);
  });

  it("구간 종료 시 식량·식수를 소비하고 예상치와 일치한다", () => {
    const s = start();
    const f = forecastPhaseEnd(s);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.food).toBe(f.after.food);
    expect(s2.resources.water).toBe(s.resources.water - 1);
  });

  it("자원이 0 아래로 내려가지 않고 부족 경고를 남긴다", () => {
    const s: GameState = { ...start(), resources: { ...start().resources, food: 0 } };
    expect(forecastPhaseEnd(s).shortage.food).toBe(1);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.food).toBe(0);
    expect(s2.log.some((l) => l.kind === "warn")).toBe(true);
  });
});

describe("행동 횟수", () => {
  it("구간당 3회까지만 행동할 수 있고, 이월되지 않는다", () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = gameReducer(s, { type: "DO_ACTION", actionId: "scavenge" });
    expect(s.actionsLeft).toBe(0);
    expect(canDoAction(s, "scavenge").ok).toBe(false);
    const same = gameReducer(s, { type: "DO_ACTION", actionId: "scavenge" });
    expect(same).toBe(s);
    s = gameReducer(s, { type: "END_PHASE" });
    expect(s.actionsLeft).toBe(3);
  });

  it("행동을 남긴 채 넘어가도 다음 구간은 3회", () => {
    let s = gameReducer(start(), { type: "DO_ACTION", actionId: "forage" });
    expect(s.actionsLeft).toBe(2);
    s = gameReducer(s, { type: "END_PHASE" });
    expect(s.actionsLeft).toBe(3);
  });

  it("같은 시드면 같은 결과 (새로고침으로 결과를 바꿀 수 없음)", () => {
    const a = gameReducer(start(), { type: "DO_ACTION", actionId: "explore" });
    const b = gameReducer(start(), { type: "DO_ACTION", actionId: "explore" });
    expect(a.resources).toEqual(b.resources);
    expect(a.seed).not.toBe(start().seed);
  });

  it("미구현 행동은 실행되지 않는다", () => {
    expect(canDoAction(start(), "rescue").ok).toBe(false);
  });
});

describe("건설과 행동의 분리", () => {
  it("낮에는 건설 불가, 정비 시간에는 행동 불가", () => {
    let s = start();
    expect(canCreateRoom(s, { x: 12, y: 9, w: 3, h: 3 }, "storage").ok).toBe(false);
    for (let i = 0; i < 3; i++) s = gameReducer(s, { type: "END_PHASE" });
    expect(s.phase).toBe("maintenance");
    expect(canCreateRoom(s, { x: 12, y: 9, w: 3, h: 3 }, "storage").ok).toBe(true);
    expect(canDoAction(s, "scavenge").ok).toBe(false);
  });
});

describe("잔해 정리", () => {
  it("통로와 맞닿은 잔해를 바닥으로 바꾸고 자재를 얻는다", () => {
    const s: GameState = { ...start(), resources: { ...start().resources, materials: 30 } };
    // (14,1)은 통로, (12..13, 1..2)는 잔해 4칸
    const pos = { x: 12, y: 1 };
    expect(clearableDebris(s, pos).length).toBe(4);
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "clearDebris", target: { kind: "debris", pos } });
    expect(s2.map[1][12]).toBe("floor");
    expect(s2.map[2][13]).toBe("floor");
    expect(s2.resources.materials).toBe(s.resources.materials + 4);
  });
  it("통로에 닿지 않은 잔해는 치울 수 없다", () => {
    expect(canDoAction(start(), "clearDebris", { kind: "debris", pos: { x: 1, y: 1 } }).ok).toBe(false);
  });
});

describe("직접 수리", () => {
  it("부품 1로 비상 발전기 내구도 +25", () => {
    const s = start();
    const room = s.rooms.find((r) => r.type === "power")!;
    const gen = room.facilities[0];
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "repair", target: { kind: "facility", roomId: room.id, facilityId: gen.id } });
    expect(s2.rooms.find((r) => r.id === room.id)!.facilities[0].durability).toBe(gen.durability + 25);
    expect(s2.resources.parts).toBe(s.resources.parts - 1);
  });
});
