import { describe, expect, it } from "vitest";
import { STATION_LAYOUT } from "@/game/config/map";
import { createInitialState } from "@/game/state/initialState";
import { gameReducer } from "@/game/state/reducer";
import { migrateSave, validateSave } from "@/game/state/save";
import * as space from "@/game/systems/space";
import { computeAccess } from "@/game/systems/access";
import type { GameState } from "@/game/core/types";

// 건설 규칙 테스트는 정비 시간에서 진행
const fresh = (): GameState => ({ ...createInitialState(1), phase: "maintenance", actionsLeft: 0 });

describe("맵 설정", () => {
  it("모든 줄 길이가 같다", () => {
    const w = STATION_LAYOUT[0].length;
    expect(STATION_LAYOUT.every((r) => r.length === w)).toBe(true);
  });
  it("시작 방들은 규칙에 맞고 출입 가능하다", () => {
    const s = fresh();
    const access = computeAccess(s);
    for (const r of s.rooms) {
      expect(space.validateRoomRect(s, r.rect, r.type, r.id)).toBeNull();
      expect(access.roomAccess[r.id]).toBe(true);
    }
  });
});

describe("방 생성", () => {
  it("빈 바닥에 방을 만들고 자재를 소비한다", () => {
    const s = fresh();
    const rect = { x: 12, y: 9, w: 4, h: 3 };
    const s2 = gameReducer(s, { type: "CREATE_ROOM", rect, roomType: "workshop" });
    expect(s2.rooms.length).toBe(s.rooms.length + 1);
    expect(s2.resources.materials).toBe(s.resources.materials - (4 + 12));
  });
  it("잔해·기둥·승강장·겹침·최소 크기·자원 부족을 막는다", () => {
    const s = fresh();
    expect(space.canCreateRoom(s, { x: 1, y: 1, w: 3, h: 2 }, "storage").ok).toBe(false); // 잔해
    expect(space.canCreateRoom(s, { x: 6, y: 3, w: 3, h: 2 }, "storage").ok).toBe(false); // 기둥(7,3)
    expect(space.canCreateRoom(s, { x: 9, y: 12, w: 3, h: 2 }, "storage").ok).toBe(false); // 승강장
    expect(space.canCreateRoom(s, { x: 9, y: 10, w: 3, h: 2 }, "storage").ok).toBe(false); // 겹침
    expect(space.canCreateRoom(s, { x: 12, y: 9, w: 2, h: 2 }, "power").ok).toBe(false); // 최소 크기
    const poor: GameState = { ...s, resources: { ...s.resources, materials: 3 } };
    expect(space.canCreateRoom(poor, { x: 12, y: 9, w: 2, h: 2 }, "storage").ok).toBe(false);
  });
  it("정비 시간이 아니면 건설할 수 없다", () => {
    const s: GameState = { ...fresh(), phase: "morning" };
    expect(space.canCreateRoom(s, { x: 9, y: 4, w: 3, h: 3 }, "storage").ok).toBe(false);
  });
});

describe("방 크기 변경·철거", () => {
  it("확장 시 추가 칸만큼 비용, 축소 시 일부 환급", () => {
    let s = gameReducer(fresh(), { type: "CREATE_ROOM", rect: { x: 13, y: 4, w: 3, h: 3 }, roomType: "storage" });
    const id = s.rooms[s.rooms.length - 1].id;
    const before = s.resources.materials;
    s = gameReducer(s, { type: "RESIZE_ROOM", roomId: id, rect: { x: 13, y: 4, w: 4, h: 3 } });
    expect(s.resources.materials).toBe(before - 3);
    s = gameReducer(s, { type: "RESIZE_ROOM", roomId: id, rect: { x: 13, y: 4, w: 2, h: 3 } });
    expect(s.resources.materials).toBe(before - 3 + 3); // 6칸 축소 → 3 환급
  });
  it("시설이 밖으로 벗어나는 축소는 막는다", () => {
    const s = fresh();
    const res = s.rooms.find((r) => r.type === "residence")!;
    expect(space.canResizeRoom(s, res.id, { x: 9, y: 9, w: 3, h: 3 }).ok).toBe(false);
  });
  it("시설이 있는 방은 철거할 수 없다", () => {
    const s = fresh();
    expect(space.canDeleteRoom(s, s.rooms[0].id).ok).toBe(false);
  });
});

describe("시설 배치", () => {
  it("용도에 맞는 방 안에만, 겹치지 않게 설치한다", () => {
    const s = fresh();
    const res = s.rooms.find((r) => r.type === "residence")!;
    expect(space.canPlaceFacility(s, res.id, "cot", 8, 10, false).ok).toBe(true);
    expect(space.canPlaceFacility(s, res.id, "cot", 8, 9, false).ok).toBe(false); // 기존 침상과 겹침
    expect(space.canPlaceFacility(s, res.id, "cot", 11, 10, false).ok).toBe(false); // 방 밖
    expect(space.canPlaceFacility(s, res.id, "cot", 11, 10, true).ok).toBe(true); // 회전하면 들어감
    expect(space.canPlaceFacility(s, res.id, "workbench", 8, 10, false).ok).toBe(false); // 용도 불일치
  });
  it("설치·이동·철거가 자원과 함께 처리된다", () => {
    let s = fresh();
    const res = s.rooms.find((r) => r.type === "residence")!;
    const m0 = s.resources.materials;
    s = gameReducer(s, { type: "PLACE_FACILITY", roomId: res.id, facilityType: "locker", x: 11, y: 11, rotated: false });
    expect(s.resources.materials).toBe(m0 - 3);
    const fac = space.getRoom(s, res.id)!.facilities.find((f) => f.type === "locker")!;
    s = gameReducer(s, { type: "MOVE_FACILITY", roomId: res.id, facilityId: fac.id, x: 10, y: 11, rotated: false });
    expect(space.getRoom(s, res.id)!.facilities.find((f) => f.id === fac.id)!.x).toBe(10);
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
  it("통로가 막히면 방이 고립된다", () => {
    let s = fresh();
    // 출입구에서 내려오는 통로(4칸 폭)를 가로로 막는 방 → 그 아래 모든 통로가 끊긴다
    s = gameReducer(s, { type: "CREATE_ROOM", rect: { x: 13, y: 4, w: 4, h: 2 }, roomType: "storage" });
    const access = computeAccess(s);
    const isolated = s.rooms.filter((r) => !access.roomAccess[r.id]);
    expect(isolated.length).toBeGreaterThan(0);
  });
});

describe("저장 데이터 검증", () => {
  it("정상 데이터는 통과, 손상 데이터는 거부", () => {
    const s = fresh();
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toBe(true);
    expect(validateSave({ ...s, version: 99 })).toBe(false);
    expect(validateSave(migrateSave({ ...s, version: 1, seed: undefined, lastAction: undefined }))).toBe(true);
    expect(validateSave({ ...s, rooms: [{ id: "x" }] })).toBe(false);
    expect(validateSave(null)).toBe(false);
  });
});
