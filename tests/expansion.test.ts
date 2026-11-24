import { describe, expect, it } from "vitest";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import { computeAccess } from "@/game/systems/access";
import { canPlaceFacility } from "@/game/systems/space";
import { canOpenZone } from "@/game/systems/zones";
import { capacity } from "@/game/systems/operation";
import { linePath } from "@/game/systems/network";
import type { GameState, Survivor } from "@/game/core/types";
import { generateSurvivor } from "@/game/systems/survivors";
import { opened, toMaintenance, toMorning } from "./helpers";

const rich = (s: GameState): GameState => ({ ...s, resources: { ...s.resources, materials: 55, parts: 25, fuel: 15 } });

describe("구역 개방", () => {
  it("셔터 앞까지 길이 없으면 열 수 없다", () => {
    expect(canOpenZone(toMaintenance(rich(createInitialState(1))), "east").ok).toBe(false);
  });
  it("길이 뚫리면 정비 시간에 자원을 써서 연다. 셔터가 바닥이 되고 안쪽 창고에 닿을 수 있다", () => {
    // 본 구역(29열 왼쪽)만 잔해를 치운 상태
    const base = createInitialState(1);
    let s = toMaintenance(rich({ ...base, map: base.map.map((row) => row.map((t, x) => (x < 29 && t === "debris" ? "floor" : t))) }));
    expect(canOpenZone(toMorning(s), "east").ok).toBe(false); // 낮에는 불가
    expect(canOpenZone(s, "southeast").ok).toBe(false); // 동쪽 대합실 먼저
    expect(canOpenZone(s, "east").ok).toBe(true);
    s = gameReducer(s, { type: "OPEN_ZONE", zoneId: "east" });
    expect(s.zones).toContain("east");
    expect(s.map[4][29]).toBe("floor");
    expect(s.resources.materials).toBe(55 - 15);
    // 동쪽 대합실 안은 아직 잔해 → 창고는 고립
    const store = s.rooms.find((r) => r.name === "버려진 자재 창고")!;
    expect(computeAccess(s).roomAccess[store.id]).toBe(false);
    // 잔해를 치우면 창고 연결 → 저장 용량 +30
    s = { ...s, map: s.map.map((row) => row.map((t) => (t === "debris" ? "floor" : t))) };
    expect(computeAccess(s).roomAccess[store.id]).toBe(true);
    expect(capacity(s).materials).toBe(40 + 15 + 30);
  });
});

describe("고급 설비", () => {
  it("가동 중인 건설 작업대가 있어야 고급 설비를 지을 수 있다", () => {
    let s = toMaintenance(rich(opened()));
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 4, w: 3, h: 3 }, roomType: "storage" });
    const store = s.rooms[s.rooms.length - 1];
    s = { ...s, resources: { ...s.resources, materials: 55 } };
    expect(canPlaceFacility(s, store.id, "large_storage", 8, 4, false).ok).toBe(false);
    // 작업실 + 건설 작업대 + 발전기와 잇는 전력선
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 9, w: 3, h: 3 }, roomType: "workshop" });
    const ws = s.rooms[s.rooms.length - 1];
    s = { ...s, resources: { ...s.resources, materials: 55 } };
    s = gameReducer(s, { type: "PLACE_FACILITY", roomId: ws.id, facilityType: "builder_bench", x: 8, y: 9, rotated: false });
    expect(canPlaceFacility(s, store.id, "large_storage", 8, 4, false).ok).toBe(false); // 전력 없음
    s = gameReducer(s, { type: "BUILD_LINES", net: "power", path: linePath({ x: 6, y: 10 }, { x: 7, y: 10 }) });
    s = { ...s, resources: { ...s.resources, materials: 55 } };
    expect(canPlaceFacility(s, store.id, "large_storage", 8, 4, false).ok).toBe(true);
  });
});

describe("공동 생활실", () => {
  it("식탁이 있으면 쉬는 생존자의 피로 회복 +10", () => {
    let s = toMaintenance(rich(opened()));
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 4, w: 3, h: 3 }, roomType: "common" });
    const room = s.rooms[s.rooms.length - 1];
    s = gameReducer(s, { type: "PLACE_FACILITY", roomId: room.id, facilityType: "dining_table", x: 8, y: 4, rotated: false });
    const w: Survivor = { ...generateSurvivor(3, "w1", [])[0], job: "rest", fatigue: 60, health: 80 };
    s = toMorning({ ...s, survivors: [...s.survivors, w], resources: { ...s.resources, food: 10, water: 10 } });
    s = gameReducer(s, { type: "END_PHASE" });
    expect(s.survivors[1].fatigue).toBe(60 - 20 - 10);
  });
});

describe("저장 데이터 변환 (6단계 → 업데이트 1)", () => {
  it("좁은 맵의 예전 저장 데이터에 확장 구역을 붙이고, 치운 잔해는 유지한다", () => {
    const s = createInitialState(1);
    const narrow = s.map.map((row) => row.slice(0, 30).map((t) => (t === "sealed" ? "rock" : t)));
    narrow[1][13] = "floor"; // 플레이어가 치운 칸
    const v6: any = { ...s, version: 6, map: narrow, rooms: s.rooms.filter((r) => r.rect.x < 29), zones: undefined };
    const migrated = migrateSave(JSON.parse(JSON.stringify(v6)));
    expect(validateSave(migrated)).toBe(true);
    expect(migrated.map[0].length).toBe(46);
    expect(migrated.map[1][13]).toBe("floor");
    expect(migrated.map[4][29]).toBe("sealed");
    expect(migrated.rooms.some((r: any) => r.name === "버려진 자재 창고")).toBe(true);
  });
});
