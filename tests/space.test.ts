import { describe, expect, it } from "vitest";
import { STATION_LAYOUT } from "@/game/config/map";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import * as space from "@/game/systems/space";
import { computeAccess } from "@/game/systems/access";
import type { GameState } from "@/game/core/types";
import { opened, toMaintenance } from "./helpers";

// 건설 규칙 테스트는 잔해를 치운 맵의 정비 시간에서 진행
const fresh = (): GameState => toMaintenance(opened());

describe("시작 맵", () => {
  it("모든 줄 길이가 같다", () => {
    const w = STATION_LAYOUT[0].length;
    expect(STATION_LAYOUT.every((r) => r.length === w)).toBe(true);
  });
  it("임시 거주 구역만 출입 가능하고, 발전실·옛 창고는 잔해에 막혀 고립되어 있다", () => {
    const s = createInitialState(1);
    const access = computeAccess(s);
    const byName = (n: string) => s.rooms.find((r) => r.name === n)!;
    for (const r of s.rooms) expect(space.validateRoomRect(s, r.rect, r.type, r.id)).toBeNull();
    expect(access.roomAccess[byName("임시 거주 구역").id]).toBe(true);
    expect(access.roomAccess[byName("비상 발전실").id]).toBe(false);
    expect(access.roomAccess[byName("옛 창고").id]).toBe(false);
    // 정리된 바닥은 거주 구역 주변뿐
    const floor = s.map.slice(0, 17).flatMap((row) => row.slice(0, 29)).filter((t) => t === "floor").length;
    expect(floor).toBeLessThan(50);
  });
});

describe("방 생성", () => {
  it("빈 바닥에 방을 만들고 자재를 소비한다", () => {
    const s = fresh();
    const s2 = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 4, w: 4, h: 3 }, roomType: "workshop" });
    expect(s2.rooms.length).toBe(s.rooms.length + 1);
    expect(s2.resources.materials).toBe(s.resources.materials - (4 + 12));
  });
  it("잔해·기둥·승강장·겹침·최소 크기·자원 부족을 막는다", () => {
    const real = toMaintenance(createInitialState(1));
    expect(space.canCreateRoom(real, { x: 1, y: 1, w: 3, h: 2 }, "storage").ok).toBe(false); // 잔해
    const s = fresh();
    expect(space.canCreateRoom(s, { x: 6, y: 3, w: 3, h: 2 }, "storage").ok).toBe(false); // 기둥(7,3)
    expect(space.canCreateRoom(s, { x: 9, y: 12, w: 3, h: 2 }, "storage").ok).toBe(false); // 승강장
    expect(space.canCreateRoom(s, { x: 13, y: 4, w: 3, h: 3 }, "storage").ok).toBe(false); // 겹침
    expect(space.canCreateRoom(s, { x: 9, y: 4, w: 2, h: 2 }, "power").ok).toBe(false); // 최소 크기
    const poor: GameState = { ...s, resources: { ...s.resources, materials: 3 } };
    expect(space.canCreateRoom(poor, { x: 9, y: 4, w: 2, h: 2 }, "storage").ok).toBe(false);
  });
  it("정비 시간이 아니면 건설할 수 없다", () => {
    const s: GameState = { ...fresh(), phase: "morning" };
    expect(space.canCreateRoom(s, { x: 9, y: 4, w: 3, h: 3 }, "storage").ok).toBe(false);
  });
});

describe("방 크기 변경·철거", () => {
  it("확장 시 추가 칸만큼 비용, 축소 시 일부 환급", () => {
    let s = gameReducer(fresh(), { type: "CREATE_ROOM", rect: { x: 8, y: 4, w: 3, h: 3 }, roomType: "storage" });
    const id = s.rooms[s.rooms.length - 1].id;
    const before = s.resources.materials;
    s = gameReducer(s, { type: "RESIZE_ROOM", roomId: id, rect: { x: 8, y: 4, w: 4, h: 3 } });
    expect(s.resources.materials).toBe(before - 3);
    s = gameReducer(s, { type: "RESIZE_ROOM", roomId: id, rect: { x: 8, y: 4, w: 2, h: 3 } });
    expect(s.resources.materials).toBe(before - 3 + 3); // 6칸 축소 → 3 환급
  });
  it("시설이 밖으로 벗어나는 축소는 막는다", () => {
    const s = fresh();
    const res = s.rooms.find((r) => r.type === "residence")!;
    expect(space.canResizeRoom(s, res.id, { x: 13, y: 3, w: 2, h: 3 }).ok).toBe(false);
  });
  it("시설이 있는 방은 철거할 수 없다", () => {
    const s = fresh();
    expect(space.canDeleteRoom(s, s.rooms[0].id).ok).toBe(false);
  });
});

describe("시설 배치", () => {
  it("용도에 맞는 방 안에만, 겹치지 않게 설치한다", () => {
    const s = fresh();
    const res = s.rooms.find((r) => r.type === "residence")!; // (12,3) 3×3, 침상 (12,3) 2×1
    expect(space.canPlaceFacility(s, res.id, "cot", 12, 4, false).ok).toBe(true);
    expect(space.canPlaceFacility(s, res.id, "cot", 12, 3, false).ok).toBe(false); // 기존 침상과 겹침
    expect(space.canPlaceFacility(s, res.id, "cot", 14, 4, false).ok).toBe(false); // 방 밖
    expect(space.canPlaceFacility(s, res.id, "cot", 14, 4, true).ok).toBe(true); // 회전하면 들어감
    expect(space.canPlaceFacility(s, res.id, "workbench", 12, 4, false).ok).toBe(false); // 용도 불일치
  });
  it("설치·이동·철거가 자원과 함께 처리된다", () => {
    let s = fresh();
    const res = s.rooms.find((r) => r.type === "residence")!;
    const m0 = s.resources.materials;
    s = gameReducer(s, { type: "PLACE_FACILITY", roomId: res.id, facilityType: "locker", x: 14, y: 5, rotated: false });
    expect(s.resources.materials).toBe(m0 - 3);
    const fac = space.getRoom(s, res.id)!.facilities.find((f) => f.type === "locker")!;
    s = gameReducer(s, { type: "MOVE_FACILITY", roomId: res.id, facilityId: fac.id, x: 13, y: 5, rotated: false });
    expect(space.getRoom(s, res.id)!.facilities.find((f) => f.id === fac.id)!.x).toBe(13);
    s = gameReducer(s, { type: "REMOVE_FACILITY", roomId: res.id, facilityId: fac.id });
    expect(s.resources.materials).toBe(m0 - 3 + 1);
  });
  it("고정 설비(비상 발전기)는 옮기거나 철거할 수 없다", () => {
    const s = fresh();
    const pw = s.rooms.find((r) => r.type === "power")!;
    const gen = pw.facilities[0];
    expect(space.canRemoveFacility(s, pw.id, gen.id).ok).toBe(false);
    expect(space.canMoveFacility(s, pw.id, gen.id, 3, 9, false).ok).toBe(false);
  });
});

describe("출입 판정", () => {
  it("잔해를 치운 맵에서는 봉쇄 구역 밖의 모든 방이 출입 가능", () => {
    const s = fresh();
    const access = computeAccess(s);
    expect(s.rooms.filter((r) => r.rect.x < 29 && r.rect.y < 17).every((r) => access.roomAccess[r.id])).toBe(true);
    expect(access.roomAccess[s.rooms.find((r) => r.name === "버려진 자재 창고")!.id]).toBe(false);
  });
  it("통로를 막으면 방이 고립된다", () => {
    let s = { ...fresh(), resources: { ...fresh().resources, materials: 40 } };
    // 출입구(14~15,0) 바로 아래를 가로로 막는 방
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 8, y: 1, w: 14, h: 2 }, roomType: "storage" });
    const access = computeAccess(s);
    expect(s.rooms.filter((r) => !access.roomAccess[r.id]).length).toBeGreaterThan(0);
  });
});

describe("저장 데이터 검증", () => {
  it("정상 데이터는 통과, 손상 데이터는 거부, 예전 버전은 변환", () => {
    const s = createInitialState(1);
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toBe(true);
    expect(validateSave({ ...s, version: 99 })).toBe(false);
    expect(validateSave({ ...s, rooms: [{ id: "x" }] })).toBe(false);
    expect(validateSave(null)).toBe(false);
    const v1: any = { ...s, version: 1, seed: undefined, lastAction: undefined, lines: undefined };
    v1.rooms = s.rooms.map((r) => ({ ...r, facilities: r.facilities.map(({ enabled, ...f }) => f) }));
    expect(validateSave(migrateSave(v1))).toBe(true);
  });
});
