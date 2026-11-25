import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { simulatePeriod } from "@/game/systems/operation";
import { forecastPhaseEnd } from "@/game/systems/time";
import { generateSurvivor, planWork } from "@/game/systems/survivors";
import { linePath } from "@/game/systems/network";
import type { Facility, FacilityTypeId, GameState, RoomTypeId, Survivor } from "@/game/core/types";
import { opened, toMorning } from "./helpers";

/** 열린 맵에 방 하나와 시설을 바로 넣는다 (건설 비용·고급 조건 생략) */
function withFacility(type: FacilityTypeId, roomType: RoomTypeId, extra: Partial<Facility> = {}, base: GameState = opened(4)): { s: GameState; id: string } {
  const fac: Facility = { id: "f1", type, x: 8, y: 9, rotated: false, durability: 100, enabled: true, ...extra };
  const room = { id: "rX", name: "테스트", type: roomType, rect: { x: 8, y: 9, w: 3, h: 3 }, facilities: [fac] };
  const s = toMorning({ ...base, rooms: [...base.rooms, room], resources: { ...base.resources, food: 8, water: 8, materials: 30, parts: 10, fuel: 10 } });
  return { s, id: "f1" };
}
const growthOf = (s: GameState) => s.rooms.find((r) => r.id === "rX")!.facilities[0].growth ?? 0;
const farmer = (farm: number): Survivor => ({
  ...generateSurvivor(2, "farmer", [])[0],
  job: "farm",
  fatigue: 10,
  health: 90,
  traits: [],
  conditions: [],
  morale: 60,
  skills: { tech: 1, medic: 1, gather: 1, farm, manage: 1 },
});

describe("재배", () => {
  it("버섯 재배상: 전력 없이 물 1로 자라고, 9구간째 식량 4 수확", () => {
    let { s } = withFacility("mushroom_bed", "farm");
    expect(simulatePeriod(s).byId.f1.status).toBe("running");
    const food0 = s.resources.food;
    for (let i = 0; i < 8; i++) {
      s = { ...gameReducer(s, { type: "END_PHASE" }), phase: "morning", actionsLeft: 3, resources: { ...s.resources, food: 8, water: 8 } };
    }
    expect(growthOf(s)).toBe(8);
    const f = forecastPhaseEnd(s);
    expect(f.production.food).toBe(4);
    const s2 = gameReducer(s, { type: "END_PHASE" });
    expect(growthOf(s2)).toBe(0);
    // 8 + 4 - 1 = 11 이지만 기본 저장량 10을 넘는 양은 버려진다
    expect(s2.resources.food).toBe(10);
    expect(f.after.food).toBe(10);
    void food0;
  });
  it("물이 없으면 '재료 부족'으로 자라지 않는다", () => {
    const { s } = withFacility("mushroom_bed", "farm");
    expect(simulatePeriod({ ...s, resources: { ...s.resources, water: 0 } }).byId.f1.status).toBe("noInput");
  });
  it("재배상은 재배등 전력이 필요하다", () => {
    const { s } = withFacility("planter", "farm");
    expect(simulatePeriod(s).byId.f1.status).toBe("noPowerLine");
    const lit = gameReducer({ ...s, phase: "maintenance" }, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 10 }, { x: 7, y: 10 }) });
    expect(simulatePeriod(toMorning(lit)).byId.f1.status).toBe("running");
  });
  it("'농사' 업무 생존자가 있으면 더 빨리 자라고 수확량이 늘어난다", () => {
    const { s: s0 } = withFacility("mushroom_bed", "farm", { growth: 7 });
    const s = { ...s0, survivors: [...s0.survivors, farmer(5)] };
    const sim = simulatePeriod(s);
    expect(sim.byId.f1.grow).toBe(2);
    expect(sim.byId.f1.harvest).toBe(true);
    expect(sim.byId.f1.produced.food).toBe(Math.floor(4 * 1.4));
    expect(planWork(s)[0].blocked).toBeUndefined();
  });
});

describe("식량 가공·자동 생산", () => {
  it("조리대가 가동 중이면 식량 소비 25% 절약", () => {
    const base = opened(4);
    const people = [farmer(1), farmer(1), farmer(1)].map((p, i) => ({ ...p, id: `p${i}`, job: "rest" as const }));
    const crowd = { ...base, survivors: [...base.survivors, ...people] };
    const { s } = withFacility("stove", "common", {}, crowd);
    expect(forecastPhaseEnd(s).consumption.food).toBe(4); // 조리대 전력 없음
    const lit = toMorning(gameReducer({ ...s, phase: "maintenance" }, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 10 }, { x: 7, y: 9 }) }));
    expect(forecastPhaseEnd(lit).consumption.food).toBe(3);
  });
  it("연료 정제기: 자재 3 → 연료 2 자동 생산", () => {
    const { s } = withFacility("refinery", "workshop");
    const lit = toMorning(gameReducer({ ...s, phase: "maintenance" }, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 10 }, { x: 7, y: 10 }) }));
    const f = forecastPhaseEnd(lit);
    expect(f.sim.byId.f1.status).toBe("running");
    expect(f.production.fuel).toBe(2);
    expect(f.consumption.materials).toBe(3);
  });
  it("제작 업무 품목을 바꿀 수 있다", () => {
    let s = createInitialState(1);
    s = gameReducer(s, { type: "SET_CRAFT_TARGET", target: "recycle" });
    expect(s.craftTarget).toBe("recycle");
  });
});

describe("저장 변환 (업데이트 2 → 3)", () => {
  it("제작 품목 기본값을 넣는다", () => {
    const v8: any = { ...JSON.parse(JSON.stringify(createInitialState(1))), version: 8, craftTarget: undefined };
    const m = migrateSave(v8);
    expect(validateSave(m)).toBe(true);
    expect(m.craftTarget).toBe("parts");
  });
});
