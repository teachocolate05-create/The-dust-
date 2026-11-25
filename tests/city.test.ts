import { describe, expect, it } from "vitest";
import { createTestState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canDoAction } from "@/game/systems/actions";
import { migrateSave, validateSave } from "@/game/state/save";
import { canOpenZone } from "@/game/systems/zones";
import { simulatePeriod } from "@/game/systems/operation";
import { generateSurvivor, gainXp, xpNeeded } from "@/game/systems/survivors";
import { achievedNow } from "@/game/systems/goals";
import { linePath } from "@/game/systems/network";
import type { Facility, FacilityTypeId, GameState, RoomTypeId, Survivor } from "@/game/core/types";
import { opened, toMaintenance, toMorning } from "./helpers";

const mk = (id: string, over: Partial<Survivor> = {}): Survivor => ({
  ...generateSurvivor(9, id, [])[0],
  id,
  name: id,
  health: 80,
  fatigue: 20,
  traits: [],
  conditions: [],
  morale: 60,
  ...over,
});

function withFacilities(list: { id: string; type: FacilityTypeId; x: number; y: number; extra?: Partial<Facility> }[], roomType: RoomTypeId, rect = { x: 8, y: 8, w: 6, h: 4 }, base: GameState = opened(4)) {
  const facilities = list.map((f) => ({ id: f.id, type: f.type, x: f.x, y: f.y, rotated: false, durability: 100, enabled: true, ...f.extra }));
  return toMorning({ ...base, rooms: [...base.rooms, { id: "rX", name: "테스트", type: roomType, rect, facilities }] });
}

describe("지하 2층", () => {
  it("승강장에서 점검 통로로 내려가 셔터를 연다 (서쪽 → 동쪽 순서)", () => {
    let s = toMaintenance({ ...opened(), resources: { ...opened().resources, materials: 40, parts: 15 } });
    expect(canOpenZone(s, "lower_east").ok).toBe(false);
    expect(canOpenZone(s, "lower_west").ok).toBe(true);
    s = gameReducer(s, { type: "OPEN_ZONE", zoneId: "lower_west" });
    expect(s.map[16][3]).toBe("floor");
    expect(s.goals).toContain("deep");
  });
  it("옛 변전소를 고치면 연료 없이 전력 25", () => {
    let s = toMaintenance({ ...opened(), resources: { ...opened().resources, materials: 40, parts: 20 } });
    s = gameReducer(s, { type: "OPEN_ZONE", zoneId: "lower_west" });
    s = { ...s, map: s.map.map((row) => row.map((t) => (t === "debris" ? "floor" : t))) };
    const room = s.rooms.find((r) => r.name === "옛 변전소")!;
    const sub = room.facilities[0];
    expect(simulatePeriod(toMorning(s)).byId[sub.id].status).toBe("broken");
    s = gameReducer(s, { type: "REPAIR_FACILITY", roomId: room.id, facilityId: sub.id });
    const sim = simulatePeriod(toMorning(s));
    expect(sim.byId[sub.id].status).toBe("running");
    expect(sim.byId[sub.id].powerOut).toBe(25);
    expect(sim.byId[sub.id].consumed).toEqual({});
  });
});

describe("고급 전력망·수도망", () => {
  it("축전지: 남는 전력을 저장했다가 모자랄 때 내보낸다", () => {
    // 비상 발전기(4~5,10~11) 옆에 축전지, 전력선으로 연결
    let s = withFacilities([{ id: "bat", type: "battery", x: 8, y: 9 }], "power", { x: 8, y: 8, w: 3, h: 3 });
    s = toMorning(gameReducer({ ...s, phase: "maintenance" }, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 10 }, { x: 7, y: 9 }) }));
    const sim = simulatePeriod(s);
    expect(sim.powerNets[0].battery.capacity).toBe(30);
    expect(sim.powerNets[0].battery.delta).toBe(4); // 발전 4, 소비 0
    s = gameReducer(s, { type: "END_PHASE" });
    const charge = s.rooms.find((r) => r.id === "rX")!.facilities[0].charge;
    expect(charge).toBe(4);
    // 발전기를 끄면 축전지로 버틴다: 축전지 충전 10, 작업대(전력 1)
    let t: GameState = { ...s, phase: "morning", actionsLeft: 3 };
    t = { ...t, rooms: t.rooms.map((r) => (r.id === "rX" ? { ...r, facilities: [{ ...r.facilities[0], charge: 10 }] } : r)) };
    const gen = t.rooms.find((r) => r.type === "power" && r.id !== "rX")!;
    t = gameReducer(t, { type: "TOGGLE_FACILITY", roomId: gen.id, facilityId: gen.facilities[0].id });
    const ws = { id: "rW", name: "작업실", type: "workshop" as const, rect: { x: 11, y: 8, w: 3, h: 3 }, facilities: [{ id: "wb", type: "workbench" as const, x: 11, y: 9, rotated: false, durability: 100, enabled: true }] };
    t = { ...t, rooms: [...t.rooms, ws] };
    t = toMorning(gameReducer({ ...t, phase: "maintenance" }, { type: "BUILD_LINES", net: "power", path: linePath({ x: 7, y: 9 }, { x: 10, y: 9 }) }));
    const sim2 = simulatePeriod(t);
    expect(sim2.byId.wb.status).toBe("running");
    expect(sim2.powerNets.find((n) => n.battery.capacity)!.battery.delta).toBe(-1);
  });
  it("양수 펌프: 수도망 원수 공급량 +6", () => {
    let s = withFacilities([{ id: "p1", type: "pump", x: 8, y: 9 }], "water", { x: 8, y: 9, w: 3, h: 3 });
    s = gameReducer({ ...s, phase: "maintenance", resources: { ...s.resources, materials: 60 } }, { type: "BUILD_LINES", net: "water", path: linePath({ x: 1, y: 10 }, { x: 8, y: 10 }) });
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 9 }, { x: 7, y: 9 }) });
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: [{ x: 6, y: 10 }] });
    const sim = simulatePeriod(toMorning(s));
    expect(sim.byId.p1.status).toBe("running");
    expect(sim.waterNets[0].rawCapacity).toBe(8 + Math.floor(6 * 1));
  });
});

describe("숙련", () => {
  it("같은 업무를 계속하면 능력치가 오른다", () => {
    let s = { ...createTestState(1), survivors: [...createTestState(1).survivors, mk("a", { skills: { tech: 1, medic: 1, gather: 2, farm: 1, manage: 1 } })] };
    for (let i = 0; i < xpNeeded(2); i++) s = gainXp(s, "a", "gather");
    expect(s.survivors[1].skills.gather).toBe(3);
    expect(s.survivors[1].xp?.gather).toBe(0);
  });
});

describe("건강 회복 (휴식)", () => {
  it("플레이어 '휴식' 행동: 피로 -10, 60% 확률로 건강 +1~3 (행동 1 소비, 피로 증가 없음)", () => {
    let up = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s0 = createTestState(seed);
      const s = { ...s0, survivors: [{ ...s0.survivors[0], health: 70, fatigue: 50 }] };
      const r = gameReducer(s, { type: "DO_ACTION", actionId: "rest" });
      expect(r.actionsLeft).toBe(2);
      expect(r.survivors[0].fatigue).toBe(40);
      if (r.survivors[0].health > 70) up++;
    }
    expect(up).toBeGreaterThan(40);
    expect(up).toBeLessThan(80);
  });
  it("행동을 안 하고 구간을 넘겨도 플레이어 건강은 저절로 오르지 않는다", () => {
    const s0 = createTestState(3);
    const s = { ...s0, survivors: [{ ...s0.survivors[0], health: 70 }], resources: { ...s0.resources, food: 9, water: 9 } };
    expect(gameReducer(s, { type: "END_PHASE" }).survivors[0].health).toBe(70);
  });
  it("너무 지쳐도 휴식은 할 수 있다", () => {
    const s0 = createTestState(3);
    const tired = { ...s0, survivors: [{ ...s0.survivors[0], fatigue: 100 }] };
    expect(canDoAction(tired, "forage").ok).toBe(false);
    expect(canDoAction(tired, "rest").ok).toBe(true);
  });
});

describe("장기 목표", () => {
  it("동료·구역 개방 목표가 이뤄지면 기록되고 알림이 뜬다", () => {
    let s = toMaintenance({ ...opened(), resources: { ...opened().resources, materials: 40, parts: 15 } });
    s = { ...s, survivors: [...s.survivors, mk("a")] };
    expect(achievedNow(s).has("companion")).toBe(true);
    s = gameReducer(s, { type: "OPEN_ZONE", zoneId: "east" });
    expect(s.goals).toEqual(expect.arrayContaining(["companion", "zone"]));
    expect(s.events.list.some((e) => e.id === "goal-zone")).toBe(true);
  });
  it("30일 전에는 완성되지 않는다", () => {
    let s = toMaintenance({ ...opened(), day: 25, zones: ["east", "southeast", "lower_west", "lower_east"] });
    s = { ...s, survivors: [...s.survivors, ...Array.from({ length: 7 }, (_, i) => mk(`p${i}`, { job: "rest" }))], goals: ["selfFood", "power"] };
    s = gameReducer(s, { type: "SET_CRAFT_TARGET", target: "fuel" });
    expect(s.goals).toContain("allZones");
    expect(s.cityDay).toBeNull();
  });
  it("최종 조건을 모두 이루면 독립 생존 거점 완성", () => {
    let s = toMaintenance({ ...opened(), day: 31, zones: ["east", "southeast", "lower_west", "lower_east"] });
    s = { ...s, survivors: [...s.survivors, ...Array.from({ length: 7 }, (_, i) => mk(`p${i}`, { job: "rest" }))] };
    // 식량 자급: 수확 직전 재배상 여러 개, 전력 30: 발전기 대신 판정용 고효율 발전기 2대
    s = {
      ...s,
      goals: ["selfFood", "power"],
      rooms: s.rooms,
    };
    s = gameReducer({ ...s, goals: [...s.goals] }, { type: "SET_CRAFT_TARGET", target: "fuel" });
    expect(s.cityDay).toBe(31);
    expect(s.goals).toContain("city");
    expect(s.events.list.some((e) => e.id === "goal-city")).toBe(true);
  });
});

describe("저장 변환 (업데이트 4 → 5)", () => {
  it("지하 2층을 맵 아래에 붙이고 옛 변전소를 추가한다", () => {
    const s = createTestState(1);
    const old = s.map.slice(0, 17).map((row) => row.map((t, x) => (x === 3 && t !== "rock" && t !== "platform" ? "track" : t)));
    old[16][3] = "rock";
    const v10: any = {
      ...JSON.parse(JSON.stringify(s)),
      version: 10,
      map: old,
      rooms: s.rooms.filter((r) => r.name !== "옛 변전소"),
      goals: undefined,
      stats: undefined,
      cityDay: undefined,
    };
    const m = migrateSave(v10);
    expect(validateSave(m)).toBe(true);
    expect(m.map.length).toBe(29);
    expect(m.map[16][3]).toBe("sealed");
    expect(m.rooms.some((r: any) => r.name === "옛 변전소")).toBe(true);
  });
});
