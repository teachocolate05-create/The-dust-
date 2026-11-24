import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canDoAction } from "@/game/systems/actions";
import { canRepairFacility, capacity, simulatePeriod } from "@/game/systems/operation";
import { forecastPhaseEnd } from "@/game/systems/time";
import type { GameState } from "@/game/core/types";
import { opened, rich, toMaintenance, toMorning } from "./helpers";

const gen = (s: GameState) => {
  const room = s.rooms.find((r) => r.type === "power")!;
  return { room, f: room.facilities[0] };
};

/** 열린 맵, 정비 시간에: 방 + 시설 + 발전기와 잇는 전력선 (+ 급수원과 잇는 수도관) */
export function withMachine(type: "filter" | "workbench", opts: { power?: boolean; water?: boolean } = {}) {
  let s = toMaintenance(rich(opened(7)));
  const roomType = type === "filter" ? "water" : "workshop";
  s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 9, w: 3, h: 3 }, roomType });
  const room = s.rooms[s.rooms.length - 1];
  s = gameReducer(s, { type: "PLACE_FACILITY", roomId: room.id, facilityType: type, x: 8, y: 9, rotated: false });
  if (opts.power !== false) s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: [{ x: 6, y: 10 }, { x: 7, y: 10 }, { x: 7, y: 9 }] });
  if (opts.water !== false && type === "filter")
    s = gameReducer(s, { type: "BUILD_LINES", net: "water", path: Array.from({ length: 8 }, (_, i) => ({ x: 1 + i, y: 8 })) });
  const fac = s.rooms.find((r) => r.id === room.id)!.facilities[0];
  return { s: toMorning(s), roomId: room.id, facId: fac.id };
}

describe("저장 용량", () => {
  it("기본 용량 + 창고 시설 용량", () => {
    // 시작: 옛 창고는 잔해에 막혀 있으므로 기본값만
    expect(capacity(createInitialState(7)).materials).toBe(40);
    expect(capacity(createInitialState(7)).food).toBe(10);
    expect(capacity(createInitialState(7)).water).toBe(10);
    // 길이 뚫리면 옛 창고의 보관 선반(+15) 포함
    expect(capacity(opened(7)).materials).toBe(55);
  });
  it("넘치는 획득량은 버려진다", () => {
    const s0 = createInitialState(7);
    const s: GameState = { ...s0, resources: { ...s0.resources, materials: 40 } };
    expect(gameReducer(s, { type: "DO_ACTION", actionId: "scavenge" }).resources.materials).toBe(40);
  });
});

describe("발전기", () => {
  it("잔해에 갇혀 있으면 가동하지 않는다 (시작 상태)", () => {
    const s = createInitialState(7);
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("isolated");
    expect(gameReducer(s, { type: "END_PHASE" }).resources.fuel).toBe(s.resources.fuel);
  });
  it("길이 뚫리면 연료 1을 쓰고 내구도 3이 줄며, 효율에 따라 전력 생산", () => {
    const s = opened(7);
    const sim = simulatePeriod(s);
    expect(sim.byId[gen(s).f.id].status).toBe("running");
    expect(sim.power.supply).toBe(Math.floor(6 * 0.75)); // 내구도 38 → 효율 75%
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.fuel).toBe(s.resources.fuel - 1);
    expect(gen(s2).f.durability).toBe(35);
  });
  it("정지하면 연료를 쓰지 않는다", () => {
    const s0 = opened(7);
    const s = gameReducer(s0, { type: "TOGGLE_FACILITY", roomId: gen(s0).room.id, facilityId: gen(s0).f.id });
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("off");
    expect(gameReducer(s, { type: "END_PHASE" }).resources.fuel).toBe(s.resources.fuel);
  });
  it("연료가 없으면 멈춘다", () => {
    const s: GameState = { ...opened(7), resources: { ...opened(7).resources, fuel: 0 } };
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("noFuel");
  });
  it("내구도가 0이면 고장", () => {
    const s0 = opened(7);
    const s: GameState = {
      ...s0,
      rooms: s0.rooms.map((r) => ({ ...r, facilities: r.facilities.map((f) => (f.type === "emergency_gen" ? { ...f, durability: 0 } : f)) })),
    };
    expect(simulatePeriod(s).byId[gen(s).f.id].status).toBe("broken");
  });
});

describe("정수 필터 (전력망 + 수도망)", () => {
  it("전력선과 수도관이 모두 이어지면 식수 생산, 예상치와 결과가 같다", () => {
    const { s, facId } = withMachine("filter");
    const f = forecastPhaseEnd(s);
    expect(f.sim.byId[facId].status).toBe("running");
    expect(f.production.water).toBe(4);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(s2.resources.water).toBe(s.resources.water + 4 - 1);
    expect(s2.resources.water).toBe(f.after.water);
  });
  it("전력선이 없으면 '전력선 미연결'", () => {
    const { s, facId } = withMachine("filter", { power: false });
    expect(simulatePeriod(s).byId[facId].status).toBe("noPowerLine");
  });
  it("수도관이 없으면 '수도관 미연결'", () => {
    const { s, facId } = withMachine("filter", { water: false });
    expect(simulatePeriod(s).byId[facId].status).toBe("noWaterLine");
  });
  it("발전기를 끄면 전력 부족으로 멈춘다", () => {
    const { s: s0, facId } = withMachine("filter");
    const s = gameReducer(s0, { type: "TOGGLE_FACILITY", roomId: gen(s0).room.id, facilityId: gen(s0).f.id });
    expect(simulatePeriod(s).byId[facId].status).toBe("noPower");
  });
});

describe("수리", () => {
  it("정비 시간 수리: 부족한 내구도 20당 부품 1, 최대까지 회복", () => {
    const s = toMaintenance(opened(7));
    const { room, f } = gen(s);
    const chk = canRepairFacility(s, room.id, f.id);
    expect(chk.ok && chk.cost.parts).toBe(Math.ceil(62 / 20));
    const s2 = gameReducer(s, { type: "REPAIR_FACILITY", roomId: room.id, facilityId: f.id });
    expect(gen(s2).f.durability).toBe(100);
    expect(s2.resources.parts).toBe(s.resources.parts - 4);
  });
  it("낮에는 정비 수리 불가 (직접 수리 행동은 가능)", () => {
    const s = opened(7);
    const { room, f } = gen(s);
    expect(canRepairFacility(s, room.id, f.id).ok).toBe(false);
    expect(canDoAction(s, "repair", { kind: "facility", roomId: room.id, facilityId: f.id }).ok).toBe(true);
  });
});

describe("직접 제작", () => {
  it("작업대가 없거나 전력선이 없으면 불가, 연결되면 자재로 부품 제작", () => {
    expect(canDoAction(opened(7), "craft", { kind: "recipe", recipeId: "parts" }).ok).toBe(false);
    expect(canDoAction(withMachine("workbench", { power: false }).s, "craft", { kind: "recipe", recipeId: "parts" }).ok).toBe(false);
    const { s } = withMachine("workbench");
    expect(canDoAction(s, "craft", { kind: "recipe", recipeId: "parts" }).ok).toBe(true);
    const s2 = gameReducer(s, { type: "DO_ACTION", actionId: "craft", target: { kind: "recipe", recipeId: "parts" } });
    expect(s2.resources.parts).toBe(s.resources.parts + 1);
    expect(s2.resources.materials).toBe(s.resources.materials - 4);
  });
});
