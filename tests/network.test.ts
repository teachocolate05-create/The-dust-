import { describe, expect, it } from "vitest";
import { createTestState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { canBuildLines, computeNets, linePath } from "@/game/systems/network";
import { simulatePeriod } from "@/game/systems/operation";
import { opened, rich, toMaintenance, toMorning } from "./helpers";

describe("전력선·수도관 설치", () => {
  it("ㄱ자 경로를 만든다", () => {
    expect(linePath({ x: 1, y: 1 }, { x: 3, y: 2 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ]);
  });
  it("칸당 비용, 이미 깔린 칸은 무료, 정비 시간에만", () => {
    const s = toMaintenance(rich(opened()));
    const path = linePath({ x: 8, y: 4 }, { x: 11, y: 4 });
    const c = canBuildLines(s, "power", path);
    expect(c.ok && c.cost.materials).toBe(4);
    const s2 = gameReducer(s, { type: "BUILD_LINES", net: "power", path });
    expect(s2.resources.materials).toBe(s.resources.materials - 4);
    const c2 = canBuildLines(s2, "power", linePath({ x: 8, y: 4 }, { x: 12, y: 4 }));
    expect(c2.ok && c2.cost.materials).toBe(1);
    const w = canBuildLines(s, "water", path);
    expect(w.ok && w.cost.materials).toBe(8);
    expect(canBuildLines(toMorning(s), "power", path).ok).toBe(false);
  });
  it("잔해·기둥 위에는 설치 불가", () => {
    const real = toMaintenance(createTestState(1));
    expect(canBuildLines(real, "power", [{ x: 1, y: 1 }]).ok).toBe(false);
    expect(canBuildLines(toMaintenance(opened()), "power", [{ x: 7, y: 3 }]).ok).toBe(false);
  });
  it("철거하면 절반 회수", () => {
    let s = toMaintenance(rich(opened()));
    const path = linePath({ x: 8, y: 4 }, { x: 11, y: 4 });
    s = gameReducer(s, { type: "BUILD_LINES", net: "water", path });
    const m = s.resources.materials;
    s = gameReducer(s, { type: "REMOVE_LINES", net: "water", path });
    expect(s.lines.water.length).toBe(0);
    expect(s.resources.materials).toBe(m + 4);
  });
});

describe("망 연결", () => {
  it("끊긴 선은 서로 다른 망, 시설이 양쪽에 닿으면 하나로 합쳐진다", () => {
    let s = toMaintenance(rich(opened()));
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: linePath({ x: 2, y: 8 }, { x: 4, y: 8 }) });
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: linePath({ x: 7, y: 10 }, { x: 7, y: 11 }) });
    // (2~4,8)은 발전기(4~5,10~11)에 닿지 않음 / (7,10)도 닿지 않음 → 망 2개, 발전기 미연결
    let nets = computeNets(s, "power");
    expect(nets.ids.length).toBe(2);
    const genId = s.rooms.find((r) => r.type === "power")!.facilities[0].id;
    expect(nets.facilityNet[genId]).toBeUndefined();
    // 발전기 위(4,9)와 오른쪽(6,10)에 선 → 두 묶음이 발전기를 통해 합쳐짐
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: [{ x: 4, y: 9 }] });
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: [{ x: 6, y: 10 }] });
    nets = computeNets(s, "power");
    expect(nets.ids.length).toBe(1);
    expect(nets.facilityNet[genId]).toBe(1);
  });
  it("수도관이 급수원 옆을 지나면 급수원 연결", () => {
    let s = toMaintenance(rich(opened()));
    s = gameReducer(s, { type: "BUILD_LINES", net: "water", path: linePath({ x: 1, y: 8 }, { x: 3, y: 8 }) });
    expect(computeNets(s, "water").sources[1]).toBe(1);
  });
  it("급수원 1곳의 원수(8)로는 정수 필터 2대까지만 가동", () => {
    let s = toMaintenance({ ...opened(), resources: { ...opened().resources, materials: 80, parts: 25 } });
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 8, w: 6, h: 2 }, roomType: "water" });
    const room = s.rooms[s.rooms.length - 1];
    for (const x of [8, 10, 12])
      s = gameReducer(s, { type: "PLACE_FACILITY", roomId: room.id, facilityType: "filter", x, y: 8, rotated: false });
    // 발전기 수리해 효율 100% (전력 6 = 필터 3대분)
    s = gameReducer(s, { type: "REPAIR_FACILITY", roomId: s.rooms.find((r) => r.type === "power")!.id, facilityId: s.rooms.find((r) => r.type === "power")!.facilities[0].id });
    s = { ...s, resources: { ...s.resources, materials: 80 } };
    // 전력선과 수도관은 같은 칸을 함께 지날 수 있다
    s = gameReducer(s, { type: "BUILD_LINES", net: "water", path: linePath({ x: 1, y: 10 }, { x: 13, y: 10 }) });
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 10 }, { x: 13, y: 10 }) });
    const sim = simulatePeriod(toMorning(s));
    const statuses = s.rooms.find((r) => r.id === room.id)!.facilities.map((f) => sim.byId[f.id].status);
    expect(statuses.filter((x) => x === "running").length).toBe(2);
    expect(statuses).toContain("noRawWater");
  });
});
