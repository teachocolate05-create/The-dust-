import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canDoAction } from "@/game/systems/actions";
import { canRepairFacility, capacity, simulatePeriod } from "@/game/systems/operation";
import { forecastPhaseEnd } from "@/game/systems/time";
import type { GameState } from "@/game/core/types";

const start = () => createInitialState(7);
const gen = (s: GameState) => {
  const room = s.rooms.find((r) => r.type === "power")!;
  return { room, f: room.facilities[0] };
};
const toMaintenance = (s: GameState): GameState => ({ ...s, phase: "maintenance", actionsLeft: 0 });
const toMorning = (s: GameState): GameState => ({ ...s, phase: "morning", actionsLeft: 3 });

/** 정비 시간에 정수실 + 정수 필터를 짓는다 */
function withFilter(s0: GameState) {
  let s = toMaintenance({ ...s0, resources: { ...s0.resources, materials: 40, parts: 10 } });
  s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 12, y: 9, w: 3, h: 3 }, roomType: "water" });
  const room = s.rooms[s.rooms.length - 1];
  s = gameReducer(s, { type: "PLACE_FACILITY", roomId: room.id, facilityType: "filter", x: 12, y: 9, rotated: false });
  return { s: toMorning(s), roomId: room.id };
}

describe("저장 용량", () => {
  it("기본 용량 + 창고 시설 용량", () => {
    expect(capacity(start()).materials).toBe(60 + 20);
    expect(capacity(start()).food).toBe(30);
  });
  it("넘치는 획득량은 버려진다", () => {
    const s: GameState = { ...start(), resources: { ...start().resources, materials: 80 } };
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "scavenge" });
    expect(s2.resources.materials).toBe(80);
  });
});

describe("발전기", () => {
  it("구간마다 연료 1을 쓰고 내구도 3이 줄며, 효율에 따라 전력 생산", () => {
    const s = start();
    const sim = simulatePeriod(s);
    const { f } = gen(s);
    expect(sim.byId[f.id].status).toBe("running");
    expect(sim.power.supply).toBe(Math.floor(6 * 0.75)); // 내구도 38 → 효율 75%
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.fuel).toBe(s.resources.fuel - 1);
    expect(gen(s2).f.durability).toBe(35);
  });
  it("정지하면 연료를 쓰지 않는다", () => {
    const s0 = start();
    const s = gameReducer(s0, { type: "TOGGLE_FACILITY", roomId: gen(s0).room.id, facilityId: gen(s0).f.id });
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("off");
    expect(gameReducer(s, { type: "END_PHASE" }).resources.fuel).toBe(s.resources.fuel);
  });
  it("연료가 없으면 멈춘다", () => {
    const s: GameState = { ...start(), resources: { ...start().resources, fuel: 0 } };
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("noFuel");
  });
  it("내구도가 0이면 고장, 가동하지 않는다", () => {
    const s0 = start();
    const s: GameState = {
      ...s0,
      rooms: s0.rooms.map((r) => ({ ...r, facilities: r.facilities.map((f) => (f.type === "emergency_gen" ? { ...f, durability: 0 } : f)) })),
    };
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("broken");
  });
});

describe("정수 필터", () => {
  it("전력이 있으면 식수 생산, 예상치와 결과가 같다", () => {
    const { s } = withFilter(start());
    const f = forecastPhaseEnd(s);
    expect(f.production.water).toBe(4);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.water).toBe(s.resources.water + 4 - 1);
    expect(s2.resources.water).toBe(f.after.water);
  });
  it("발전기를 끄면 전력 부족으로 멈춘다", () => {
    const { s: s0, roomId } = withFilter(start());
    const s = gameReducer(s0, { type: "TOGGLE_FACILITY", roomId: gen(s0).room.id, facilityId: gen(s0).f.id });
    const filter = s.rooms.find((r) => r.id === roomId)!.facilities[0];
    expect(simulatePeriod(s).byId[filter.id].status).toBe("noPower");
  });
});

describe("수리", () => {
  it("정비 시간 수리: 부족한 내구도 20당 부품 1, 최대까지 회복", () => {
    const s = toMaintenance(start());
    const { room, f } = gen(s);
    const chk = canRepairFacility(s, room.id, f.id);
    expect(chk.ok && chk.cost.parts).toBe(Math.ceil(62 / 20));
    const s2 = gameReducer(s, { type: "REPAIR_FACILITY", roomId: room.id, facilityId: f.id });
    expect(gen(s2).f.durability).toBe(100);
    expect(s2.resources.parts).toBe(s.resources.parts - 4);
  });
  it("낮에는 정비 수리 불가 (직접 수리 행동은 가능)", () => {
    const s = start();
    const { room, f } = gen(s);
    expect(canRepairFacility(s, room.id, f.id).ok).toBe(false);
    expect(canDoAction(s, "repair", { kind: "facility", roomId: room.id, facilityId: f.id }).ok).toBe(true);
  });
});

describe("직접 제작", () => {
  it("작업대가 없으면 제작 불가, 있으면 자재로 부품 제작", () => {
    expect(canDoAction(start(), "craft", { kind: "recipe", recipeId: "parts" }).ok).toBe(false);
    let s = toMaintenance({ ...start(), resources: { ...start().resources, materials: 40 } });
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 12, y: 9, w: 3, h: 3 }, roomType: "workshop" });
    const room = s.rooms[s.rooms.length - 1];
    s = toMorning(gameReducer(s, { type: "PLACE_FACILITY", roomId: room.id, facilityType: "workbench", x: 12, y: 9, rotated: false }));
    expect(canDoAction(s, "craft", { kind: "recipe", recipeId: "parts" }).ok).toBe(true);
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "craft", target: { kind: "recipe", recipeId: "parts" } });
    expect(s2.resources.parts).toBe(s.resources.parts + 1);
    expect(s2.resources.materials).toBe(s.resources.materials - 4);
  });
});
